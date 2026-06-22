import asyncio
import json
import uuid
from typing import Literal, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
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


# ── Clarification chat ────────────────────────────────────────────────────────

class ClarifyMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ClarifyRequest(BaseModel):
    description: str = Field(min_length=1)
    conversation: list[ClarifyMessage] = Field(default_factory=list)
    language: Literal["en", "he"] = "he"


class ClarifyResponse(BaseModel):
    message: str
    is_ready: bool = False
    refined_description: Optional[str] = None


_CLARIFY_SYSTEM = """You are a precision penny-stock strategy analyst for PennyAI.
Your job: ask ONE targeted developer-style question at a time to fully define the strategy.

Priority of missing parameters (ask in this order):
1. Entry trigger — exact signal (VWAP cross, HOD break, first candle direction, gap %)
2. Stop loss — % or price level
3. Take profit / exit target — % or HOD or R-multiple
4. Float filter — max float in millions
5. RVOL filter — minimum relative volume

When you have entry + at least one exit condition defined, respond with JSON:
{"is_ready": true, "message": "מעולה, יש לי את כל המידע.", "refined_description": "one concise English sentence with all specifics"}

Otherwise respond with JSON:
{"is_ready": false, "message": "your ONE specific question in Hebrew — be brief, include a concrete example"}

RESPOND ONLY WITH VALID JSON. No markdown. No extra text."""


def _mock_clarify(request: ClarifyRequest) -> ClarifyResponse:
    desc = (request.description + " ".join(
        m.content for m in request.conversation if m.role == "user"
    )).lower()
    conv_turns = len([m for m in request.conversation if m.role == "user"])

    has_entry  = any(w in desc for w in ["vwap", "hod", "פריצ", "כניס", "קנדל", "entry", "break", "cross", "gap"])
    has_stop   = any(w in desc for w in ["סטופ", "stop", "sl", "הפסד", "-5", "-3", "-10"])
    has_target = any(w in desc for w in ["יעד", "tp", "רווח", "target", "+10", "+15", "+20", "r:"])
    has_float  = any(w in desc for w in ["פלואט", "float", "מיליון", "million", "5m", "10m"])

    if conv_turns >= 4 or (has_entry and has_stop and has_target):
        answers = [m.content for m in request.conversation if m.role == "user"]
        refined = request.description + (". " + ". ".join(answers) if answers else "")
        return ClarifyResponse(
            message="מעולה! יש לי את כל המידע — האסטרטגיה מוכנה לבדיקה.",
            is_ready=True,
            refined_description=refined.strip(),
        )

    if not has_entry or conv_turns == 0:
        return ClarifyResponse(message="מה בדיוק מפעיל את הכניסה? (לדוגמה: פריצת ה-VWAP בקנדל הראשון אחרי 9:45, ריטרייסמנט ל-VWAP, פריצת HOD על ווליום גבוה)")
    if not has_stop:
        return ClarifyResponse(message="מה הסטופ לוס? (לדוגמה: 5%- מתחת לכניסה, מתחת לנמוך של קנדל הכניסה, מתחת ל-VWAP)")
    if not has_target:
        return ClarifyResponse(message="מה יעד הרווח? (לדוגמה: +15% ביחס לכניסה, HOD, 2:1 ביחס לסטופ)")
    if not has_float:
        return ClarifyResponse(message="האם יש פילטר פלואט? מה הפלואט המקסימלי שמקובל עליך? (לדוגמה: עד 5M, עד 10M)")

    answers = [m.content for m in request.conversation if m.role == "user"]
    refined = request.description + ". " + ". ".join(answers)
    return ClarifyResponse(
        message="מעולה! האסטרטגיה מוכנה לבדיקה.",
        is_ready=True,
        refined_description=refined.strip(),
    )


@router.post("/clarify", response_model=ClarifyResponse)
async def clarify_strategy_endpoint(request: ClarifyRequest):
    settings = get_settings()

    if not settings.use_mock_llm and settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            messages = [{"role": m.role, "content": m.content} for m in request.conversation]
            if not messages or messages[-1]["role"] != "user":
                messages.append({"role": "user", "content": f"האסטרטגיה שלי: {request.description}"})
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=_CLARIFY_SYSTEM,
                messages=messages,
            )
            data = json.loads(resp.content[0].text)
            return ClarifyResponse(
                message=data["message"],
                is_ready=data.get("is_ready", False),
                refined_description=data.get("refined_description"),
            )
        except Exception:
            pass

    return _mock_clarify(request)


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
