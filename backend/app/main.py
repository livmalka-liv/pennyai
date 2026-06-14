import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.backtest import router as backtest_router
from app.api.strategies import router as strategies_router
from app.api.data_admin import router as data_router
from app.api.routes.live_lab import router as live_lab_router
from app.api.routes.auth import router as auth_router
from app.core.config import get_settings
from app.data.database import init_db
from app.core.scheduler import start_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
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


@app.get("/health")
@app.get("/בריאות")
async def health():
    return {
        "status": "ok",
        "mode": "mock" if settings.use_mock_data else "live",
        "llm": "mock" if settings.use_mock_llm else "claude",
        "live_lab": "active",
    }
