"""Admin endpoints for the Polygon.io data pipeline."""

from datetime import date
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.core.config import get_settings

router = APIRouter(prefix="/admin/data", tags=["data-admin"])


@router.get("/status")
async def cache_status():
    from app.data.polygon_provider import get_cached_count
    try:
        info = get_cached_count()
    except Exception as e:
        return {"cached": False, "error": str(e)}
    return {
        "cached": info["records"] > 0,
        "catalyst_day_records": info["records"],
        "unique_tickers": info["unique_tickers"],
        "earliest_date": info["earliest"],
        "latest_date": info["latest"],
        "source": "polygon.io" if not get_settings().use_mock_data else "mock",
        "storage": "postgresql",
    }


@router.post("/fetch-day")
async def fetch_single_day(target_date: str, background_tasks: BackgroundTasks):
    settings = get_settings()
    if not settings.polygon_api_key:
        raise HTTPException(503, "POLYGON_API_KEY not set")
    try:
        d = date.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(400, "Invalid date. Use YYYY-MM-DD")

    from app.data.polygon_provider import fetch_and_cache_day
    background_tasks.add_task(fetch_and_cache_day, d, settings.polygon_api_key)
    return {"message": f"Fetching {target_date} in background", "monitor": "/api/v1/admin/data/status"}


@router.post("/backfill")
async def backfill(years: int = 1, background_tasks: BackgroundTasks = None):
    if years > 5:
        raise HTTPException(400, "Max 5 years")
    settings = get_settings()
    if not settings.polygon_api_key:
        raise HTTPException(503, "POLYGON_API_KEY not set")

    from app.data.polygon_provider import backfill_history
    background_tasks.add_task(backfill_history, years, settings.polygon_api_key)
    return {
        "message": f"Backfill started for {years} year(s) — running in background.",
        "estimated_hours": f"{years}-{years * 2}",
        "monitor": "/api/v1/admin/data/status",
        "storage": "postgresql (persists across deploys)",
    }


@router.get("/sample-tickers")
async def sample_tickers(limit: int = 20):
    from app.models.db_models import PolygonCatalystDay
    from app.data.database import SessionLocal
    from sqlalchemy import func
    db = SessionLocal()
    try:
        rows = (
            db.query(
                PolygonCatalystDay.ticker,
                func.count(PolygonCatalystDay.date).label("days"),
                func.avg(PolygonCatalystDay.rvol).label("avg_rvol"),
            )
            .group_by(PolygonCatalystDay.ticker)
            .order_by(func.count(PolygonCatalystDay.date).desc())
            .limit(limit)
            .all()
        )
        return [{"ticker": r.ticker, "catalyst_days": r.days,
                 "avg_rvol": round(float(r.avg_rvol or 0), 1)} for r in rows]
    finally:
        db.close()
