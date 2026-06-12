import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.backtest import router as backtest_router
from app.api.strategies import router as strategies_router
from app.api.data_admin import router as data_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Trading Test API",
    description="AI-powered penny stock backtesting engine",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://pennyai.app",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router, prefix="/api/v1")
app.include_router(strategies_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": "mock" if settings.use_mock_data else "live",
        "llm": "mock" if settings.use_mock_llm else "claude",
    }
