"""Live strategy management — activate, deactivate, list, scan, and signals."""

from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.core.auth import get_current_user
from app.models.db_models import User, PaperTrade
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
    """Manually trigger a scan and save signals for the current user's active strategies."""
    new_count = await scan_and_save_signals(db, user_id=current_user.id)
    return {"saved": new_count, "market_open": _is_market_open()}


@router.get("/signals")
def get_signals(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return recent signals (PaperTrades) from this user's custom strategies."""
    since = (date.today() - timedelta(days=days - 1)).isoformat()
    prefix = f"custom:{current_user.id}:"

    rows = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_id.like(f"{prefix}%"),
            PaperTrade.trade_date >= since,
        )
        .order_by(PaperTrade.created_at.desc())
        .limit(200)
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
            "status":        r.status,
            "catalyst":      r.catalyst,
            "rvol":          r.rvol,
        }
        for r in rows
    ]
