from pydantic import BaseModel, Field
from typing import Literal, Optional
from enum import Enum



class SubscriptionTier(str, Enum):
    FREE = "free"
    TESTER = "tester"
    PRO = "pro"
    ELITE = "elite"


class Timeframe(str, Enum):
    ONE_MIN = "1m"
    FIVE_MIN = "5m"
    FIFTEEN_MIN = "15m"
    DAILY = "1D"


class RuleType(str, Enum):
    ENTRY = "entry"
    EXIT = "exit"
    FILTER = "filter"


class StrategyRule(BaseModel):
    type: RuleType
    condition: str
    parameters: dict = Field(default_factory=dict)


class StrategyConfig(BaseModel):
    name: str
    description: str
    rules: list[StrategyRule]
    slippage: float = Field(ge=0, le=10, description="Slippage as % of trade value")
    timeframe: Timeframe = Timeframe.ONE_MIN
    lookback_years: Literal[1, 3, 5, 10, 15, 20] = 5


class ParseStrategyRequest(BaseModel):
    text: str = Field(min_length=10, max_length=2000)
    language: Literal["en", "he"] = "en"


class ParseStrategyResponse(BaseModel):
    strategy: StrategyConfig
    confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)


class RunBacktestRequest(BaseModel):
    strategy: StrategyConfig
    user_id: str = "anonymous"


class TradeResult(BaseModel):
    id: str
    ticker: str
    date: str
    type: Literal["Long"] = "Long"
    entry_price: float
    exit_price: float
    return_pct: float
    holding_minutes: int
    volume: int
    float_shares: int
    exit_reason: Optional[str] = None
    rvol: Optional[float] = None
    catalyst_type: Optional[str] = None


class BacktestMetrics(BaseModel):
    total_roi: float
    win_rate: float
    profit_factor: float
    max_drawdown: float
    avg_return_per_trade: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_holding_minutes: float
    sharpe_ratio: float
    avg_trades_per_month: float = 0
    avg_opportunities_per_day: float = 0
    best_trade: float = 0
    worst_trade: float = 0
    avg_win: float = 0
    avg_loss: float = 0
    consecutive_wins: int = 0
    consecutive_losses: int = 0


class EquityPoint(BaseModel):
    date: str
    equity: float


class DurabilityPeriod(BaseModel):
    period: str
    roi: float
    win_rate: float
    trades: int
    sharpe: float


class BurnAnalysis(BaseModel):
    # Worst drawdown period
    max_drawdown_pct: float
    drawdown_start: str
    drawdown_end: str
    drawdown_duration_days: int
    # Ruin scenario
    ruin_occurred: bool
    ruin_date: Optional[str] = None
    months_to_ruin: Optional[float] = None
    # Worst losing streak
    max_consecutive_losses: int
    worst_streak_return_pct: float
    worst_streak_start: Optional[str] = None
    worst_streak_end: Optional[str] = None
    # Recovery hardship
    longest_flat_days: int           # Longest days without new equity high
    # Plain-language verdict
    verdict: str


class BacktestResult(BaseModel):
    id: str
    status: Literal["pending", "running", "completed", "failed"]
    strategy: StrategyConfig
    metrics: BacktestMetrics
    equity_curve: list[EquityPoint]
    trades: list[TradeResult]
    durability_by_year: list[DurabilityPeriod] = Field(default_factory=list)
    burn_analysis: Optional[BurnAnalysis] = None
    created_at: str


class StripeCheckoutRequest(BaseModel):
    tier: Literal["tester", "pro", "elite"]
    billing: Literal["monthly", "yearly"] = "monthly"
    user_id: str
    success_url: str
    cancel_url: str
