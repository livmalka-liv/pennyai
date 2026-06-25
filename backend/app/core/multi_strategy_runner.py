"""
Multi-strategy runner — manages multiple StrategyConfig objects running
simultaneously against live market data.

Slippage model: identical to backtest_engine
  entry cost  = max(user_slippage, $0.02/share) + half bid-ask spread
  exit cost   = max(user_slippage, $0.02/share) + half bid-ask spread
TP/SL:       read from strategy exit rules (default +20% / -7%)
Parallelism: up to 15 strategies evaluated concurrently per user
"""

import uuid
import asyncio
import logging
from datetime import datetime, timezone, date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.db_models import StrategyTracker, PaperTrade
from app.data.types import CatalystDay

logger = logging.getLogger(__name__)

ISRAEL_UTC_OFFSET = 3   # summer IDT UTC+3
ET_UTC_OFFSET     = -4  # summer EDT UTC-4
POSITION_DOLLARS  = 1000

# In-memory price cache — refreshed on every data fetch
_latest_prices: dict[str, float] = {}

# In-memory catalyst days — refreshed every ~5s, evaluated every 1s
_latest_catalyst_days: list[CatalystDay] = []

# Last known data source ("ibkr" / "yahoo" / "mock")
_last_data_source: str = "none"

# Semaphore: at most 15 strategy evaluations running concurrently
_SCAN_SEM: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _SCAN_SEM
    if _SCAN_SEM is None:
        _SCAN_SEM = asyncio.Semaphore(15)
    return _SCAN_SEM


# ─── Slippage helpers (mirrors backtest_engine) ─────────────────────────────

_MIN_SLIP_PER_SHARE = 0.02


def _spread_pct(price: float) -> float:
    """Half bid-ask spread for a penny stock at this price tier."""
    if price < 1.0:
        return 1.5
    elif price < 3.0:
        return 1.0
    elif price < 10.0:
        return 0.5
    elif price < 20.0:
        return 0.25
    return 0.1


def _slip_pct(price: float, user_pct: float) -> float:
    """Effective slippage %: worse of user-set % or $0.02/share floor."""
    return max(user_pct, (_MIN_SLIP_PER_SHARE / price) * 100)


def _entry_cost_pct(price: float, user_slip: float) -> float:
    return _slip_pct(price, user_slip) + _spread_pct(price)


def _exit_cost_pct(price: float, user_slip: float) -> float:
    return _slip_pct(price, user_slip) + _spread_pct(price)


def _apply_entry(price: float, user_slip: float) -> float:
    """Realistic fill price when buying (we pay more)."""
    return round(price * (1 + _entry_cost_pct(price, user_slip) / 100), 4)


def _apply_exit(price: float, user_slip: float) -> float:
    """Realistic fill price when selling (we receive less)."""
    return round(price * (1 - _exit_cost_pct(price, user_slip) / 100), 4)


# ─── TP / SL from strategy config ────────────────────────────────────────────

def _convert_rule(raw: dict) -> dict:
    """Convert raw DB rule format {field/operator/value/signal} → StrategyConfig rule {condition/parameters}."""
    rtype = raw.get("type", "filter")

    if "signal" in raw:
        sig = raw["signal"]
        if sig == "hod":
            return {"type": "entry", "condition": "Break above High of Day", "parameters": {"indicator": "HOD"}}
        elif sig == "vwap_reclaim":
            return {"type": "entry", "condition": "VWAP reclaim after consolidation below",
                    "parameters": {"indicator": "VWAP", "direction": "hold_bounce"}}
        return {"type": "entry", "condition": sig, "parameters": {}}

    if "field" in raw:
        field, op, value = raw["field"], raw.get("operator", ""), raw.get("value")
        if rtype == "exit" and field == "pct":
            pct = float(value)
            if pct > 0:
                return {"type": "exit", "condition": f"Take Profit at +{pct}%", "parameters": {"pct": pct}}
            return {"type": "exit", "condition": f"Stop Loss at {pct}%", "parameters": {"pct": pct}}
        if field == "change_pct":
            v = float(value)
            return {"type": "filter", "condition": f"Change > {v}%", "parameters": {"minChange": v}}
        if field == "rvol":
            v = float(value)
            return {"type": "filter", "condition": f"Relative Volume > {v}x", "parameters": {"minRvol": v}}
        if field == "float_shares":
            v = int(value)
            return {"type": "filter", "condition": f"Float < {v // 1_000_000}M shares", "parameters": {"maxFloat": v}}
        if field == "price":
            if op == "between" and isinstance(value, list):
                return {"type": "filter", "condition": f"Price ${value[0]}-${value[1]}",
                        "parameters": {"minPrice": float(value[0]), "maxPrice": float(value[1])}}
            if op in ("lte", "lt"):
                return {"type": "filter", "condition": f"Price < ${float(value)}", "parameters": {"maxPrice": float(value)}}
            return {"type": "filter", "condition": f"Price > ${float(value)}", "parameters": {"minPrice": float(value)}}

    if "condition" in raw:
        return raw
    return {"type": rtype, "condition": str(raw.get("field", raw.get("signal", "unknown"))), "parameters": {}}


