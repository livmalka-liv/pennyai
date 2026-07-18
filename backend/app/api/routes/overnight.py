"""Overnight volume alert receiver + reader."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

router = APIRouter(prefix="/overnight", tags=["overnight"])

# In-memory store (last 100 alerts)
_alerts: List[dict] = []


class OvernightAlert(BaseModel):
    ticker: str
    hour_str: str
    last_hour_vol: int
    multiplier: float
    price: Optional[float] = None
    baseline: Optional[float] = None


@router.post("/alert")
async def receive_alert(alert: OvernightAlert):
    """Called by overnight_tracker.py when anomaly detected."""
    _alerts.insert(0, {
        **alert.model_dump(),
        "received_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    })
    # Keep only last 100
    del _alerts[100:]
    return {"status": "ok"}


@router.get("/alerts")
async def get_alerts():
    return {"alerts": _alerts, "count": len(_alerts)}


@router.delete("/alerts")
async def clear_alerts():
    _alerts.clear()
    return {"status": "cleared"}
