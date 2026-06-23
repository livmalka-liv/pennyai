"""
Yahoo Finance provider — today's top gainers + 1-minute candles.
Free, no API key.

Uses a fixed watchlist of known volatile penny stocks.
Fetches 5-day daily OHLCV via the Yahoo chart API (same endpoint that
works for 1-minute candles) to compute % change, then filters for movers.
All requests are parallel httpx calls — no yfinance library needed here.
"""

import asyncio
import logging
from datetime import date, datetime, timezone

import httpx

from app.data.types import CandleData, CatalystDay

logger = logging.getLogger(__name__)

_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

_MAX_PRICE   = 20.0
_MIN_PRICE   = 0.30
_MIN_VOLUME  = 100_000
_MAX_TICKERS = 20
_MIN_CHANGE  = 3.0   # minimum % gain to qualify as a mover

# Known volatile penny stocks — scanned every cycle
LIVE_WATCHLIST = [
    "AMC", "GME", "CLOV", "FFIE", "MULN", "ATER", "PROG",
    "MARA", "RIOT", "EXPR", "MVIS", "GNUS", "ZOM", "IDEX", "NKLA",
    "TLRY", "ACB", "CGC", "ASTS", "HIMS", "SPCE", "NLST",
    "MOXC", "MXCT", "OBLG", "BFRI", "PHUN", "AABB",
    "CTRM", "NAKD", "KOSS", "SNDL", "BB", "NOK", "BBBY",
    "WISH", "HEXO", "PRTY",
]


def _current_et_hour() -> int:
    now_utc = datetime.now(timezone.utc)
    return (now_utc.hour - 4) % 24


def _is_premarket() -> bool:
    h = _current_et_hour()
    return 4 <= h < 9 or (h == 9 and datetime.now(timezone.utc).minute < 30)


async def _fetch_daily_change(client: httpx.AsyncClient, ticker: str) -> dict | None:
    """
    Fetch 5 days of daily data for a single ticker via the Yahoo chart API.
    Returns a dict with price, volume, change_pct — or None if not a mover.
    """
    try:
        r = await client.get(
            _CHART_URL.format(ticker=ticker),
            params={"interval": "1d", "range": "5d"},
            timeout=10,
        )
        r.raise_for_status()
        raw = r.json()

        result = raw.get("chart", {}).get("result", [])
        if not result:
            return None

        quote = result[0].get("indicators", {}).get("quote", [{}])[0]
        closes  = [c for c in quote.get("close",  []) if c is not None]
        volumes = [v for v in quote.get("volume", []) if v is not None]

        if len(closes) < 2:
            return None

        curr = float(closes[-1])
        prev = float(closes[-2])

        if curr <= 0 or prev <= 0:
            return None

        chng_pct = (curr - prev) / prev * 100

        volume  = int(volumes[-1])                            if volumes          else 0
        avg_vol = int(sum(volumes) / len(volumes))            if len(volumes) > 1 else max(volume, 1)

        return {
            "ticker":       ticker,
            "price":        curr,
            "volume":       volume,
            "change_pct":   round(chng_pct, 2),
            "open":         curr,
            "float_shares": None,
            "avg_volume":   max(avg_vol, 1),
        }

    except Exception:
        return None


async def get_todays_movers() -> list[CatalystDay]:
    """
    Fetch today's movers from the watchlist then get 1-minute candles for each.
    Returns CatalystDay objects ready for strategy evaluation.
    """
    async with httpx.AsyncClient(headers=_HEADERS, timeout=15) as client:
        # Step 1 — parallel daily-change fetch for all watchlist tickers
        tasks   = [_fetch_daily_change(client, t) for t in LIVE_WATCHLIST]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        movers: list[dict] = []
        for info in results:
            if not isinstance(info, dict):
                continue
            if info["price"] < _MIN_PRICE or info["price"] > _MAX_PRICE:
                continue
            if info["change_pct"] < _MIN_CHANGE:
                continue
            if info["volume"] < _MIN_VOLUME:
                continue
            movers.append(info)

        movers.sort(key=lambda x: x["change_pct"], reverse=True)
        movers = movers[:_MAX_TICKERS]

        if not movers:
            logger.info("yahoo_provider: no movers in watchlist today")
            return []

        logger.info(f"yahoo_provider: {len(movers)} movers — fetching 1m candles")

        # Step 2 — 1-minute candles for each mover
        days: list[CatalystDay] = []
        for t in movers:
            candles = await _fetch_candles(client, t["ticker"])
            if not candles:
                continue

            avg_vol = max(t.get("avg_volume", 1_000_000) or 1_000_000, 1)
            rvol    = round(t["volume"] / avg_vol, 1)

            days.append(CatalystDay(
                ticker=t["ticker"],
                date=date.today(),
                open_price=t.get("open", t["price"]),
                pre_market_gap_pct=t.get("change_pct", 0.0),
                day_volume=t["volume"],
                float_shares=int(t.get("float_shares") or 5_000_000),
                rvol=max(rvol, 1.0),
                catalyst_type="premarket_gainer" if _is_premarket() else "day_gainer",
                candles_1m=candles,
            ))

    logger.info(f"yahoo_provider: built {len(days)} CatalystDay objects")
    return days


async def _fetch_candles(client: httpx.AsyncClient, ticker: str) -> list[CandleData]:
    """Fetch today's 1-minute candles (including pre-market) via Yahoo chart API."""
    try:
        r = await client.get(
            _CHART_URL.format(ticker=ticker),
            params={"interval": "1m", "range": "1d", "includePrePost": "true"},
            timeout=10,
        )
        r.raise_for_status()
        raw = r.json()

        result = raw.get("chart", {}).get("result", [])
        if not result:
            return []

        res     = result[0]
        ts_list = res.get("timestamp", [])
        quotes  = res.get("indicators", {}).get("quote", [{}])[0]
        opens   = quotes.get("open",   [])
        highs   = quotes.get("high",   [])
        lows    = quotes.get("low",    [])
        closes  = quotes.get("close",  [])
        vols    = quotes.get("volume", [])

        candles: list[CandleData] = []
        cum_vol = 0
        cum_tp  = 0.0

        for i, ts in enumerate(ts_list):
            try:
                o  = opens[i]
                h  = highs[i]
                lo = lows[i]
                c  = closes[i]
                v  = vols[i] or 0

                if o is None or h is None or lo is None or c is None:
                    continue
                if c <= 0:
                    continue

                typical  = (h + lo + c) / 3
                cum_vol += v
                cum_tp  += typical * v
                vwap     = cum_tp / cum_vol if cum_vol else c

                candles.append(CandleData(
                    ticker=ticker,
                    timestamp=datetime.fromtimestamp(ts),
                    open=float(o),
                    high=float(h),
                    low=float(lo),
                    close=float(c),
                    volume=int(v),
                    vwap=round(vwap, 4),
                ))
            except (IndexError, TypeError, ValueError):
                continue

        return candles

    except Exception as exc:
        logger.debug(f"yahoo _fetch_candles {ticker}: {exc}")
        return []