def _unwrap_config(config_dict: dict) -> dict:
    """Handle both flat/nested formats and convert raw DB rules to StrategyConfig format."""
    if "strategy" in config_dict and isinstance(config_dict.get("strategy"), dict):
        config_dict = config_dict["strategy"]

    if "rules" in config_dict and isinstance(config_dict["rules"], list):
        config_dict = dict(config_dict)
        config_dict["rules"] = [
            r if "condition" in r else _convert_rule(r)
            for r in config_dict["rules"]
        ]

    if "description" not in config_dict:
        config_dict = dict(config_dict)
        config_dict["description"] = config_dict.get("name", "")

    return config_dict


def _tp_sl_pct(config_dict: dict) -> tuple[float, float]:
    """
    Parse exit rules from strategy config.
    Returns (tp_pct, sl_pct_positive).  Defaults: +20%, 7%.
    """
    try:
        from app.models.schemas import StrategyConfig, RuleType
        sc = StrategyConfig(**_unwrap_config(config_dict))
        tp_pct, sl_pct = 20.0, 7.0
        for rule in sc.rules:
            if rule.type == RuleType.EXIT:
                pct = rule.parameters.get("pct", 0)
                if pct > 0:
                    tp_pct = float(pct)
                elif pct < 0:
                    sl_pct = float(abs(pct))
        return tp_pct, sl_pct
    except Exception:
        return 20.0, 7.0


def _user_slip(config_dict: dict) -> float:
    try:
        from app.models.schemas import StrategyConfig
        return StrategyConfig(**_unwrap_config(config_dict)).slippage or 0.0
    except Exception:
        return 0.0


# ─── Time helpers ─────────────────────────────────────────────────────────────

def _is_market_open() -> bool:
    """US regular session 9:30–16:00 ET."""
    now = datetime.now(timezone.utc)
    et_total = ((now.hour + ET_UTC_OFFSET) % 24) * 60 + now.minute
    return 9 * 60 + 30 <= et_total < 16 * 60


def _is_in_scan_window() -> bool:
    """11:00–23:00 Israel time, Mon–Fri."""
    now = datetime.now(timezone.utc)
    il_hour = (now.hour + ISRAEL_UTC_OFFSET) % 24
    dow = now.weekday()
    if dow >= 5:
        return False
    return 11 <= il_hour < 23


def _et_hhmm() -> str:
    now = datetime.now(timezone.utc)
    h = (now.hour + ET_UTC_OFFSET) % 24
    return f"{h:02d}:{now.minute:02d}"


def _il_hhmm() -> str:
    now = datetime.now(timezone.utc)
    h = (now.hour + ISRAEL_UTC_OFFSET) % 24
    return f"{h:02d}:{now.minute:02d}"


def _hold_minutes(entry_et: str, exit_et: str) -> int:
    """Minutes between two HH:MM strings (ET). Handles midnight crossings."""
    try:
        eh, em = int(entry_et[:2]), int(entry_et[3:])
        xh, xm = int(exit_et[:2]), int(exit_et[3:])
        return max(1, (xh * 60 + xm) - (eh * 60 + em))
    except Exception:
        return 1


