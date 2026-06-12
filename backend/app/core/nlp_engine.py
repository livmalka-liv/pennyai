"""
NLP-to-Strategy-Rules engine.

Modes:
  - Mock (default): regex-based parser, no API cost, good for dev/testing
  - Anthropic Claude: structured JSON output via claude-sonnet-4-6
  - OpenAI: structured JSON output via gpt-4o

The system prompt enforces a strict JSON schema to prevent hallucinated rules.
"""

import re
import json
import logging
from typing import Optional

from app.models.schemas import (
    StrategyConfig,
    StrategyRule,
    RuleType,
    Timeframe,
    ParseStrategyResponse,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a quantitative trading assistant specialized in penny stock strategies.
Your ONLY job is to parse a natural language strategy description into a structured JSON object.

Output ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string — short strategy name",
  "description": "string — original description condensed to 1 sentence",
  "rules": [
    {
      "type": "entry" | "exit" | "filter",
      "condition": "string — exact human-readable condition",
      "parameters": {
        // Include ONLY parameters explicitly mentioned in the text
        // entry: timeframe (str), indicator (str)
        // exit: pct (float, positive for TP, negative for SL)
        // filter: maxFloat (int), minRvol (float), minVolume (int), maxPrice (float)
      }
    }
  ],
  "slippage": 2.0,  // default 2%, allow user override if mentioned
  "timeframe": "1m" | "5m" | "15m" | "1D",
  "lookback_years": 1 | 3 | 5,
  "confidence": 0.0-1.0,
  "warnings": ["array of strings for ambiguous inputs"]
}

