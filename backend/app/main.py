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
from app.core.config import get_settings
from app.data.database import init_db
from app.core.scheduler import start_scheduler

settings = get_settings()


async def _prewarm_backtest_cache() -> None:
    """Pre-generate mock catalyst data in the background so first user request is instant."""
    try:
        from app.data.mock_provider import generate_catalyst_days
        for years in [1, 3, 5, 10, 15, 20]:
            await asyncio.to_thread(generate_catalyst_days, years)
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


@app.get("/health")
@app.get("/בריאות")
async def health():
    return {
        "status": "ok",
        "mode": "mock" if settings.use_mock_data else "live",
        "llm": "mock" if settings.use_mock_llm else "claude",
        "live_lab": "active",
    }