# ─── Fast TP/SL check (every 1 second) ───────────────────────────────────────

async def check_tp_sl_fast(db: Session) -> int:
    """
    Check all open signals against the in-memory price cache.
    Called every second by the continuous scanner loop.
    Applies realistic exit slippage before recording the exit price.
    """
    if not _latest_prices:
        return 0

    today = date.today().isoformat()
    open_trades = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_id.like("custom:%"),
            PaperTrade.trade_date == today,
            PaperTrade.status == "open",
        )
        .all()
    )
    if not open_trades:
        return 0

    exit_et = _et_hhmm()
    closed = 0

    for trade in open_trades:
        price = _latest_prices.get(trade.ticker)
        if price is None:
            continue

        raw_tp = trade.tp_price
        raw_sl = trade.sl_price

        hit_tp = raw_tp is not None and price >= raw_tp
        hit_sl = raw_sl is not None and price <= raw_sl

        if not hit_tp and not hit_sl:
            continue

        # Use $0.02/share floor slippage (no user config in fast path)
        if hit_tp and (not hit_sl or raw_tp <= raw_sl):  # type: ignore[operator]
            raw_exit = raw_tp
            trade.status = "win"
            trade.exit_reason = "TP"
        else:
            raw_exit = raw_sl
            trade.status = "loss"
            trade.exit_reason = "SL"

        # Apply exit slippage
        actual_exit = _apply_exit(raw_exit, 0.0)  # 0% user slip — floor applies
        trade.exit_price = actual_exit
        trade.exit_time = exit_et
        trade.hold_minutes = _hold_minutes(trade.entry_time_et, exit_et)
        trade.return_pct = round(
            (actual_exit - trade.entry_price) / trade.entry_price * 100, 2
        )
        trade.dollars_gain = round(
            (actual_exit - trade.entry_price) / trade.entry_price * POSITION_DOLLARS, 2
        )
        closed += 1

    if closed:
        db.commit()
        logger.info(f"check_tp_sl_fast: closed {closed} signals")
    return closed


# ─── Single strategy evaluator ───────────────────────────────────────────────

async def _eval_strategy(
    entry: dict,
    catalyst_days: list[CatalystDay],
    entry_time_et: str,
    entry_time_il: str,
) -> list[dict]:
    """Evaluate one strategy against catalyst_days. Runs inside semaphore."""
    async with _get_semaphore():
        from app.core.backtest_engine import _apply_filters, _candles_to_df, _detect_entry_signal
        from app.models.schemas import StrategyConfig

        config_dict = _unwrap_config(entry.get("config") or {})
        strategy_name = entry.get("name", config_dict.get("name", "Unknown"))

        try:
            strategy = StrategyConfig(**config_dict)
        except Exception as exc:
            logger.warning(f"_eval_strategy: invalid config for '{strategy_name}': {exc}")
            return []

        user_slip = strategy.slippage or 0.0
        tp_pct, sl_pct = _tp_sl_pct(config_dict)

        # Run CPU-bound pandas work in thread pool so it doesn't block the event loop
        loop = asyncio.get_event_loop()

        def _cpu_eval() -> list[dict]:
            filtered = _apply_filters(catalyst_days, strategy)
            results: list[dict] = []
            for day in filtered:
                if not day.candles_1m:
                    continue
                try:
                    df = _candles_to_df(day.candles_1m)
                    signal = _detect_entry_signal(df, strategy)
                    if signal is None:
                        continue
                    _entry_min, raw_price = signal
                    actual_entry = _apply_entry(raw_price, user_slip)
                    results.append({
                        "strategy_name": strategy_name,
                        "ticker": day.ticker,
                        "raw_entry": round(raw_price, 4),
                        "entry_price": actual_entry,
                        "tp_pct": tp_pct,
                        "sl_pct": sl_pct,
                        "user_slip": user_slip,
                        "catalyst_type": day.catalyst_type,
                        "rvol": round(day.rvol, 1),
                        "trade_date": str(day.date),
                        "entry_time_et": entry_time_et,
                        "entry_time_il": entry_time_il,
                    })
                except Exception as exc:
                    logger.warning(f"_eval_strategy: {day.ticker}/{day.date} / '{strategy_name}': {exc}")
            return results

        return await loop.run_in_executor(None, _cpu_eval)


