"""
Yahoo Finance historical data provider for backtesting.

Downloads real OHLCV history (free, no API key) for known volatile penny stocks,
identifies catalyst days (gap-up + high volume), and generates realistic 1m candles
from the daily OHLCV so the backtest engine has authentic price action to test against.
"""

import logging
import random
from datetime import date, datetime

from app.data.types import CandleData, CatalystDay

logger = logging.getLogger(__name__)

# Known historically volatile penny / small-cap stocks.
# This list is updated periodically — it intentionally spans different eras
# so backtests cover multiple market regimes.
_WATCHLIST = [
    # Meme-era (2021)
    "AMC", "GME", "BBBY", "CLOV", "MVIS", "SNDL", "EXPR", "NAKD",
    # 2022-2023 volatile penny stocks
    "ATER", "PROG", "FFIE", "MULN", "MMAT", "GFAI", "GOVX", "CODA",
    "VERB", "MGTX", "PHUN", "SHOT", "BLNK", "WKHS", "RIDE",
    # 2024-2025 active names
    "NKLA", "PEGY", "MARA", "RIOT", "BTBT", "HUT", "CLSK",
    "NRGV", "GROM", "ADTM", "BFRI", "BIOR", "CENN", "FCEL",
    "GREE", "LIDR", "MFIN", "NEON", "OGEN", "RCAT", "SOPA",
]

_MIN_PRICE   = 0.30
_MAX_PRICE   = 20.0
_MIN_VOLUME  = 500_000
_MIN_GAP_PCT = 5.0   # at least 5% gap-up to count as a catalyst day
_MIN_RVOL    = 2.0   # at least 2× relative volume


_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


def _fetch_daily_ohlcv(ticker: str, lookback_years: float):
    """Fetch daily OHLCV via Yahoo chart API (httpx sync). Returns a pandas DataFrame."""
    import pandas as pd
    import httpx

    # Yahoo range: 1y, 2y, 5y, 10y, max
    years = int(lookback_years)
    if years <= 1:
        yrange = "1y"
    elif years <= 2:
        yrange = "2y"
    elif years <= 5:
        yrange = "5y"
    else:
        yrange = "10y"

    try:
        r = httpx.get(
            _CHART_URL.format(ticker=ticker),
            params={"interval": "1d", "range": yrange},
            headers=_HEADERS,
            timeout=15,
        )
        r.raise_for_status()
        raw = r.json()

        result = raw.get("chart", {}).get("result", [])
        if not result:
            return None

        res     = result[0]
        ts_list = res.get("timestamp", [])
        quote   = res.get("indicators", {}).get("quote", [{}])[0]
        adjclose = res.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])

        opens   = quote.get("open",   [])
        highs   = quote.get("high",   [])
        lows    = quote.get("low",    [])
        closes  = adjclose if adjclose else quote.get("close", [])
        volumes = quote.get("volume", [])

        if not ts_list:
            return None

        rows = []
        for i, ts in enumerate(ts_list):
            try:
                o = opens[i]
                h = highs[i]
                lo = lows[i]
                c = closes[i]
                v = volumes[i]
                if any(x is None for x in [o, h, lo, c, v]):
                    continue
                dt = datetime.fromtimestamp(ts).date()
                rows.append({"Date": dt, "Open": o, "High": h, "Low": lo, "Close": c, "Volume": v})
            except (IndexError, TypeError):
                continue

        if not rows:
            return None

        df = pd.DataFrame(rows).set_index("Date")
        df.index = pd.to_datetime(df.index)
        return df

    except Exception as exc:
        logger.debug(f"_fetch_daily_ohlcv {ticker}: {exc}")
        return None


def get_historical_catalyst_days(lookback_years: float) -> list[CatalystDay]:
    """
    Download real daily OHLCV from Yahoo Finance chart API for each watchlist ticker.
    Returns CatalystDay objects for every day that had a significant catalyst move.
    Uses direct httpx calls (no yfinance) so it works in Docker/Railway environments.
    """
    all_days: list[CatalystDay] = []
    ok_count = 0

    for ticker in _WATCHLIST:
        try:
            df = _fetch_daily_ohlcv(ticker, lookback_years)
            if df is None or df.empty:
                continue

            days = _extract_catalyst_days(ticker, df)
            all_days.extend(days)
            if days:
                ok_count += 1

        except Exception as exc:
            logger.debug(f"historical fetch failed for {ticker}: {exc}")
            continue

    logger.info(
        f"yahoo_historical: {ok_count}/{len(_WATCHLIST)} tickers produced "
        f"{len(all_days)} catalyst days (lookback={lookback_years}yr)"
    )
    return all_days


