"""
Admin endpoints for managing the Polygon.io data cache.
These endpoints trigger data fetching and show cache status.
Protect with admin auth before going to production.
"""

import sqlite3
from pathlib import Path
from datetime import date
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.core.config import get_settings

router = APIRouter(prefix="/admin/data", tags=["data-admin"])

CACHE_DB = Path(__file__).parent.parent.parent / "data_cache" / "penny_cache.db"


@router.get("/status")
async def cache_status():
    """Show how much data is cached and date range."""
    if not CACHE_DB.exists():
        return {"cached": False, "days": 0, "tickers": 0, "date_range": None}

    conn = sqlite3.connect(CACHE_DB)
    row = conn.execute("""
        SELECT COUNT(*), COUNT(DISTINCT ticker), MIN(date), MAX(date)
        FROM catalyst_days
    """).fetchone()
    conn.close()

    return {
        "cached": row[0] > 0,
        "catalyst_day_records": row[0],
        "unique_tickers": row[1],
        "earliest_date": row[2],
        "latest_date": row[3],
        "source": "polygon.io" if not get_settings().use_mock_data else "mock",
    }


@router.post("/fetch-day")
async def fetch_single_day(target_date: str, background_tasks: BackgroundTasks):
    """Fetch and cache Polygon data for a specific date (YYYY-MM-DD)."""
    settings = get_settings()
    if not settings.polygon_api_key:
        raise HTTPException(status_code=503, detail="POLYGON_API_KEY not set")

    try:
        d = date.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    from app.data.polygon_provider import fetch_and_cache_day

    def run():
        fetch_and_cache_day(d, settings.polygon_api_key)

    background_tasks.add_task(run)
    return {"message": f"Fetching {target_date} in background", "check": "/api/v1/admin/data/status"}


@router.post("/backfill")
async def backfill(years: int = 2, background_tasks: BackgroundTasks = None):
    """
    Backfill historical penny stock data from Polygon.
    This runs in the background and can take several hours.
    Start with years=1 to test, then years=2 or 5 for production.
    """
    if years > 5:
        raise HTTPException(status_code=400, detail="Max 5 years per backfill run")

    settings = get_settings()
    if not settings.polygon_api_key:
        raise HTTPException(status_code=503, detail="POLYGON_API_KEY not set")

    from app.data.polygon_provider import backfill_history

    def run():
        backfill_history(years, settings.polygon_api_key)

    background_tasks.add_task(run)
    return {
        "message": f"Backfill started for {years} years. This runs in the background.",
        "estimated_time": f"{years * 2}-{years * 4} hours",
        "monitor": "/api/v1/admin/data/status",
    }


@router.get("/sample-tickers")
async def sample_tickers(limit: int = 20):
    """Show top tickers by number of catalyst days in cache."""
    if not CACHE_DB.exists():
        return []

    conn = sqlite3.connect(CACHE_DB)
    rows = conn.execute("""
        SELECT ticker, COUNT(*) as days, AVG(rvol) as avg_rvol
        FROM catalyst_days
        GROUP BY ticker
        ORDER BY days DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()

    return [{"ticker": r[0], "catalyst_days": r[1], "avg_rvol": round(r[2], 1)} for r in rows]


@router.post("/backfill-catalysts")
async def backfill_catalysts(background_tasks: BackgroundTasks):
    """
    Retroactively fetch real catalyst types (FDA/earnings/offering/merger/PR)
    from Polygon News API for all cached days. Safe to re-run.
    """
    settings = get_settings()
    if not settings.polygon_api_key:
        raise HTTPException(status_code=503, detail="POLYGON_API_KEY not set")

    from app.data.polygon_provider import backfill_catalyst_types

    def run():
        backfill_catalyst_types(settings.polygon_api_key)

    background_tasks.add_task(run)
    return {"message": "Catalyst backfill started in background", "monitor": "/api/v1/admin/data/catalyst-stats"}


@router.get("/catalyst-stats")
async def catalyst_stats():
    """Show breakdown of catalyst types in the cache."""
    if not CACHE_DB.exists():
        return {}

    conn = sqlite3.connect(CACHE_DB)
    rows = conn.execute("""
        SELECT catalyst_type, COUNT(*) as count
        FROM catalyst_days
        GROUP BY catalyst_type
        ORDER BY count DESC
    """).fetchall()
    conn.close()

    total = sum(r[1] for r in rows)
    return {
        "total": total,
        "breakdown": {r[0]: {"count": r[1], "pct": round(r[1] / total * 100, 1)} for r in rows},
    }


@router.post("/prefetch-floats")
async def prefetch_floats(background_tasks: BackgroundTasks):
    """
    Fetch historical float data from SEC EDGAR for all tickers in the cache.
    Runs in background. Safe to call multiple times (skips already-cached tickers).
    """
    if not CACHE_DB.exists():
        raise HTTPException(status_code=400, detail="No price cache yet. Run backfill first.")

    conn = sqlite3.connect(CACHE_DB)
    tickers = [r[0] for r in conn.execute("SELECT DISTINCT ticker FROM catalyst_days").fetchall()]
    conn.close()

    from app.data.edgar_provider import prefetch_floats_for_tickers

    def run():
        prefetch_floats_for_tickers(tickers)

    background_tasks.add_task(run)
    return {
        "message": f"Fetching EDGAR float history for {len(tickers)} tickers in background",
        "tickers": tickers,
        "source": "SEC EDGAR (free)",
    }


@router.get("/float-coverage")
async def float_coverage():
    """Show how many tickers have historical float data from EDGAR."""
    if not CACHE_DB.exists():
        return {"covered": 0, "missing": 0, "tickers": []}

    conn = sqlite3.connect(CACHE_DB)
    all_tickers = {r[0] for r in conn.execute("SELECT DISTINCT ticker FROM catalyst_days").fetchall()}

    covered_rows = conn.execute("""
        SELECT ticker, COUNT(*) as quarters, MIN(period_end) as earliest, MAX(period_end) as latest
        FROM float_history
        WHERE ticker IN ({})
        GROUP BY ticker
    """.format(",".join("?" * len(all_tickers))), list(all_tickers)).fetchall()
    conn.close()

    covered = {r[0]: {"quarters": r[1], "earliest": r[2], "latest": r[3]} for r in covered_rows}
    missing = sorted(all_tickers - set(covered.keys()))

    return {
        "total_tickers": len(all_tickers),
        "covered": len(covered),
        "missing_count": len(missing),
        "missing_tickers": missing,
        "coverage_pct": round(len(covered) / len(all_tickers) * 100, 1) if all_tickers else 0,
        "details": covered,
    }
