"""Live strategy management — activate, deactivate, list, and scan active strategies."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.core.auth import get_current_user
from app.models.db_models import User
from app.core.multi_strategy_runner import (
    activate_strategy,
    deactivate_strategy,
    get_active_strategies,
    scan_and_signal,
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
    """
    Manually trigger a scan across all active strategies.
    Returns a list of entry signals that match current Polygon data.
    """
    signals = await scan_and_signal(user_id=current_user.id, db=db)
    return {"signals": signals, "count": len(signals)}