# ─── Price cache refresh (no strategies needed) ───────────────────────────────

async def _refresh_price_cache_only() -> None:
    """Fetch today's movers and update _latest_prices without needing active strategies.
    Called on every scan tick so /scan-status always shows real tracked tickers."""
    global _latest_prices, _last_data_source
    from app.core.config import get_settings
    settings = get_settings()

    catalyst_days: list[CatalystDay] = []
    source = "none"
    try:
        from app.data.yahoo_provider import get_todays_movers as yahoo_movers
        catalyst_days = await yahoo_movers()
        if catalyst_days:
            source = "yahoo"
    except Exception as exc:
        logger.debug(f"_refresh_price_cache_only yahoo: {exc}")

    if not catalyst_days and not settings.use_mock_data and settings.polygon_api_key:
        try:
            from app.data.polygon_provider import get_todays_movers
            catalyst_days = get_todays_movers(settings.polygon_api_key)
            if catalyst_days:
                source = "polygon"
        except Exception as exc:
            logger.debug(f"_refresh_price_cache_only polygon: {exc}")

    if catalyst_days:
        _last_data_source = source

    for day in catalyst_days:
        if day.candles_1m:
            _latest_prices[day.ticker] = day.candles_1m[-1].close

    # Update the shared catalyst days cache used by per-second evaluation
    global _latest_catalyst_days
    if catalyst_days:
        _latest_catalyst_days = catalyst_days


# ─── Per-second strategy evaluation (no network) ──────────────────────────────

async def evaluate_on_cached_data(db: Session) -> int:
    """
    Evaluate ALL active strategies (all users) against shared cached data in parallel.
    No network calls — called every second for instant setup detection.
    Data is refreshed separately every ~5 seconds.
    """
    global _latest_catalyst_days
    if not _latest_catalyst_days:
        return 0

    q = db.query(StrategyTracker).filter(StrategyTracker.is_active == True)  # noqa: E712
    trackers = q.all()
    if not trackers:
        return 0

    entry_time_et = _et_hhmm()
    entry_time_il = _il_hhmm()
    today = date.today().isoformat()

    from collections import defaultdict
    by_user: dict[str, list] = defaultdict(list)
    for t in trackers:
        if t.user_id:
            by_user[t.user_id].append(t)

    uid_list = list(by_user.keys())

    # All users evaluated simultaneously on the same cached snapshot
    gather_results = await asyncio.gather(
        *[
            _fetch_and_signal(
                uid, by_user[uid],
                catalyst_days_override=_latest_catalyst_days,
                db=db,
                entry_time_et=entry_time_et,
                entry_time_il=entry_time_il,
            )
            for uid in uid_list
        ],
        return_exceptions=True,
    )

    new_signals = 0
    new_signal_records: list[tuple[str, PaperTrade]] = []

    for uid, result in zip(uid_list, gather_results):
        if isinstance(result, Exception):
            logger.debug(f"evaluate_on_cached_data: {uid}: {result}")
            continue
        signals, _ = result

        for sig in signals:
            exists = db.query(PaperTrade).filter(
                PaperTrade.strategy_name == sig["strategy_name"],
                PaperTrade.ticker == sig["ticker"],
                PaperTrade.trade_date == today,
            ).first()
            if exists:
                continue
            try:
                actual_entry = float(sig["entry_price"])
                tp_pct = float(sig["tp_pct"])
                sl_pct = float(sig["sl_pct"])
                raw_tp = round(actual_entry * (1 + tp_pct / 100), 4)
                raw_sl = round(actual_entry * (1 - sl_pct / 100), 4)
                trade = PaperTrade(
                    id=str(uuid.uuid4()),
                    strategy_id=f"custom:{uid}:{sig['strategy_name']}",
                    strategy_name=sig["strategy_name"],
                    ticker=sig["ticker"],
                    trade_date=today,
                    entry_time=sig["entry_time_il"],
                    entry_time_et=sig["entry_time_et"],
                    entry_price=actual_entry,
                    tp_price=raw_tp,
                    sl_price=raw_sl,
                    status="open",
                    session="regular" if _is_market_open() else "premarket",
                    catalyst=sig.get("catalyst_type"),
                    rvol=float(sig["rvol"]) if sig.get("rvol") is not None else None,
                    variant="custom",
                )
                db.add(trade)
                new_signal_records.append((uid, trade))
                new_signals += 1
            except Exception as exc:
                logger.debug(f"evaluate_on_cached_data build_trade: {exc}")

    if new_signals:
        try:
            db.commit()
        except Exception:
            db.rollback()
        try:
            await _auto_execute_new_signals(new_signal_records, db)
        except Exception:
            pass
        logger.info(f"evaluate_on_cached_data: {new_signals} new signal(s) across {len(uid_list)} users")

    return new_signals


