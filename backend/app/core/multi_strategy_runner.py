"""
Multi-strategy runner — manages multiple StrategyConfig objects running
simultaneously against live Polygon data.
"""

import uuid
import logging
from datetime import datetime, timezone, date

from sqlalchemy.orm import Session

from app.models.db_models import StrategyTracker, PaperTrade
from app.data.types import CatalystDay

logger = logging.getLogger(__name__)

ISRAEL_UTC_OFFSET = 3   # summer IDT UTC+3
ET_UTC_OFFSET     = -4  # summer EDT UTC-4
POSITION_DOLLARS  = 1000


def _is_market_open() -> bool:
    """Return True if current time is within US regular market hours (9:30–16:00 ET)."""
    now_utc = datetime.now(timezone.utc)
    now_et_hour  = (now_utc.hour + ET_UTC_OFFSET) % 24
    now_et_min   = now_utc.minute
    now_et_total = now_et_hour * 60 + now_et_min
    open_total   = 9 * 60 + 30
    close_total  = 16 * 60
    return open_total <= now_et_total < close_total


async def scan_and_save_signals(db: Session, user_id: str | None = None) -> int:
    """
    Scan active custom strategies and save new signals as PaperTrades.
    If user_id is given, scans only that user; otherwise scans all users (scheduler job).
    Returns the number of new signals saved.
    """
    if not _is_market_open():
        logger.debug("scan_and_save_signals: market closed, skipping")
        return 0

    q = db.query(StrategyTracker.user_id).filter(
        StrategyTracker.is_active == True  # noqa: E712
    )
    if user_id:
        q = q.filter(StrategyTracker.user_id == user_id)
    rows = q.distinct().all()
    if not rows:
        return 0

    today = date.today().isoformat()
    now_utc = datetime.now(timezone.utc)
    entry_time_il = f"{(now_utc.hour + ISRAEL_UTC_OFFSET) % 24:02d}:{now_utc.minute:02d}"
    entry_time_et = f"{(now_utc.hour + ET_UTC_OFFSET) % 24:02d}:{now_utc.minute:02d}"

    new_signals = 0
    for (user_id,) in rows:
        if not user_id:
            continue
        try:
            signals, catalyst_days = await scan_and_signal(user_id, db)
        except Exception as exc:
            logger.warning(f"scan_and_save_signals: scan failed for {user_id}: {exc}")
            continue

        # Check TP/SL for already-open signals using this scan's market prices
        try:
            await _check_tp_sl(user_id, catalyst_days, db)
        except Exception as exc:
            logger.warning(f"scan_and_save_signals: TP/SL check failed for {user_id}: {exc}")

        for sig in signals:
            # Deduplicate: skip if same strategy+ticker already open today
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

            entry = sig["entry_price"]
            trade = PaperTrade(
                id=str(uuid.uuid4()),
                strategy_id=f"custom:{user_id}:{sig['strategy_name']}",
                strategy_name=sig["strategy_name"],
                ticker=sig["ticker"],
                trade_date=today,
                entry_time=entry_time_il,
                entry_time_et=entry_time_et,
                entry_price=entry,
                tp_price=round(entry * 1.15, 4),
                sl_price=round(entry * 0.95, 4),
                status="open",
                session="regular",
                catalyst=sig.get("catalyst_type"),
                rvol=sig.get("rvol"),
                variant="custom",
            )
            db.add(trade)
            new_signals += 1

    if new_signals:
        db.commit()
        logger.info(f"scan_and_save_signals: saved {new_signals} new signals")
    return new_signals


async def activate_strategy(user_id: str, strategy: dict, db: Session) -> str:
    """
    Save a strategy as active. Returns the StrategyTracker ID.
    If a tracker with the same name already exists for this user, it is
    updated in-place; otherwise a new row is created.
    """
    name = strategy.get("name", "Unnamed Strategy")

    existing = (
        db.query(StrategyTracker)
        .filter(
            StrategyTracker.user_id == user_id,
            StrategyTracker.name == name,
        )
        .first()
    )

    if existing:
        existing.is_active = True
        existing.config_json = strategy
        existing.started_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        logger.info(f"Re-activated strategy '{name}' for user {user_id} (id={existing.id})")
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
    logger.info(f"Activated new strategy '{name}' for user {user_id} (id={tracker.id})")
    return tracker.id