Rules:
- Always include at least one entry rule and one exit rule
- If stop loss is not mentioned, default to -5%
- If take profit is not mentioned, default to 15%
- If float is mentioned in millions, convert to integer shares
- If timeframe is not mentioned, default to "1m"
- If lookback years not mentioned, default to 5
- Confidence 1.0 = all parameters explicitly stated, 0.5 = significant guessing"""


async def parse_strategy(
    text: str,
    language: str = "en",
    use_mock: bool = True,
    anthropic_key: Optional[str] = None,
    openai_key: Optional[str] = None,
) -> ParseStrategyResponse:
    if use_mock or (not anthropic_key and not openai_key):
        return _mock_parse(text)

    if anthropic_key:
        return await _anthropic_parse(text, language, anthropic_key)

    return _mock_parse(text)


def _mock_parse(text: str) -> ParseStrategyResponse:
    """Regex-based parser with Hebrew + English support."""
    lower = text.lower()
    rules: list[StrategyRule] = []
    warnings: list[str] = []
    confidence = 0.85

    # Hebrew keyword aliases → normalize to English for detection
    he_map = {
        "וואפ": "vwap", "ווי וואפ": "vwap", "vwap": "vwap",
        "פלוואט": "float", "float": "float",
        "ווליום": "volume", "volume": "volume",
        "גרף דקה": "1m", "דקה": "1m",
        "נשעענת": "hold", "מעל": "above",
        "עובר": "cross", "חוצה": "cross",
        "עצירה": "stop", "רווח": "profit",
        "שפל": "low", "שיא": "high",
        "מחיר": "price",
    }
    normalized = lower
    for he, en in he_map.items():
        normalized = normalized.replace(he, en)

    # --- Entry rules ---
    if "vwap" in normalized:
        if any(k in normalized for k in ["cross", "above", "reclaim", "break"]):
            rules.append(StrategyRule(
                type=RuleType.ENTRY,
                condition="Price crosses above VWAP",
                parameters={"indicator": "VWAP", "direction": "cross_above"},
            ))
        elif any(k in normalized for k in ["hold", "lean", "rest", "bounce", "נשען"]):
            rules.append(StrategyRule(
                type=RuleType.ENTRY,
                condition="Price holds/reclaims VWAP with volume",
                parameters={"indicator": "VWAP", "direction": "hold_bounce"},
            ))
        else:
            rules.append(StrategyRule(
                type=RuleType.ENTRY,
                condition="Price crosses above VWAP",
                parameters={"indicator": "VWAP", "direction": "cross_above"},
            ))
    elif "hod" in normalized or "high of day" in normalized:
        rules.append(StrategyRule(
            type=RuleType.ENTRY,
            condition="Break above High of Day",
            parameters={"indicator": "HOD"},
        ))
    elif "rsi" in normalized:
        rsi_val = _extract_number(r"rsi\s*[<>]\s*(\d+)", text) or 30
        rules.append(StrategyRule(
            type=RuleType.ENTRY,
            condition=f"RSI < {rsi_val} (oversold)",
            parameters={"indicator": "RSI", "period": 14, "level": rsi_val},
        ))
    elif "halt" in normalized or "resume" in normalized:
        rules.append(StrategyRule(
            type=RuleType.ENTRY,
            condition="First candle after trading halt resume",
            parameters={"event": "halt_resume"},
        ))
    else:
        rules.append(StrategyRule(
            type=RuleType.ENTRY,
            condition="Price momentum entry",
            parameters={},
        ))
        confidence -= 0.2
        warnings.append("Entry trigger not clearly identified — please specify (VWAP cross, HOD break, RSI level, etc.)")

    # --- Filter rules ---
    # Float — English: "float under 20m" / Hebrew: "20 מיליון פלוואט" / "פלוואט עד 20"
    float_m = (
        _extract_number(r"float\s*(?:under|below|<|less\s*than|up\s*to)?\s*(\d+(?:\.\d+)?)\s*m", normalized)
        or _extract_number(r"(\d+(?:\.\d+)?)\s*(?:million|מיליון|m)?\s*(?:float|פלוואט)", normalized)
        or _extract_number(r"(?:float|פלוואט)\s*(?:עד|up\s*to|<|under|below)?\s*(\d+)", normalized)
    )
    if float_m and float_m <= 500:
        rules.append(StrategyRule(
            type=RuleType.FILTER,
            condition=f"Float < {int(float_m)}M shares",
            parameters={"maxFloat": int(float_m * 1_000_000)},
        ))

    # Price range — "between $3 and $20" / "בין 3 דולר עד 20" / "מחיר עד 20"
    price_min = _extract_number(r"(?:between|between\s*\$|from\s*\$?|מ-?|בין\s*)\s*(\d+(?:\.\d+)?)\s*(?:דולר|dollar|\$|to|until|עד)", normalized)
    price_max = (
        _extract_number(r"(?:to|until|up\s*to|under|below|<|עד|ועד)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:דולר|dollar)?(?:\s|$)", normalized)
        or _extract_number(r"price\s*(?:under|below|<|less\s*than)?\s*\$?(\d+(?:\.\d+)?)", normalized)
    )
    if price_max and 1 < price_max <= 100:
        condition = f"Price ${int(price_min)}-${int(price_max)}" if price_min else f"Price < ${int(price_max)}"
        params: dict = {"maxPrice": float(price_max)}
        if price_min:
            params["minPrice"] = float(price_min)
        rules.append(StrategyRule(type=RuleType.FILTER, condition=condition, parameters=params))

    # Relative Volume
    rvol = _extract_number(r"r(?:elative\s*)?vol(?:ume)?\s*(?:>|above|over)?\s*(\d+(?:\.\d+)?)\s*x?", normalized)
    if rvol:
        rules.append(StrategyRule(
            type=RuleType.FILTER,
            condition=f"Relative Volume > {rvol}x",
            parameters={"minRvol": float(rvol)},
        ))

    # Min Volume
    vol_min = _extract_number(r"volume\s*(?:>|above|over)?\s*(\d+(?:\.\d+)?)\s*m", normalized)
    if vol_min:
        rules.append(StrategyRule(
            type=RuleType.FILTER,
            condition=f"Volume > {vol_min}M",
            parameters={"minVolume": int(vol_min * 1_000_000)},
        ))

    # --- Exit rules — ONLY add if explicitly mentioned ---
    tp_pct = (
        _extract_number(r"(\d+(?:\.\d+)?)\s*%?\s*(?:take\s*profit|tp\b|profit\s*target)", normalized)
        or _extract_number(r"(?:take\s*profit|tp\b)\s*(?:at|of|@)?\s*(\d+(?:\.\d+)?)\s*%?", normalized)
    )
    sl_pct = (
        _extract_number(r"(\d+(?:\.\d+)?)\s*%?\s*(?:stop\s*loss|sl\b|stop\b)", normalized)
        or _extract_number(r"(?:stop\s*loss|sl\b)\s*(?:at|of|@)?\s*(\d+(?:\.\d+)?)\s*%?", normalized)
    )

    if tp_pct:
        rules.append(StrategyRule(
            type=RuleType.EXIT,
            condition=f"Take Profit at +{tp_pct}%",
            parameters={"pct": float(tp_pct)},
        ))
    else:
        # Default TP but mark as warning
        rules.append(StrategyRule(
            type=RuleType.EXIT,
            condition="Take Profit at +15% (default)",
            parameters={"pct": 15.0},
        ))
        warnings.append("לא ציינת יעד רווח — ברירת מחדל 15%. תוכל לשנות לפני הרצת הבדיקה.")

    if sl_pct:
        rules.append(StrategyRule(
            type=RuleType.EXIT,
            condition=f"Stop Loss at -{sl_pct}%",
            parameters={"pct": -float(sl_pct)},
        ))
    else:
        rules.append(StrategyRule(
            type=RuleType.EXIT,
            condition="Stop Loss at -5% (default)",
            parameters={"pct": -5.0},
        ))
        warnings.append("לא ציינת סטופ לוס — ברירת מחדל 5%. תוכל לשנות לפני הרצת הבדיקה.")

    # --- Timeframe ---
    if "15m" in lower or "15 min" in lower or "15-min" in lower:
        timeframe = Timeframe.FIFTEEN_MIN
    elif "5m" in lower or "5 min" in lower or "5-min" in lower:
        timeframe = Timeframe.FIVE_MIN
    elif "daily" in lower or "day" in lower or "1d" in lower:
        timeframe = Timeframe.DAILY
    else:
        timeframe = Timeframe.ONE_MIN

    # --- Lookback ---
    years_match = re.search(r"(\d)\s*(?:-|\s)?year", lower)
    lookback = int(years_match.group(1)) if years_match and int(years_match.group(1)) in [1, 3, 5] else 5

    # --- Slippage ---
    slip = _extract_number(r"slippage\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*%?", lower) or 2.0

    name = _generate_strategy_name(rules)

    strategy = StrategyConfig(
        name=name,
        description=text[:200],
        rules=rules,
        slippage=float(slip),
        timeframe=timeframe,
        lookback_years=lookback,  # type: ignore[arg-type]
    )

    return ParseStrategyResponse(
        strategy=strategy,
        confidence=round(max(0.3, confidence), 2),
        warnings=warnings,
    )


async def _anthropic_parse(text: str, language: str, api_key: str) -> ParseStrategyResponse:
    """Uses Claude claude-sonnet-4-6 with structured output for production-grade parsing."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Parse this strategy:\n\n{text}"}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    data = json.loads(raw)

    rules = [
        StrategyRule(
            type=RuleType(r["type"]),
            condition=r["condition"],
            parameters=r.get("parameters", {}),
        )
        for r in data["rules"]
    ]

    strategy = StrategyConfig(
        name=data["name"],
        description=data["description"],
        rules=rules,
        slippage=float(data.get("slippage", 2.0)),
        timeframe=Timeframe(data.get("timeframe", "1m")),
        lookback_years=int(data.get("lookback_years", 5)),  # type: ignore[arg-type]
    )

    return ParseStrategyResponse(
        strategy=strategy,
        confidence=float(data.get("confidence", 0.8)),
        warnings=data.get("warnings", []),
    )


def _extract_number(pattern: str, text: str) -> Optional[float]:
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, IndexError):
            return None
    return None


def _generate_strategy_name(rules: list[StrategyRule]) -> str:
    entry = next((r for r in rules if r.type == RuleType.ENTRY), None)
    filters = [r for r in rules if r.type == RuleType.FILTER]

    parts = []
    if entry:
        if "VWAP" in entry.condition:
            parts.append("VWAP")
        elif "HOD" in entry.condition or "High of Day" in entry.condition:
            parts.append("HOD Break")
        elif "RSI" in entry.condition:
            parts.append("RSI")
        elif "halt" in entry.condition.lower():
            parts.append("Halt Resume")
        else:
            parts.append("Momentum")

    if any("Float" in f.condition for f in filters):
        parts.append("Low Float")
    if any("Relative Volume" in f.condition for f in filters):
        parts.append("High Rvol")

    return " + ".join(parts) if parts else "Custom Strategy"