# ─── Full scan ────────────────────────────────────────────────────────────────

async def scan_and_save_signals(db: Session, user_id: Optional[str] = None, force: bool = False) -> int:
    """
    Full market scan:
    1. Fetch latest catalyst days (IBKR → Polygon → Mock)
    2. Update global price cache
    3. Evaluate up to 15 strategies in parallel
    4. Save new PaperTrades with realistic entry prices and slippage
    5. Check TP/SL on open trades with fresh prices

    Runs only within 11:00–23:00 Israel time window (bypass with force=True).
    """
    if not force and not _is_in_scan_window():
        logger.debug("scan_and_save_signals: outside scan window, skipping")
        return 0

    # Always refresh price cache even with no active strategies (powers /scan-status)
    await _refresh_price_cache_only()

    q = db.query(StrategyTracker).filter(StrategyTracker.is_active == True)  # noqa: E712
    if user_id:
        q = q.filter(StrategyTracker.user_id == user_id)
    trackers = q.all()
    if not trackers:
        return 0

    today = date.today().isoformat()
    entry_time_et = _et_hhmm()
    entry_time_il = _il_hhmm()

    # Group trackers by user_id to fetch market data once per user
    from collections import defaultdict
    by_user: dict[str, list] = defaultdict(list)
    for t in trackers:
        if t.user_id:
            by_user[t.user_id].append(t)

    uid_list = list(by_user.keys())

    # All users evaluated in parallel — each gets their own IBKR data if connected,
    # otherwise falls back to the shared Yahoo snapshot already in _latest_catalyst_days.
    gather_results = await asyncio.gather(
        *[
            _fetch_and_signal(
                uid, by_user[uid],
                catalyst_days_override=None,  # each user checks IBKR first
                db=db,
                entry_time_et=entry_time_et,
                entry_time_il=entry_time_il,
            )
            for uid in uid_list
        ],
        return_exceptions=True,
    )

    new_signals = 0
    new_signal_records: list[tuple[str, PaperTrade]] = []

    for uid, result in zip(uid_list, gather_results):
        if isinstance(result, Exception):
            logger.warning(f"scan_and_save_signals: failed for user {uid}: {result}")
            continue
        signals, catalyst_days = result

        # Check TP/SL with fresh prices for this user
        try:
            await _check_tp_sl_with_days(uid, catalyst_days, db, entry_time_et)
        except Exception as exc:
            logger.warning(f"scan_and_save_signals: TP/SL check failed for {uid}: {exc}")

        for sig in signals:
            existing = (
                db.query(PaperTrade)
                .filter(
                    PaperTrade.strategy_name == sig["strategy_name"],
                    PaperTrade.ticker == sig["ticker"],
                    PaperTrade.trade_date == today,
                )
                .first()
            )
            if existing:
                continue

            actual_entry = float(sig["entry_price"])
            tp_pct = float(sig["tp_pct"])
            sl_pct = float(sig["sl_pct"])

            raw_tp = round(actual_entry * (1 + tp_pct / 100), 4)
            raw_sl = round(actual_entry * (1 - sl_pct / 100), 4)

            trade = PaperTrade(
                id=str(uuid.uuid4()),
                strategy_id=f"custom:{uid}:{sig['strategy_name']}",
                strategy_name=sig["strategy_name"],
                ticker=sig["ticker"],
                trade_date=today,
                entry_time=sig["entry_time_il"],
                entry_time_et=sig["entry_time_et"],
                entry_price=actual_entry,
                tp_price=raw_tp,
                sl_price=raw_sl,
                status="open",
                session="regular" if _is_market_open() else "premarket",
                catalyst=sig.get("catalyst_type"),
                rvol=float(sig["rvol"]) if sig.get("rvol") is not None else None,
                variant="custom",
            )
            db.add(trade)
            new_signal_records.append((uid, trade))
            new_signals += 1

    if new_signals:
        db.commit()
        logger.info(f"scan_and_save_signals: saved {new_signals} new signals")

    # Auto-execute: send real orders for users who have auto_execute=True broker
    await _auto_execute_new_signals(new_signal_records, db)

    return new_signals


