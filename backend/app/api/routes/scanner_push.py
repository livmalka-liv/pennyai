"""Receives pushed data from standalone.py and serves it to the frontend."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Any
from datetime import datetime, timezone

router = APIRouter(prefix="/scanner", tags=["scanner"])

# In-memory store
_state: dict = {
    "tickers":   [],
    "shchutot":  [],
    "gal_sheni": [],
    "news":      [],
    "status":    {},
    "pushed_at": None,
}


class PushPayload(BaseModel):
    tickers:   List[Any] = []
    shchutot:  List[Any] = []
    gal_sheni: List[Any] = []
    news:      List[Any] = []
    status:    dict      = {}


@router.post("/push")
async def push_data(payload: PushPayload):
    """Called by standalone.py after every scan."""
    _state["tickers"]   = payload.tickers
    _state["shchutot"]  = payload.shchutot
    _state["gal_sheni"] = payload.gal_sheni
    _state["news"]      = payload.news
    _state["status"]    = payload.status
    _state["pushed_at"] = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    return {"status": "ok", "tickers": len(payload.tickers)}


@router.get("/state")
async def get_state():
    return _state