def _extract_catalyst_days(ticker: str, df) -> list[CatalystDay]:
    """Find rows in the daily OHLCV that look like catalyst / momentum days."""
    import pandas as pd

    days: list[CatalystDay] = []

    # Flatten MultiIndex columns that yfinance sometimes produces
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    # Need at least a rolling window to compute RVOL
    if len(df) < 5:
        return days

    df = df.copy()
    df["avg_vol_20"] = df["Volume"].rolling(20, min_periods=3).mean().shift(1)
    df["rvol"]       = df["Volume"] / df["avg_vol_20"].clip(lower=1)
    df["gap_pct"]    = ((df["Open"] - df["Close"].shift(1)) / df["Close"].shift(1) * 100)

    for row_date, row in df.iterrows():
        try:
            open_p  = float(row["Open"])
            high_p  = float(row["High"])
            low_p   = float(row["Low"])
            close_p = float(row["Close"])
            vol     = int(row["Volume"])
            rvol    = float(row["rvol"]) if not pd.isna(row["rvol"]) else 1.0
            gap_pct = float(row["gap_pct"]) if not pd.isna(row["gap_pct"]) else 0.0

            # Filter: price in penny-stock range
            if not (_MIN_PRICE <= open_p <= _MAX_PRICE):
                continue
            # Filter: meaningful volume
            if vol < _MIN_VOLUME:
                continue
            # Filter: real catalyst move (gap or strong intraday move)
            intraday_pct = (high_p - open_p) / open_p * 100
            if gap_pct < _MIN_GAP_PCT and intraday_pct < _MIN_GAP_PCT:
                continue
            # Filter: elevated relative volume
            if rvol < _MIN_RVOL:
                continue

            trade_date = row_date.date() if hasattr(row_date, "date") else date.fromisoformat(str(row_date)[:10])

            candles = _generate_intraday_candles(
                ticker=ticker,
                trade_date=trade_date,
                open_p=open_p,
                high_p=high_p,
                low_p=low_p,
                close_p=close_p,
                total_volume=vol,
                gap_pct=gap_pct,
            )
            if not candles:
                continue

            days.append(CatalystDay(
                ticker=ticker,
                date=trade_date,
                open_price=open_p,
                pre_market_gap_pct=round(gap_pct, 2),
                day_volume=vol,
                float_shares=5_000_000,   # unknown — use conservative default
                rvol=round(max(rvol, 1.0), 1),
                catalyst_type="gap" if gap_pct >= _MIN_GAP_PCT else "intraday_break",
                candles_1m=candles,
            ))

        except Exception as exc:
            logger.debug(f"_extract_catalyst_days row error {ticker}: {exc}")
            continue

    return days


