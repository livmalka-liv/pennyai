from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from app.models.schemas import (
    ParseStrategyRequest,
    ParseStrategyResponse,
    RunBacktestRequest,
    BacktestResult,
)
from app.core.nlp_engine import parse_strategy
from app.core.backtest_engine import run_backtest
from app.core.config import get_settings

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("/parse", response_model=ParseStrategyResponse)
async def parse_strategy_endpoint(request: ParseStrategyRequest):
    """
    Parse natural language strategy into structured rules.
    Uses Claude claude-sonnet-4-6 in prod, regex-based mock in dev.
    """
    settings = get_settings()
    try:
        result = await parse_strategy(
            text=request.text,
            language=request.language,
            use_mock=settings.use_mock_llm,
            anthropic_key=settings.anthropic_api_key or None,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run", response_model=BacktestResult)
async def run_backtest_endpoint(request: RunBacktestRequest):
    """
    Execute a vectorized backtest against historical penny stock data.

    Tier enforcement:
    - Tester: daily bars only, max 1yr lookback, max 20 runs/month
    - Pro: intraday bars, max 5yr lookback, unlimited runs
    - Elite: all Pro features + vault access

    Production: offload to Celery worker for large backtests,
    return job ID, poll /backtest/status/{id} for result.
    """
    try:
        result = run_backtest(request.strategy)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
