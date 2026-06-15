"""
Simulates Polygon.io intraday data for penny stocks.

Production replacement: swap generate_catalyst_days() with a real Polygon.io
paginated query filtered by: close price $1-$10, day volume > 1M, day_change > 10%.
Cache results in PostgreSQL to avoid re-fetching.
"""

import random
from datetime import date, timedelta, datetime

from app.data.types import CandleData, CatalystDay

# Module-level cache — mock data is deterministic (seed=42), so we generate once per lookback_years
_MOCK_CACHE: dict[int, list] = {}

PENNY_TICKERS = [
    "TNXP", "MULN", "SNDL", "MVIS", "WKHS", "FFIE", "NKLA", "IDEX",
    "GOVX", "CNTX", "PROG", "BCRX", "OCGN", "GFAI", "VERB", "ATER",
    "CLOV", "EXPR", "BBIG", "SPRT",
]


def generate_catalyst_days(
    lookback_years: int = 5,
    min_rvol: float = 2.0,
    max_float_m: float = 50.0,
) -> list[CatalystDay]:
    """Generate realistic synthetic catalyst days for backtesting."""
    if lookback_years in _MOCK_CACHE:
        return _MOCK_CACHE[lookback_years]

    random.seed(42)
    days: list[CatalystDay] = []
    end = date.today()
    start = date(end.year - lookback_years, end.month, end.day)
    current = start

    while current <= end:
        # Skip weekends
        if current.weekday() >= 5:
            current += timedelta(days=1)
            continue

        # ~1 catalyst event per trading day on average
        num_catalysts = random.randint(0, 2)
        for _ in range(num_catalysts):
            ticker = random.choice(PENNY_TICKERS)
            float_shares = int(random.uniform(1_000_000, max_float_m * 1_000_000))
            open_price = round(random.uniform(1.0, 9.5), 2)
            gap_pct = random.uniform(10, 150)  # pre-market gap
            rvol = random.uniform(min_rvol, 25.0)
            catalyst = random.choice(["earnings", "fda", "pr", "pr", "dilution_halt"])

            candles = _generate_1m_candles(
                ticker=ticker,
                date=current,
                open_price=open_price,
                gap_pct=gap_pct,
                rvol=rvol,
            )

            days.append(CatalystDay(
                ticker=ticker,
                date=current,
                open_price=open_price,
                pre_market_gap_pct=gap_pct,
                day_volume=int(rvol * random.uniform(800_000, 3_000_000)),
                float_shares=float_shares,
                rvol=rvol,
                catalyst_type=catalyst,
                candles_1m=candles,
            ))

        current += timedelta(days=1)

    _MOCK_CACHE[lookback_years] = days
    return days


def _generate_1m_candles(
    ticker: str,
    date: date,
    open_price: float,
    gap_pct: float,
    rvol: float,
) -> list[CandleData]:
    """Generate 240 one-minute candles (9:30–1:30 PM) — covers the key penny stock session."""
    candles = []
    price = open_price
    cumulative_volume = 0
    cumulative_pv = 0.0  # price × volume for VWAP

    market_open = datetime(date.year, date.month, date.day, 9, 30)

    for minute in range(240):
        ts = market_open + timedelta(minutes=minute)
        hour_in_session = minute / 60.0

        # Volatility pattern: high at open, lower midday, pickup at close
        if hour_in_session < 0.5:
            vol_mult = 3.5
        elif hour_in_session < 2.0:
            vol_mult = 1.0
        elif hour_in_session < 5.5:
            vol_mult = 0.7
        else:
            vol_mult = 1.8

        # Trend: gap up, spike, pullback, base, potential continuation
        trend = _get_trend_factor(minute, gap_pct)
        noise = random.gauss(0, 0.015 * vol_mult)
        change_pct = trend + noise

        open_c = price
        close_c = max(0.01, price * (1 + change_pct))
        high_c = max(open_c, close_c) * random.uniform(1.0, 1.01 * vol_mult)
        low_c = min(open_c, close_c) * random.uniform(0.99 / vol_mult, 1.0)
        vol = int(random.uniform(5_000, 80_000) * vol_mult * rvol / 5)

        cumulative_volume += vol
        cumulative_pv += ((high_c + low_c + close_c) / 3) * vol
        vwap = cumulative_pv / cumulative_volume if cumulative_volume > 0 else price

        candles.append(CandleData(
            ticker=ticker,
            timestamp=ts,
            open=round(open_c, 4),
            high=round(high_c, 4),
            low=round(low_c, 4),
            close=round(close_c, 4),
            volume=vol,
            vwap=round(vwap, 4),
        ))
        price = close_c

    return candles


def _get_trend_factor(minute: int, gap_pct: float) -> float:
    """Returns per-minute drift based on typical penny stock intraday shape."""
    strength = min(gap_pct / 50, 2.0)  # 50% gapper = strength 1.0, 100% = 2.0

    if minute < 8:          # Explosive open — gap continuation
        return 0.006 * strength
    elif minute < 25:       # Morning spike continuation
        return 0.003 * strength
    elif minute < 55:       # First pullback (not too deep — healthy flag)
        return -0.0015
    elif minute < 90:       # Base building / flag consolidation
        return random.uniform(-0.0008, 0.0004)
    elif minute < 160:      # Second leg — 70% of days get a proper breakout
        if random.random() < 0.70:
            return 0.004 * strength  # Strong second leg, often breaks above morning HOD
        return random.uniform(-0.001, 0.001)
    else:                   # Midday fade/consolidation
        return random.uniform(-0.001, 0.0005)
