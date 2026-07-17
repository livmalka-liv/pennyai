"""W-Pattern Breakout Scanner — REST endpoints."""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.core.wpattern_scanner import get_state, run_wpattern_scan, calculate_zones, _get_candles_1m

router = APIRouter(prefix="/wpattern", tags=["wpattern"])


@router.get("/universe")
async def get_universe():
    """Stocks being watched (>10% intraday gain)."""
    state = get_state()
    return {"universe": state["universe"], "last_scan": state["last_scan"]}


@router.get("/signals")
async def get_signals():
    """All detected W-pattern signals (most recent first)."""
    state = get_state()
    return {
        "signals":      state["signals"],
        "signal_count": state["signal_count"],
        "last_scan":    state["last_scan"],
    }


@router.get("/zones/{ticker}")
async def get_zones(ticker: str):
    """Structural zones for a specific ticker."""
    state = get_state()
    zones = state["zones"].get(ticker.upper())
    if zones is None:
        raise HTTPException(status_code=404, detail=f"No zones calculated for {ticker}")
    return {"ticker": ticker.upper(), "zones": zones}


@router.get("/candles/{ticker}")
async def get_candles(ticker: str):
    """1-minute candles for chart rendering."""
    candles = await _get_candles_1m(ticker.upper())
    return {"ticker": ticker.upper(), "candles": candles[-390:]}  # max 390 = 1 RTH day


@router.post("/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    """Manually trigger a W-pattern scan in the background."""
    background_tasks.add_task(run_wpattern_scan)
    return {"status": "scan_started"}


@router.get("/state")
async def full_state():
    """Full scanner state dump (universe + zones + signals)."""
    return get_state()
