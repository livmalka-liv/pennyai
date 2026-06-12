from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class CandleData:
    ticker: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    vwap: float


@dataclass
class CatalystDay:
    ticker: str
    date: date
    open_price: float
    pre_market_gap_pct: float
    day_volume: int
    float_shares: int
    rvol: float
    catalyst_type: str
    candles_1m: list[CandleData]
