from fastapi import APIRouter
from app.models.schemas import SubscriptionTier

router = APIRouter(prefix="/strategies", tags=["strategies"])

VAULT_STRATEGIES = [
    {
        "id": "vs_001",
        "name": "The Morning Spike",
        "tagline": "Capture the first explosive move of pre-market catalysts",
        "verified_roi": 184,
        "verified_years": 5,
        "win_rate": 61,
        "total_trades": 287,
        "tier": SubscriptionTier.ELITE,
        "config": {
            "name": "The Morning Spike",
            "description": "Pre-market catalyst VWAP cross within first 30 minutes",
            "rules": [
                {"type": "entry", "condition": "First VWAP cross after open", "parameters": {"window": 30}},
                {"type": "filter", "condition": "Float < 15M", "parameters": {"maxFloat": 15_000_000}},
                {"type": "exit", "condition": "Take Profit", "parameters": {"pct": 20}},
                {"type": "exit", "condition": "Stop Loss", "parameters": {"pct": -6}},
            ],
            "slippage": 2.5,
            "timeframe": "1m",
            "lookback_years": 5,
        },
    },
    {
        "id": "vs_002",
        "name": "VWAP Hold & Reclaim",
        "tagline": "Trade the institutional rejection and reclaim pattern",
        "verified_roi": 210,
        "verified_years": 5,
        "win_rate": 67,
        "total_trades": 411,
        "tier": SubscriptionTier.PRO,
        "config": {
            "name": "VWAP Hold & Reclaim",
            "description": "VWAP dip, consolidation, and reclaim with volume confirmation",
            "rules": [
                {"type": "entry", "condition": "VWAP reclaim after consolidation below", "parameters": {}},
                {"type": "filter", "condition": "Relative Volume > 5x", "parameters": {"minRvol": 5}},
                {"type": "exit", "condition": "Take Profit", "parameters": {"pct": 12}},
                {"type": "exit", "condition": "Stop Loss", "parameters": {"pct": -4}},
            ],
            "slippage": 2.0,
            "timeframe": "1m",
            "lookback_years": 5,
        },
    },
]


@router.get("/vault")
async def get_vault_strategies(tier: SubscriptionTier = SubscriptionTier.FREE):
    """Return strategies visible to the user's tier."""
    tier_order = [SubscriptionTier.FREE, SubscriptionTier.TESTER, SubscriptionTier.PRO, SubscriptionTier.ELITE]
    user_level = tier_order.index(tier)

    return [
        {**s, "locked": tier_order.index(s["tier"]) > user_level}
        for s in VAULT_STRATEGIES
    ]