async def _auto_execute_new_signals(
    records: list[tuple[str, PaperTrade]],
    db: Session,
) -> None:
    """
    For each new signal, check if the owning user has a broker with auto_execute=True.
    If so, place a real market order for POSITION_DOLLARS worth of shares.
    Errors are logged but never propagate — the paper trade was already saved.
    """
    if not records:
        return

    from app.models.db_models import BrokerConnection
    from app.core.broker_manager import get_broker

    # Cache auto-execute brokers per user to avoid repeated DB queries
    _broker_cache: dict[str, Optional[BrokerConnection]] = {}

    for uid, trade in records:
        if uid not in _broker_cache:
            conn = (
                db.query(BrokerConnection)
                .filter(
                    BrokerConnection.user_id == uid,
                    BrokerConnection.auto_execute == True,   # noqa: E712
                    BrokerConnection.status == "connected",
                )
                .first()
            )
            _broker_cache[uid] = conn

        conn = _broker_cache[uid]
        if not conn:
            continue

        try:
            broker = get_broker(conn.broker_type, conn.credentials_enc)
            qty = max(1, int(POSITION_DOLLARS / trade.entry_price))
            result = await broker.place_market_order(trade.ticker, "buy", qty)
            logger.info(
                f"auto_execute: {trade.ticker} x{qty} → {result.status} "
                f"(fill={result.fill_price}) for user {uid}"
            )
        except Exception as exc:
            logger.warning(f"auto_execute failed for {trade.ticker} user {uid}: {exc}")


