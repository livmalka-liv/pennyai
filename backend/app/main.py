import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.backtest import router as backtest_router
from app.api.strategies import router as strategies_router
from app.api.data_admin import router as data_router
from app.api.routes.live_lab import router as live_lab_router
from app.api.routes.auth import router as auth_router
from app.api.routes.stripe_routes import router as stripe_router
from app.api.routes.brokers import router as brokers_router
from app.api.routes.chat import router as chat_router
from app.api.routes.tracker import router as tracker_router
from app.api.routes.live_strategies import router as live_strategies_router
from app.api.routes.performance import router as performance_router
from app.api.routes.wpattern import router as wpattern_router
from app.api.routes.overnight import router as overnight_router
from app.api.routes.scanner_push import router as scanner_push_router
from app.core.config import get_settings
from app.data.database import init_db
from app.core.scheduler import start_scheduler

settings = get_settings()


async def _prewarm_backtest_cache() -> None:
    """Pre-generate a small mock dataset so the first backtest request is fast."""
    try:
        from app.data.mock_provider import generate_catalyst_days
        await asyncio.to_thread(generate_catalyst_days, 1)
    except Exception:
        pass


async def _init_db_with_retry(max_attempts: int = 10, delay: float = 3.0) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            await asyncio.to_thread(init_db)
            return
        except Exception as exc:
            if attempt == max_attempts:
                raise
            await asyncio.sleep(delay)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _init_db_with_retry()
    start_scheduler()
    asyncio.create_task(_prewarm_backtest_cache())
    yield


app = FastAPI(
    title="Trading Test API",
    description="AI-powered penny stock backtesting + live lab",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router, prefix="/api/v1")
app.include_router(strategies_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")
app.include_router(live_lab_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(stripe_router, prefix="/api/v1")
app.include_router(brokers_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(tracker_router, prefix="/api/v1")
app.include_router(live_strategies_router, prefix="/api/v1")
app.include_router(performance_router, prefix="/api/v1")
app.include_router(wpattern_router, prefix="/api/v1")
app.include_router(overnight_router, prefix="/api/v1")
app.include_router(scanner_push_router, prefix="/api/v1")


@app.get("/health")
@app.get("/בריאות")
async def health():
    return {
        "status": "ok",
        "mode": "mock" if settings.use_mock_data else "live",
        "llm": "mock" if settings.use_mock_llm else "claude",
        "live_lab": "active",
    }


@app.get("/api/v1/market-clock")
async def market_clock():
    """Public endpoint — no auth. Returns scan window + market open status."""
    from datetime import datetime, timezone
    from app.core.multi_strategy_runner import _is_market_open, _is_in_scan_window, _latest_prices
    try:
        from app.core.multi_strategy_runner import _last_data_source
    except ImportError:
        _last_data_source = "unknown"

    now_utc = datetime.now(timezone.utc)
    il_hour = (now_utc.hour + 3) % 24
    et_hour = (now_utc.hour - 4) % 24
    return {
        "market_open": _is_market_open(),
        "scan_window_active": _is_in_scan_window(),
        "time_israel": f"{il_hour:02d}:{now_utc.minute:02d}",
        "time_et": f"{et_hour:02d}:{now_utc.minute:02d}",
        "tracked_count": len(_latest_prices),
        "tracked_tickers": sorted(_latest_prices.keys()),
        "data_source": _last_data_source,
        "market_opens_israel": "16:30",
        "market_closes_israel": "23:00",
    }
