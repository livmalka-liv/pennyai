"""Receives pushed data from standalone.py and serves it to the frontend."""

import json
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Any
from datetime import datetime, timezone

router = APIRouter(prefix="/scanner", tags=["scanner"])

_STATE_FILE = Path("/tmp/scanner_state.json")

_EMPTY: dict = {
    "tickers":   [],
    "shchutot":  [],
    "gal_sheni": [],
    "news":      [],
    "support":   [],
    "status":    {},
    "pushed_at": None,
}

def _load() -> dict:
    try:
        if _STATE_FILE.exists():
            return json.loads(_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return dict(_EMPTY)

def _save(s: dict) -> None:
    try:
        _STATE_FILE.write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

# Load persisted state on startup (survives sleep/wake on same container)
_state: dict = _load()


class PushPayload(BaseModel):
    tickers:   List[Any] = []
    shchutot:  List[Any] = []
    gal_sheni: List[Any] = []
    news:      List[Any] = []
    support:   List[Any] = []
    status:    dict      = {}


@router.post("/push")
async def push_data(payload: PushPayload):
    """Called by standalone.py after every scan."""
    _state["tickers"]   = payload.tickers
    _state["shchutot"]  = payload.shchutot
    _state["gal_sheni"] = payload.gal_sheni
    _state["news"]      = payload.news
    _state["support"]   = payload.support
    _state["status"]    = payload.status
    _state["pushed_at"] = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    _save(_state)
    return {"status": "ok", "tickers": len(payload.tickers)}


@router.get("/state")
async def get_state():
    return _state
