"""
Simulates Polygon.io intraday data for penny stocks.

Production replacement: swap generate_catalyst_days() with a real Polygon.io
paginated query filtered by: close price $1-$10, day volume > 1M, day_change > 10%.
Cache results in PostgreSQL to avoid re-fetching.
"""

import random
from datetime import date, timedelta, datetime

import numpy as np

from app.data.types import CandleData, CatalystDay

# Module-level cache — generated once per process lifetime, per lookback_years
_MOCK_CACHE: dict[float, list] = {}

PENNY_TICKERS = [
    "TNXP", "MULN", "SNDL", "MVIS", "WKHS", "FFIE", "NKLA", "IDEX",
    "GOVX", "CNTX", "PROG", "BCRX", "OCGN", "GFAI", "VERB", "ATER",
    "CLOV", "EXPR", "BBIG", "SPRT",
]

# ~35 catalyst events per year — realistic for a quality scanner, keeps backtest fast
CATALYSTS_PER_YEAR = 35


def generate_catalyst_days(
    lookback_years: float = 5.0,
    min_rvol: float = 2.0,
    max_float_m: float = 50.0,
) -> list[CatalystDay]:
    """Generate realistic synthetic catalyst days for backtesting."""
    if lookback_years in _MOCK_CACHE:
        return _MOCK_CACHE[lookback_years]

    rng = random.Random(42)

    end = date.today()
    start = end - timedelta(days=int(lookback_years * 365.25))

    # Collect all trading days in the range
    trading_days: list[date] = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            trading_days.append(cur)
        cur += timedelta(days=1)

    # Sample a fixed number of catalyst days (predictable performance)
    target = min(len(trading_days), int(lookback_years * CATALYSTS_PER_YEAR))
    sampled = sorted(rng.sample(trading_days, target))

    days: list[CatalystDay] = []
    for day in sampled:
        ticker = rng.choice(PENNY_TICKERS)
        float_shares = int(rng.uniform(1_000_000, max_float_m * 1_000_000))
        open_price = round(rng.uniform(1.0, 9.5), 2)
        gap_pct = rng.uniform(10, 150)
        rvol = rng.uniform(min_rvol, 25.0)
        catalyst = rng.choice(["earnings", "fda", "pr", "pr", "dilution_halt"])

        candles = _generate_1m_candles(rng, ticker, day, open_price, gap_pct, rvol)

        days.append(CatalystDay(
            ticker=ticker,
            date=day,
            open_price=open_price,
            pre_market_gap_pct=gap_pct,
            day_volume=int(rvol * rng.uniform(800_000, 3_000_000)),
            float_shares=float_shares,
            rvol=rvol,
            catalyst_type=catalyst,
            candles_1m=candles,
        ))

    _MOCK_CACHE[lookback_years] = days
    return days


def _generate_1m_candles(
    rng: random.Random,
    ticker: str,
    day: date,
    open_price: float,
    gap_pct: float,
    rvol: float,
) -> list[CandleData]:
    """Generate 240 one-minute candles using vectorized numpy for speed."""
    n = 240
    market_open = datetime(day.year, day.month, day.day, 9, 30)

    # Vectorized volatility multipliers
    minutes = np.arange(n)
    vol_mult = np.where(minutes < 30, 3.5, np.where(minutes < 120, 1.0, 0.7))

    # Vectorized trend
    trend = _get_trend_array(minutes, gap_pct, rng)
    noise = np.array([rng.gauss(0, 0.015) for _ in range(n)]) * vol_mult
    change_pct = trend + noise

    # Build price series
    prices = np.empty(n + 1)
    prices[0] = open_price
    for i in range(n):
        prices[i + 1] = max(0.01, prices[i] * (1 + change_pct[i]))

    opens_ = prices[:n]
    closes_ = prices[1:]
    spread = np.array([rng.uniform(1.0, 1.0 + 0.01 * vm) for vm in vol_mult])
    highs_ = np.maximum(opens_, closes_) * spread
    lows_ = np.minimum(opens_, closes_) / spread

    vols_ = np.array([int(rng.uniform(5_000, 80_000) * vol_mult[i] * rvol / 5) for i in range(n)])

    # VWAP as cumulative (h+l+c)/3 * vol / cum_vol
    typ_price = (highs_ + lows_ + closes_) / 3
    cum_pv = np.cumsum(typ_price * vols_)
    cum_vol = np.cumsum(vols_)
    vwaps_ = cum_pv / np.maximum(cum_vol, 1)

    candles = []
    for i in range(n):
        candles.append(CandleData(
            ticker=ticker,
            timestamp=market_open + timedelta(minutes=i),
            open=round(float(opens_[i]), 4),
            high=round(float(highs_[i]), 4),
            low=round(float(lows_[i]), 4),
            close=round(float(closes_[i]), 4),
            volume=int(vols_[i]),
            vwap=round(float(vwaps_[i]), 4),
        ))
    return candles


def _get_trend_array(minutes: np.ndarray, gap_pct: float, rng: random.Random) -> np.ndarray:
    """Vectorized per-minute drift — penny stock intraday shape."""
    strength = min(gap_pct / 50, 2.0)
    trend = np.zeros(len(minutes))

    trend[minutes < 8] = 0.006 * strength
    trend[(minutes >= 8) & (minutes < 25)] = 0.003 * strength
    trend[(minutes >= 25) & (minutes < 55)] = -0.0015
    mask_base = (minutes >= 55) & (minutes < 90)
    trend[mask_base] = np.array([rng.uniform(-0.0008, 0.0004) for _ in range(mask_base.sum())])
    mask_leg2 = (minutes >= 90) & (minutes < 160)
    for i in np.where(mask_leg2)[0]:
        trend[i] = 0.004 * strength if rng.random() < 0.70 else rng.uniform(-0.001, 0.001)
    mask_fade = minutes >= 160
    trend[mask_fade] = np.array([rng.uniform(-0.001, 0.0005) for _ in range(mask_fade.sum())])

    return trend
