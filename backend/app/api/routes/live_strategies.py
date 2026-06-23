"""Live strategy management — activate, deactivate, list, scan, and signals."""

from datetime import date, timedelta, datetime as dt
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