async def _fetch_and_signal(
    user_id: str,
    trackers: list,
    catalyst_days_override: Optional[list],
    db: Session,
    entry_time_et: str,
    entry_time_il: str,
) -> tuple[list[dict], list[CatalystDay]]:
    """Fetch market data for user, update price cache, evaluate all strategies in parallel."""
    global _latest_prices, _last_data_source
    from app.core.config import get_settings

    settings = get_settings()
    catalyst_days: list[CatalystDay] = catalyst_days_override or []
    data_source = "cached" if catalyst_days_override else "none"

    if not catalyst_days:
        # Try IBKR first — real-time, highest quality
        gw = _get_ibkr_gateway_url(user_id, db)
        if gw:
            try:
                from app.data.ibkr_provider import get_ibkr_movers
                ibkr_days = await get_ibkr_movers(gw)
                if ibkr_days:
                    catalyst_days = ibkr_days
                    data_source = "ibkr"
                    logger.info(f"Using IBKR real-time data ({len(ibkr_days)} movers) for {user_id}")
                else:
                    logger.warning(f"IBKR returned 0 movers for {user_id} — falling back")
            except Exception as exc:
                logger.warning(f"IBKR failed for {user_id}: {exc}")

    if not catalyst_days:
        try:
            if not settings.use_mock_data and settings.polygon_api_key:
                from app.data.polygon_provider import get_todays_movers
                try:
                    # Only use today's movers from Polygon (quick REST call)
                    # Skip get_catalyst_days — it triggers a blocking 30-day backfill
                    polygon_days = get_todays_movers(settings.polygon_api_key)
                    if polygon_days:
                        catalyst_days = polygon_days
                        data_source = "polygon"
                except Exception as exc:
                    logger.debug(f"Polygon movers failed for {user_id}: {exc}")
        except Exception as exc:
            logger.warning(f"Polygon setup failed for {user_id}: {exc}")

    # Yahoo Finance: today's real explosive movers — free, no API key
    if not catalyst_days or len(catalyst_days) < 5:
        try:
            from app.data.yahoo_provider import get_todays_movers as yahoo_movers
            yahoo_days = await yahoo_movers()
            if yahoo_days:
                catalyst_days = yahoo_days + catalyst_days
                data_source = "yahoo" if data_source == "none" else data_source
                logger.info(f"Yahoo Finance: {len(yahoo_days)} live movers for {user_id}")
        except Exception as exc:
            logger.warning(f"Yahoo Finance provider failed for {user_id}: {exc}")

    # No real market data — skip rather than blocking the event loop with mock data
    if not catalyst_days:
        logger.debug(f"No real market data for {user_id}, scan skipped")
        return [], []

    _last_data_source = data_source

    # Refresh price cache
    for day in catalyst_days:
        if day.candles_1m:
            _latest_prices[day.ticker] = day.candles_1m[-1].close

    # Build strategy entries
    strategy_entries = [
        {
            "tracker_id": t.id,
            "name": t.name,
            "started_at": t.started_at.isoformat() if t.started_at else None,
            "config": t.config_json or {},
        }
        for t in trackers
    ]

    # Evaluate all strategies concurrently (up to 15 via semaphore)
    tasks = [
        _eval_strategy(entry, catalyst_days, entry_time_et, entry_time_il)
        for entry in strategy_entries
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    signals: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning(f"Strategy eval error: {r}")
        elif isinstance(r, list):
            signals.extend(r)

    logger.info(f"_fetch_and_signal: {len(signals)} signals, {len(strategy_entries)} strategies for {user_id}")
    return signals, catalyst_days


async def _check_tp_sl_with_days(
    user_id: str, catalyst_days: list[CatalystDay], db: Session, exit_time_et: str
) -> int:
    """Check open signals against latest candle prices (called after full scan)."""
    today = date.today().isoformat()
    prefix = f"custom:{user_id}:"

    open_trades = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_id.like(f"{prefix}%"),
            PaperTrade.trade_date == today,
            PaperTrade.status == "open",
        )
        .all()
    )
    if not open_trades:
        return 0

    latest: dict[str, float] = {
        day.ticker: day.candles_1m[-1].close
        for day in catalyst_days
        if day.candles_1m
    }
    closed = 0

    for trade in open_trades:
        price = latest.get(trade.ticker)
        if price is None:
            continue

        hit_tp = trade.tp_price is not None and price >= trade.tp_price
        hit_sl = trade.sl_price is not None and price <= trade.sl_price

        if not hit_tp and not hit_sl:
            continue

        if hit_tp and (not hit_sl or trade.tp_price <= trade.sl_price):  # type: ignore[operator]
            raw_exit = trade.tp_price
            trade.status = "win"
            trade.exit_reason = "TP"
        else:
            raw_exit = trade.sl_price
            trade.status = "loss"
            trade.exit_reason = "SL"

        actual_exit = _apply_exit(raw_exit, 0.0)
        trade.exit_price = actual_exit
        trade.exit_time = exit_time_et
        trade.hold_minutes = _hold_minutes(trade.entry_time_et, exit_time_et)
        trade.return_pct = round(
            (actual_exit - trade.entry_price) / trade.entry_price * 100, 2
        )
        trade.dollars_gain = round(
            (actual_exit - trade.entry_price) / trade.entry_price * POSITION_DOLLARS, 2
        )
        closed += 1

    if closed:
        db.commit()
        logger.info(f"_check_tp_sl_with_days: closed {closed} signals for {user_id}")
    return closed


