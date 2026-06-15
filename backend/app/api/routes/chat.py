"""AI Chat 24/7 — trading assistant powered by Claude."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import anthropic
import json

from app.core.auth import get_current_user
from app.models.db_models import User

router = APIRouter(prefix="/chat", tags=["chat"])

client = anthropic.Anthropic()

SYSTEM_PROMPT = """אתה פני — עוזר מסחר AI מקצועי של PennyAI. אתה מתמחה במניות פני סטוק, מסחר יומי, וניתוח טכני.

הכישורים שלך:
- אסטרטגיות מסחר: VWAP, Gap and Go, HOD Breakout, Float Rotation
- ניתוח טכני: פלואט, RVOL, קטליסטים, טייפ רידינג
- ניהול סיכונים: גודל פוזיציה, סטופ לוס, יחס סיכוי/סיכון
- Backtesting: פרשנות תוצאות, הימנעות מ-overfitting
- ברוקרים: IBKR, Colmex, פיצ'רים, עמלות

כללים:
- ענה תמיד בעברית אלא אם המשתמש כותב אנגלית
- תשובות קצרות וממוקדות — לא הרצאות
- השתמש בנתונים ספציפיים כשאפשר (אחוזים, מספרים)
- אם שואלים על מניה ספציפית — הסבר את הפרמטרים הרלוונטיים
- אל תתן המלצות קנה/מכור ספציפיות — רק חינוך ועקרונות
- היה ישיר, מקצועי, ידידותי"""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@router.post("/message")
async def chat_message(body: ChatRequest, user: User = Depends(get_current_user)):
    """Stream a response from Claude for the trading chat."""

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def generate():
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
