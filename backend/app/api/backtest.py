import asyncio
import uuid
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.models.schemas import (
    ParseStrategyRequest,
    ParseStrategyResponse,
    RunBacktestRequest,
    BacktestResult,
)
from app.core.nlp_engine import parse_strategy
from app.core.backtest_engine import run_backtest
from app.core.config import get_settings
from app.core.auth import get_optional_user
from app.data.database import get_db
from app.models.db_models import BacktestRun, BacktestTrade, User

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("/parse", response_model=ParseStrategyResponse)
async def parse_strategy_endpoint(request: ParseStrategyRequest):
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
async def run_backtest_endpoint(
    request: RunBacktestRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    try:
        result = await asyncio.to_thread(run_backtest, request.strategy)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Save run + trades to DB for tracking
    try:
        run = BacktestRun(
            id=result.id,
            user_id=user.id if user else None,
            strategy_name=request.strategy.name,
            lookback_years=request.strategy.lookback_years,
            total_trades=result.metrics.total_trades,
            win_rate=result.metrics.win_rate,
            total_roi=result.metrics.total_roi,
            profit_factor=result.metrics.profit_factor,
            max_drawdown=result.metrics.max_drawdown,
            sharpe_ratio=result.metrics.sharpe_ratio,
        )
        db.add(run)

        for t in result.trades:
            db.add(BacktestTrade(
                id=str(uuid.uuid4()),
                run_id=result.id,
                strategy_name=request.strategy.name,
                ticker=t.ticker,
                trade_date=t.date,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                return_pct=t.return_pct,
                exit_reason=t.exit_reason,
                rvol=t.rvol,
                catalyst_type=t.catalyst_type,
                holding_minutes=t.holding_minutes,
            ))

        db.commit()
    except Exception:
        db.rollback()  # Don't fail the response if save fails

    return result