# ─── Strategy management ─────────────────────────────────────────────────────

async def activate_strategy(user_id: str, strategy: dict, db: Session) -> str:
    name = strategy.get("name", "Unnamed Strategy")
    existing = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.user_id == user_id, StrategyTracker.name == name)
        .first()
    )
    if existing:
        existing.is_active = True
        existing.config_json = strategy
        existing.started_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        logger.info(f"Re-activated '{name}' for {user_id} (id={existing.id})")
        return existing.id

    tracker = StrategyTracker(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=name,
        is_active=True,
        config_json=strategy,
        started_at=datetime.utcnow(),
    )
    db.add(tracker)
    db.commit()
    db.refresh(tracker)
    logger.info(f"Activated '{name}' for {user_id} (id={tracker.id})")
    return tracker.id


async def deactivate_strategy(tracker_id: str, user_id: str, db: Session) -> bool:
    tracker = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.id == tracker_id, StrategyTracker.user_id == user_id)
        .first()
    )
    if not tracker:
        return False
    tracker.is_active = False
    db.commit()
    logger.info(f"Deactivated tracker {tracker_id} for {user_id}")
    return True


def get_active_strategies(user_id: str, db: Session) -> list[dict]:
    trackers = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.user_id == user_id, StrategyTracker.is_active == True)  # noqa: E712
        .order_by(StrategyTracker.started_at.desc())
        .all()
    )
    return [
        {
            "tracker_id": t.id,
            "name": t.name,
            "started_at": t.started_at.isoformat() if t.started_at else None,
            "config": t.config_json or {},
        }
        for t in trackers
    ]


def _get_ibkr_gateway_url(user_id: str, db: Session) -> Optional[str]:
    from app.models.db_models import BrokerConnection
    from app.core.broker_manager import decrypt_credentials

    conn = (
        db.query(BrokerConnection)
        .filter(
            BrokerConnection.user_id == user_id,
            BrokerConnection.broker_type == "ibkr",
            BrokerConnection.status == "connected",
        )
        .order_by(BrokerConnection.last_tested_at.desc())
        .first()
    )
    if not conn or not conn.credentials_enc:
        return None
    try:
        creds = decrypt_credentials(conn.credentials_enc)
        return creds.get("gateway_url") or None
    except Exception as exc:
        logger.debug(f"_get_ibkr_gateway_url: could not decrypt: {exc}")
        return None


async def eod_close_custom_signals(db: Session) -> int:
    """EOD: close all remaining open custom signals as flat."""
    today = date.today().isoformat()
    exit_et = _et_hhmm()

    open_trades = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_id.like("custom:%"),
            PaperTrade.trade_date == today,
            PaperTrade.status == "open",
        )
        .all()
    )

    for trade in open_trades:
        # Exit at last known price (or entry if unknown)
        raw_exit = _latest_prices.get(trade.ticker, trade.entry_price)
        actual_exit = _apply_exit(raw_exit, 0.0)
        trade.exit_price = actual_exit
        trade.status = "flat"
        trade.exit_reason = "EOD"
        trade.exit_time = exit_et
        trade.hold_minutes = _hold_minutes(trade.entry_time_et, exit_et)
        trade.return_pct = round(
            (actual_exit - trade.entry_price) / trade.entry_price * 100, 2
        )
        trade.dollars_gain = round(
            (actual_exit - trade.entry_price) / trade.entry_price * POSITION_DOLLARS, 2
        )

    if open_trades:
        db.commit()
        logger.info(f"eod_close_custom_signals: EOD-closed {len(open_trades)} signals")
    return len(open_trades)


# Keep backward-compatible alias used by routes
async def scan_and_signal(user_id: str, db: Session) -> tuple[list[dict], list[CatalystDay]]:
    """Backward-compatible wrapper."""
    trackers_q = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.user_id == user_id, StrategyTracker.is_active == True)  # noqa: E712
        .all()
    )
    return await _fetch_and_signal(
        user_id, trackers_q, None, db, _et_hhmm(), _il_hhmm()
    )