async def deactivate_strategy(tracker_id: str, user_id: str, db: Session) -> bool:
    """
    Set is_active=False for the given tracker.
    Returns True if the tracker was found and updated, False otherwise.
    """
    tracker = (
        db.query(StrategyTracker)
        .filter(
            StrategyTracker.id == tracker_id,
            StrategyTracker.user_id == user_id,
        )
        .first()
    )
    if not tracker:
        return False

    tracker.is_active = False
    db.commit()
    logger.info(f"Deactivated strategy tracker {tracker_id} for user {user_id}")
    return True


def get_active_strategies(user_id: str, db: Session) -> list[dict]:
    """
    Return a list of active strategy configs with their tracker IDs.
    Each element: {"tracker_id": str, "config": dict}
    """
    trackers = (
        db.query(StrategyTracker)
        .filter(
            StrategyTracker.user_id == user_id,
            StrategyTracker.is_active == True,  # noqa: E712
        )
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


def _get_ibkr_gateway_url(user_id: str, db: Session) -> str | None:
    """
    Return the IBKR gateway URL for the user's first connected IBKR broker,
    or None if they have no connected IBKR connection.
    """
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
        logger.debug(f"_get_ibkr_gateway_url: could not decrypt credentials: {exc}")
        return None


async def scan_and_signal(
    user_id: str, db: Session
) -> tuple[list[dict], list[CatalystDay]]:
    """
    Main scanner: for each active strategy, fetch the latest market data
    and check whether entry conditions are met.

    Data source priority:
      1. IBKR Client Portal (real-time) — if user has a connected IBKR broker
      2. Polygon.io (15-min delayed) — fallback when IBKR unavailable
      3. Mock data — fallback when Polygon key is missing or both fail

    Returns (signals, catalyst_days) so the caller can reuse prices for TP/SL checks.
    """
    from app.core.config import get_settings
    from app.core.backtest_engine import _apply_filters, _candles_to_df, _detect_entry_signal
    from app.models.schemas import StrategyConfig

    active = get_active_strategies(user_id, db)
    if not active:
        logger.info(f"No active strategies for user {user_id}")
        return [], []

    settings = get_settings()
    catalyst_days: list[CatalystDay] = []

    # ── 1. Try IBKR real-time data ────────────────────────────────────────────
    ibkr_gateway_url = _get_ibkr_gateway_url(user_id, db)
    if ibkr_gateway_url:
        try:
            from app.data.ibkr_provider import get_ibkr_movers
            ibkr_days = await get_ibkr_movers(ibkr_gateway_url)
            if ibkr_days:
                catalyst_days = ibkr_days
                logger.info(f"scan_and_signal: using IBKR real-time data ({len(ibkr_days)} movers) for user {user_id}")
        except Exception as exc:
            logger.warning(f"scan_and_signal: IBKR provider failed: {exc}")

    # ── 2. Fall back to Polygon (delayed) if IBKR gave nothing ───────────────
    if not catalyst_days:
        try:
            if settings.use_mock_data or not settings.polygon_api_key:
                from app.data.mock_provider import generate_catalyst_days
                catalyst_days = generate_catalyst_days(lookback_years=1)
                logger.info(f"scan_and_signal: using mock data for user {user_id}")
            else:
                from app.data.polygon_provider import get_catalyst_days, get_todays_movers
                catalyst_days = get_catalyst_days(lookback_years=1, api_key=settings.polygon_api_key)
                try:
                    todays = get_todays_movers(api_key=settings.polygon_api_key)
                    catalyst_days = todays + catalyst_days
                    logger.info(f"scan_and_signal: using Polygon (delayed) + {len(todays)} live movers for user {user_id}")
                except Exception as exc:
                    logger.warning(f"scan_and_signal: could not fetch today's Polygon movers: {exc}")
        except Exception as exc:
            logger.error(f"scan_and_signal: failed to fetch catalyst days: {exc}")
            return [], []

    signals: list[dict] = []

    for entry in active:
        config_dict = entry.get("config") or {}
        strategy_name = entry.get("name", config_dict.get("name", "Unknown"))

        try:
            strategy = StrategyConfig(**config_dict)
        except Exception as exc:
            logger.warning(f"scan_and_signal: invalid config for '{strategy_name}': {exc}")
            continue

        filtered_days = _apply_filters(catalyst_days, strategy)

        for day in filtered_days:
            if not day.candles_1m:
                continue
            try:
                df = _candles_to_df(day.candles_1m)
                signal = _detect_entry_signal(df, strategy)
                if signal is None:
                    continue

                _entry_minute, entry_price = signal
                signals.append(
                    {
                        "strategy_name": strategy_name,
                        "ticker": day.ticker,
                        "entry_price": round(entry_price, 4),
                        "catalyst_type": day.catalyst_type,
                        "rvol": round(day.rvol, 1),
                        "trade_date": str(day.date),
                    }
                )
            except Exception as exc:
                logger.warning(
                    f"scan_and_signal: error processing {day.ticker}/{day.date} "
                    f"for '{strategy_name}': {exc}"
                )
                continue

    logger.info(
        f"scan_and_signal: {len(signals)} signals across "
        f"{len(active)} active strategies for user {user_id}"
    )
    return signals, catalyst_days


async def _check_tp_sl(user_id: str, catalyst_days: list[CatalystDay], db: Session) -> int:
    """
    Check all open signals for this user against the latest candle prices.
    Closes signals that have hit TP (win) or SL (loss).
    Returns count of newly closed signals.
    """
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

    # Latest close price for each ticker in today's market data
    latest_price: dict[str, float] = {
        day.ticker: day.candles_1m[-1].close
        for day in catalyst_days
        if day.candles_1m
    }

    now_utc = datetime.now(timezone.utc)
    exit_time_et = f"{(now_utc.hour + ET_UTC_OFFSET) % 24:02d}:{now_utc.minute:02d}"
    closed = 0

    for trade in open_trades:
        price = latest_price.get(trade.ticker)
        if price is None:
            continue

        if trade.tp_price and price >= trade.tp_price:
            trade.exit_price = trade.tp_price
            trade.status = "win"
            trade.exit_reason = "take_profit"
        elif trade.sl_price and price <= trade.sl_price:
            trade.exit_price = trade.sl_price
            trade.status = "loss"
            trade.exit_reason = "stop_loss"
        else:
            continue

        trade.exit_time = exit_time_et
        trade.return_pct = round(
            (trade.exit_price - trade.entry_price) / trade.entry_price * 100, 2
        )
        trade.dollars_gain = round(
            (trade.exit_price - trade.entry_price) / trade.entry_price * POSITION_DOLLARS, 2
        )
        closed += 1

    if closed:
        db.commit()
        logger.info(f"_check_tp_sl: closed {closed} signals for user {user_id}")
    return closed


async def eod_close_custom_signals(db: Session) -> int:
    """
    EOD job: close all remaining open custom signals as flat.
    Called by scheduler at 23:05 Israel time (after US market close).
    """
    today = date.today().isoformat()
    now_utc = datetime.now(timezone.utc)
    exit_time_et = f"{(now_utc.hour + ET_UTC_OFFSET) % 24:02d}:{now_utc.minute:02d}"

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
        trade.status = "flat"
        trade.exit_reason = "eod_close"
        trade.exit_time = exit_time_et
        trade.return_pct = 0.0
        trade.dollars_gain = 0.0

    if open_trades:
        db.commit()
        logger.info(f"eod_close_custom_signals: EOD-closed {len(open_trades)} signals")
    return len(open_trades)