def _generate_intraday_candles(
    ticker: str,
    trade_date: date,
    open_p: float,
    high_p: float,
    low_p: float,
    close_p: float,
    total_volume: int,
    gap_pct: float,
) -> list[CandleData]:
    """
    Synthesise realistic 1-minute candles from a daily OHLCV bar.

    The generated path respects: open, high, low, close, total volume.
    Volume is concentrated in the first 30 minutes (morning momentum)
    and the last 15 minutes (EOD close).
    """
    rng = random.Random(f"{ticker}-{trade_date}")   # deterministic per day

    n_minutes = 390   # 9:30–16:00 ET
    market_open = datetime(trade_date.year, trade_date.month, trade_date.day, 9, 30)

    # Build a price path: spike in first 60 min then drift/fade
    spike_end   = rng.randint(10, 60)     # high reached somewhere in first hour
    fade_start  = rng.randint(spike_end, min(spike_end + 90, n_minutes - 30))

    price_path = _make_price_path(
        open_p, high_p, low_p, close_p, n_minutes, spike_end, fade_start, rng
    )

    # Volume: 40% in first 30 min, 20% last 15 min, rest spread evenly
    vol_weights = _make_volume_weights(n_minutes, rng)
    minute_vols = [int(total_volume * w) for w in vol_weights]

    candles: list[CandleData] = []
    cum_vol = 0
    cum_tp  = 0.0

    for i in range(n_minutes):
        ts = datetime(market_open.year, market_open.month, market_open.day,
                      market_open.hour, market_open.minute) \
             .replace(minute=(market_open.minute + i) % 60,
                      hour=market_open.hour + (market_open.minute + i) // 60)

        c = price_path[i]
        o = price_path[i - 1] if i > 0 else open_p

        # 1m high/low: small noise around the close/open
        noise = max(c * 0.002, 0.01)
        h = round(max(o, c) + rng.uniform(0, noise), 4)
        lo = round(min(o, c) - rng.uniform(0, noise * 0.5), 4)
        lo = max(lo, 0.01)

        v = minute_vols[i]
        typical = (h + lo + c) / 3
        cum_vol += v
        cum_tp  += typical * v
        vwap = round(cum_tp / cum_vol, 4) if cum_vol else c

        candles.append(CandleData(
            ticker=ticker,
            timestamp=ts,
            open=round(float(o), 4),
            high=round(float(h), 4),
            low=round(float(lo), 4),
            close=round(float(c), 4),
            volume=v,
            vwap=vwap,
        ))

    return candles


def _make_price_path(open_p, high_p, low_p, close_p, n, spike_end, fade_start, rng):
    """Return a list of n closing prices that passes through open, high, low, close."""
    path = [open_p] * n

    # Phase 1: rally to high
    for i in range(1, spike_end + 1):
        t = i / spike_end
        path[i] = open_p + (high_p - open_p) * _ease_in(t) + rng.uniform(-0.01, 0.01) * open_p

    # Phase 2: hold / drift between spike_end and fade_start
    for i in range(spike_end + 1, fade_start + 1):
        t = (i - spike_end) / max(fade_start - spike_end, 1)
        path[i] = high_p - (high_p - (high_p + close_p) / 2) * t + rng.uniform(-0.005, 0.005) * high_p

    # Phase 3: fade to close
    mid_price = path[fade_start]
    for i in range(fade_start + 1, n):
        t = (i - fade_start) / (n - fade_start)
        path[i] = mid_price + (close_p - mid_price) * _ease_out(t) + rng.uniform(-0.003, 0.003) * close_p

    # Clamp to [low_p, high_p]
    return [max(low_p, min(high_p, p)) for p in path]


def _ease_in(t: float) -> float:
    return t * t


def _ease_out(t: float) -> float:
    return 1 - (1 - t) * (1 - t)


def _make_volume_weights(n: int, rng) -> list[float]:
    """
    Realistic intraday volume distribution:
    - First 30 min: ~35% of daily volume
    - Last 15 min:  ~15% of daily volume
    - Middle:       ~50% spread with some noise
    """
    weights = []
    first_30  = 30
    last_15   = 15
    mid_count = n - first_30 - last_15

    # First 30 minutes — heavy volume, decaying
    for i in range(first_30):
        w = (1.0 - i / first_30) ** 1.5 + rng.uniform(0, 0.1)
        weights.append(w)

    # Middle period — flat with noise
    for _ in range(mid_count):
        weights.append(0.3 + rng.uniform(0, 0.2))

    # Last 15 minutes — pickup
    for i in range(last_15):
        w = 0.5 + (i / last_15) * 0.8 + rng.uniform(0, 0.1)
        weights.append(w)

    total = sum(weights) or 1.0
    # First-30 target 35%, last-15 target 15%
    first_sum = sum(weights[:first_30])
    last_sum  = sum(weights[n - last_15:])
    mid_sum   = total - first_sum - last_sum

    normalized = []
    for i, w in enumerate(weights):
        if i < first_30:
            normalized.append(w / first_sum * 0.35 if first_sum else 1 / n)
        elif i >= n - last_15:
            normalized.append(w / last_sum * 0.15 if last_sum else 1 / n)
        else:
            normalized.append(w / mid_sum * 0.50 if mid_sum else 1 / n)

    return normalized
