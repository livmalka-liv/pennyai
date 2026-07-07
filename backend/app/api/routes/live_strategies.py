"""Live strategy management — activate, deactivate, list, scan, and signals."""

import asyncio
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.core.auth import get_current_user
from app.models.db_models import User, PaperTrade, StrategyTracker
from app.core.multi_strategy_runner import (
    activate_strategy,
    deactivate_strategy,
    get_active_strategies,
    scan_and_save_signals,
    _is_market_open,
)

router = APIRouter(prefix="/live-strategies", tags=["live-strategies"])

_DEBUG_KEY = "pennyai-debug-2026"


@router.get("/debug-broker")
def debug_broker(key: str, db: Session = Depends(get_db)):
    """Show all brokers in DB."""
    if key != _DEBUG_KEY:
        raise HTTPException(status_code=403, detail="forbidden")
    from app.models.db_models import BrokerConnection
    brokers = db.query(BrokerConnection).all()
    return [
        {
            "id": b.id,
            "user_id": b.user_id,
            "broker_type": b.broker_type,
            "gateway_url": b.gateway_url,
            "account_id": b.account_id,
            "auto_execute": b.auto_execute,
            "is_active": b.is_active,
        }
        for b in brokers
    ]


@router.get("/debug-today")
def debug_today(key: str, days: int = 30, db: Session = Depends(get_db)):
    """Temporary debug: list all paper trades + active trackers (no auth, key-protected)."""
    if key != _DEBUG_KEY:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="forbidden")
    from datetime import timedelta
    since = (date.today() - timedelta(days=days)).isoformat()
    trades = (
        db.query(PaperTrade)
        .filter(PaperTrade.trade_date >= since)
        .order_by(PaperTrade.trade_date.desc(), PaperTrade.entry_time_et.asc())
        .all()
    )
    trackers = db.query(StrategyTracker).all()
    return {
        "today": date.today().isoformat(),
        "total_trades": len(trades),
        "signals": [
            {
                "date": t.trade_date,
                "ticker": t.ticker,
                "strategy": t.strategy_name,
                "entry_time_et": t.entry_time_et,
                "entry_price": t.entry_price,
                "tp_price": t.tp_price,
                "sl_price": t.sl_price,
                "exit_price": t.exit_price,
                "status": t.status,
                "exit_reason": t.exit_reason,
            }
            for t in trades
        ],
        "trackers": [
            {"name": tr.name, "active": tr.is_active}
            for tr in trackers
        ],
    }


class ActivateRequest(BaseModel):
    strategy: dict


@router.post("/activate")
async def activate(
    body: ActivateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Activate a strategy for the current user. Returns the tracker ID."""
    tracker_id = await activate_strategy(
        user_id=current_user.id,
        strategy=body.strategy,
        db=db,
    )
    return {"tracker_id": tracker_id, "status": "active"}


@router.delete("/{tracker_id}")
async def deactivate(
    tracker_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deactivate a strategy by its tracker ID."""
    ok = await deactivate_strategy(
        tracker_id=tracker_id,
        user_id=current_user.id,
        db=db,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Strategy tracker not found")
    return {"tracker_id": tracker_id, "status": "inactive"}


@router.get("/")
def list_active(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all active strategies for the current user."""
    return get_active_strategies(user_id=current_user.id, db=db)


@router.post("/scan")
async def scan(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually trigger a scan — bypasses time-window check."""
    new_count = await scan_and_save_signals(db, user_id=current_user.id, force=True)
    return {"saved": new_count, "market_open": _is_market_open()}


@router.get("/stats")
def get_strategy_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated live-scan stats per tracker for this user."""
    trackers = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.user_id == current_user.id)
        .all()
    )

    result = []
    for tracker in trackers:
        sid = f"custom:{current_user.id}:{tracker.id}"
        trades = db.query(PaperTrade).filter(PaperTrade.strategy_id == sid).all()

        closed = [t for t in trades if t.status in ("win", "loss", "flat")]
        wins = [t for t in closed if t.status == "win"]
        total_dollars = sum(t.dollars_gain or 0 for t in closed)
        open_count = sum(1 for t in trades if t.status == "open")

        first_trade = min((t.trade_date for t in trades), default=None)
        trading_days = 0
        if first_trade:
            from_date = date.fromisoformat(str(first_trade))
            calendar_days = (date.today() - from_date).days
            trading_days = int(calendar_days * 252 / 365)

        is_proven = trading_days >= 252 and total_dollars > 0

        # for_sale stored in config_json to avoid schema migration
        cfg = tracker.config_json or {}
        for_sale = bool(cfg.get("for_sale", False))

        result.append({
            "tracker_id":        tracker.id,
            "name":              tracker.name,
            "is_active":         tracker.is_active,
            "for_sale":          for_sale,
            "total_trades":      len(closed),
            "open_trades":       open_count,
            "win_count":         len(wins),
            "win_rate":          round(len(wins) / len(closed) * 100, 1) if closed else 0,
            "total_dollars":     round(total_dollars, 2),
            "first_trade_date":  str(first_trade) if first_trade else None,
            "trading_days_live": trading_days,
            "is_proven":         is_proven,
            "started_at":        tracker.started_at.isoformat() if tracker.started_at else None,
        })

    return result


@router.patch("/{tracker_id}/for-sale")
def toggle_for_sale(
    tracker_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle the for_sale flag (stored inside config_json)."""
    tracker = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.id == tracker_id, StrategyTracker.user_id == current_user.id)
        .first()
    )
    if not tracker:
        raise HTTPException(status_code=404, detail="Tracker not found")
    cfg = dict(tracker.config_json or {})
    cfg["for_sale"] = not bool(cfg.get("for_sale", False))
    tracker.config_json = cfg
    db.commit()
    return {"tracker_id": tracker_id, "for_sale": cfg["for_sale"]}


@router.post("/{tracker_id}/backtest")
async def backtest_tracker(
    tracker_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run a historical backtest on a saved strategy tracker using real Yahoo Finance data.
    Useful for strategies that haven't been live long enough to judge performance.
    """
    tracker = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.id == tracker_id, StrategyTracker.user_id == current_user.id)
        .first()
    )
    if not tracker:
        raise HTTPException(status_code=404, detail="Tracker not found")

    cfg = tracker.config_json or {}
    strategy_dict = cfg.get("strategy") or cfg
    if not strategy_dict or not strategy_dict.get("rules"):
        raise HTTPException(status_code=400, detail="Tracker has no strategy config to backtest")

    try:
        from app.models.schemas import StrategyConfig
        from app.core.backtest_engine import run_backtest
        strategy = StrategyConfig(**strategy_dict)
        result = await asyncio.to_thread(run_backtest, strategy)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return result


@router.get("/scan-status")
def scan_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return current scanner state: market hours, active strategies, tracked tickers."""
    from datetime import datetime, timezone
    from app.core.multi_strategy_runner import _latest_prices, _is_market_open, _is_in_scan_window

    try:
        from app.core.multi_strategy_runner import _last_data_source
    except ImportError:
        _last_data_source = "unknown"

    now_utc = datetime.now(timezone.utc)
    il_hour = (now_utc.hour + 3) % 24
    et_hour = (now_utc.hour - 4) % 24

    trackers = (
        db.query(StrategyTracker)
        .filter(StrategyTracker.user_id == current_user.id, StrategyTracker.is_active == True)  # noqa: E712
        .all()
    )

    return {
        "market_open": _is_market_open(),
        "scan_window_active": _is_in_scan_window(),
        "time_israel": f"{il_hour:02d}:{now_utc.minute:02d}",
        "time_et": f"{et_hour:02d}:{now_utc.minute:02d}",
        "market_opens_israel": "16:30",
        "market_closes_israel": "23:00",
        "data_source": _last_data_source,
        "active_strategies": [{"id": t.id, "name": t.name} for t in trackers],
        "tracked_tickers": sorted(_latest_prices.keys()),
        "tracked_count": len(_latest_prices),
    }


@router.get("/signals")
def get_signals(
    days: int = Query(7, ge=1, le=365),
    from_date: str = Query(None),
    to_date: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return recent signals (PaperTrades) from this user's custom strategies."""
    if from_date:
        since = from_date
    else:
        since = (date.today() - timedelta(days=days - 1)).isoformat()

    until = to_date or date.today().isoformat()
    prefix = f"custom:{current_user.id}:"

    rows = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_id.like(f"{prefix}%"),
            PaperTrade.trade_date >= since,
            PaperTrade.trade_date <= until,
        )
        .order_by(PaperTrade.trade_date.desc(), PaperTrade.created_at.desc())
        .limit(500)
        .all()
    )

    return [
        {
            "id":            r.id,
            "strategy_name": r.strategy_name,
            "ticker":        r.ticker,
            "trade_date":    r.trade_date,
            "entry_time_et": r.entry_time_et,
            "entry_price":   r.entry_price,
            "tp_price":      r.tp_price,
            "sl_price":      r.sl_price,
            "exit_price":    r.exit_price,
            "exit_time":     r.exit_time,
            "exit_reason":   r.exit_reason,
            "return_pct":    r.return_pct,
            "dollars_gain":  r.dollars_gain,
            "hold_minutes":  r.hold_minutes,
            "status":        r.status,
            "catalyst":      r.catalyst,
            "rvol":          r.rvol,
        }
        for r in rows
    ]


@router.get("/paper-dashboard")
def paper_dashboard(
    days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Complete paper trading dashboard: strategy stats + all trades with live P&L."""
    from app.core.multi_strategy_runner import _latest_prices

    since = (date.today() - timedelta(days=days - 1)).isoformat()
    prefix = f"custom:{current_user.id}:"

    rows = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_id.like(f"{prefix}%"),
            PaperTrade.trade_date >= since,
        )
        .order_by(PaperTrade.status.asc(), PaperTrade.trade_date.desc(), PaperTrade.created_at.desc())
        .all()
    )

    # Per-strategy stats
    stats: dict[str, dict] = {}
    for r in rows:
        s = stats.setdefault(r.strategy_name, {"name": r.strategy_name, "wins": 0, "losses": 0, "open": 0, "total_pnl": 0.0})
        if r.status == "win":
            s["wins"] += 1
            s["total_pnl"] += r.dollars_gain or 0
        elif r.status == "loss":
            s["losses"] += 1
            s["total_pnl"] += r.dollars_gain or 0
        elif r.status == "open":
            s["open"] += 1

    stats_list = []
    for s in sorted(stats.values(), key=lambda x: x["name"]):
        closed = s["wins"] + s["losses"]
        stats_list.append({
            "name": s["name"],
            "wins": s["wins"],
            "losses": s["losses"],
            "open": s["open"],
            "total_trades": closed,
            "win_rate": round(s["wins"] / closed * 100, 1) if closed else 0,
            "total_pnl": round(s["total_pnl"], 2),
        })

    # Trade list with live P&L for open trades
    POSITION_DOLLARS = 1000

    def trade_dict(r: PaperTrade) -> dict:
        current = _latest_prices.get(r.ticker) if r.status == "open" else None
        live_pnl = live_pct = None
        if current and r.entry_price:
            live_pct = round((current - r.entry_price) / r.entry_price * 100, 2)
            live_pnl = round((current - r.entry_price) / r.entry_price * POSITION_DOLLARS, 2)
        # Slippage estimate (half bid-ask spread used on entry)
        def spread_pct(p: float) -> float:
            if p < 1: return 1.5
            if p < 3: return 1.0
            if p < 10: return 0.5
            if p < 20: return 0.25
            return 0.1
        slip_cents = round(r.entry_price * spread_pct(r.entry_price) / 100 * 100, 2) if r.entry_price else None
        return {
            "id": r.id,
            "strategy_name": r.strategy_name,
            "ticker": r.ticker,
            "trade_date": r.trade_date,
            "entry_time_et": r.entry_time_et,
            "exit_time": r.exit_time,
            "entry_price": r.entry_price,
            "tp_price": r.tp_price,
            "sl_price": r.sl_price,
            "exit_price": r.exit_price,
            "exit_reason": r.exit_reason,
            "return_pct": r.return_pct,
            "dollars_gain": r.dollars_gain,
            "hold_minutes": r.hold_minutes,
            "status": r.status,
            "catalyst": r.catalyst,
            "rvol": r.rvol,
            "current_price": current,
            "live_pnl": live_pnl,
            "live_pnl_pct": live_pct,
            "slippage_entry_cents": slip_cents,
        }

    return {
        "strategy_stats": stats_list,
        "trades": [trade_dict(r) for r in rows],
        "total_open": sum(1 for r in rows if r.status == "open"),
        "total_today": sum(1 for r in rows if r.trade_date == date.today().isoformat()),
    }


@router.get("/candles")
async def get_candles(
    ticker: str = Query(...),
    trade_date: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    """Return 1-minute OHLCV candles for chart rendering."""
    from datetime import date as _date, timezone, timedelta as _td
    try:
        target = _date.fromisoformat(trade_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date, use YYYY-MM-DD")
    try:
        from app.data.yahoo_provider import fetch_candles_for_date
        candles = await asyncio.to_thread(fetch_candles_for_date, ticker, target)
        if not candles:
            return {"ticker": ticker, "date": trade_date, "candles": []}
        result = []
        for c in candles:
            try:
                ts = c.timestamp
                if hasattr(ts, "replace"):
                    utc = ts.replace(tzinfo=timezone.utc)
                    et_time = (utc + _td(hours=-4)).strftime("%H:%M")
                else:
                    et_time = str(ts)
            except Exception:
                et_time = "00:00"
            result.append({
                "time": et_time,
                "open": round(float(c.open), 4),
                "high": round(float(c.high), 4),
                "low": round(float(c.low), 4),
                "close": round(float(c.close), 4),
                "volume": int(c.volume) if c.volume else 0,
            })
        return {"ticker": ticker, "date": trade_date, "candles": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/backfill-day")
async def backfill_day(
    target_date: str,
    key: str,
    db: Session = Depends(get_db),
):
    """
    Backfill a past trading day: fetch 1m candles from Yahoo, run all active
    strategies, save signals as PaperTrades with the correct date.
    Protected by debug key.
    """
    if key != _DEBUG_KEY:
        raise HTTPException(status_code=403, detail="forbidden")

    from datetime import date as _date, timezone, timedelta
    from app.data.yahoo_provider import fetch_candles_for_date, LIVE_WATCHLIST
    from app.data.types import CatalystDay
    from app.core.backtest_engine import _candles_to_df, _detect_dagger_signal, _apply_filters
    from app.models.db_models import StrategyTracker
    from app.models.schemas import StrategyConfig, RuleType
    import uuid

    try:
        day = _date.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date, use YYYY-MM-DD")

    # Fetch 1m candles for every watchlist ticker on that date
    results = []
    saved = 0
    tickers_scanned = 0

    for ticker in LIVE_WATCHLIST:
        try:
            candles = await fetch_candles_for_date(ticker, day)
            if not candles or len(candles) < 10:
                continue

            tickers_scanned += 1
            df = _candles_to_df(candles)

            # Run Dagger detection
            signal = _detect_dagger_signal(df)
            if signal is None:
                continue

            entry_min, raw_price, stop_price = signal

            # Derive actual candle time
            try:
                raw_ts = day_candles[entry_min].timestamp
                utc_ts = raw_ts.replace(tzinfo=timezone.utc)
                entry_et = (utc_ts + timedelta(hours=-4)).strftime("%H:%M")
                entry_il = (utc_ts + timedelta(hours=3)).strftime("%H:%M")
            except Exception:
                entry_et = "00:00"
                entry_il = "00:00"

            stop_dist = raw_price - stop_price
            if stop_dist <= 0:
                continue

            rr = 4.0 if stop_dist <= 0.15 else (3.0 if stop_dist <= 0.50 else 2.0)
            tp_price = round(raw_price + rr * stop_dist, 4)

            # Check not already saved
            existing = db.query(PaperTrade).filter(
                PaperTrade.ticker == ticker,
                PaperTrade.strategy_name == "Dagger",
                PaperTrade.trade_date == target_date,
            ).first()
            if existing:
                results.append({"ticker": ticker, "action": "already_exists", "entry_time_et": entry_et})
                continue

            # Find the active Dagger tracker
            tracker = db.query(StrategyTracker).filter(
                StrategyTracker.name == "Dagger",
            ).first()
            strategy_id = f"custom:{tracker.user_id}:Dagger" if tracker else "custom:backfill:Dagger"

            trade = PaperTrade(
                id=str(uuid.uuid4()),
                strategy_id=strategy_id,
                strategy_name="Dagger",
                ticker=ticker,
                trade_date=target_date,
                entry_time=entry_il,
                entry_time_et=entry_et,
                entry_price=round(raw_price, 4),
                tp_price=tp_price,
                sl_price=round(stop_price, 4),
                status="open",
                session="regular",
                variant="custom",
            )
            db.add(trade)
            saved += 1
            results.append({
                "ticker": ticker,
                "entry_time_et": entry_et,
                "entry_price": round(raw_price, 4),
                "sl_price": round(stop_price, 4),
                "tp_price": tp_price,
                "stop_dist_cents": round(stop_dist * 100, 1),
                "rr": f"1:{int(rr)}",
            })

        except Exception as exc:
            results.append({"ticker": ticker, "error": str(exc)})

    if saved:
        db.commit()

    return {
        "date": target_date,
        "tickers_scanned": tickers_scanned,
        "signals_saved": saved,
        "signals": [r for r in results if "entry_price" in r],
        "skipped": [r for r in results if "error" in r or "already_exists" in r],
    }
