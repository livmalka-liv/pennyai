"""
Yahoo Finance provider — today's top gainers + 1-minute candles.
Free, no API key. Roughly 15-minute delayed data on free accounts.

Used as fallback when IBKR is not connected and Polygon gainers endpoint
returns 403 (free-tier restriction).
"""

import logging
from datetime import date, datetime

import httpx

from app.data.types import CandleData, CatalystDay

logger = logging.getLogger(__name__)

# Yahoo Finance endpoints (public, no auth)
_SCREENER_URL = (
    "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
    "?scrIds=day_gainers&count=50&fields=symbol,regularMarketPrice,regularMarketVolume,"
    "regularMarketChangePercent,regularMarketOpen,floatShares"
)
_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PennyAI/1.0)",
    "Accept": "application/json",
}

# Penny-stock filter: price < $20, volume > 500K
_MAX_PRICE   = 20.0
_MIN_PRICE   = 0.30
_MIN_VOLUME  = 500_000
_MAX_TICKERS = 30   # keep it fast — evaluate the best movers only


async def get_todays_movers() -> list[CatalystDay]:
    """
    Fetch today's top-gaining penny stocks from Yahoo Finance screener,
    then pull 1-minute candles for each.  Returns a CatalystDay list.
    """
    try:
        tickers = await _fetch_top_gainers()
    except Exception as exc:
        logger.warning(f"yahoo_provider: screener failed: {exc}")
        return []

    if not tickers:
        logger.info("yahoo_provider: screener returned 0 matching tickers")
        return []

    logger.info(f"yahoo_provider: {len(tickers)} penny-stock movers today")
    days: list[CatalystDay] = []

    async with httpx.AsyncClient(headers=_HEADERS, timeout=12) as client:
        for t in tickers[:_MAX_TICKERS]:
            candles = await _fetch_candles(client, t["ticker"])
            if not candles:
                continue

            # Rough RVOL: today's volume vs 30-day average (assume 1M avg for penny stocks)
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
                catalyst_type="yahoo_gainer",
                candles_1m=candles,
            ))

    logger.info(f"yahoo_provider: built {len(days)} CatalystDay objects")
    return days


async def _fetch_top_gainers() -> list[dict]:
    """Return filtered list of {ticker, price, volume, change_pct, open, float_shares}."""
    async with httpx.AsyncClient(headers=_HEADERS, timeout=10) as client:
        r = await client.get(_SCREENER_URL)
        r.raise_for_status()
        data = r.json()

    quotes = (
        data.get("finance", {})
            .get("result", [{}])[0]
            .get("quotes", [])
    )

    out = []
    for q in quotes:
        symbol = q.get("symbol", "")
        # Skip ETFs, mutual funds, preferred shares
        if any(c in symbol for c in ["-", ".", "^", "/"]):
            continue
        if len(symbol) > 5:
            continue

        price   = float(q.get("regularMarketPrice") or 0)
        volume  = int(q.get("regularMarketVolume") or 0)
        chng    = float(q.get("regularMarketChangePercent") or 0)
        open_p  = float(q.get("regularMarketOpen") or price)
        float_s = q.get("floatShares")

        if price < _MIN_PRICE or price > _MAX_PRICE:
            continue
        if volume < _MIN_VOLUME:
            continue

        out.append({
            "ticker":       symbol,
            "price":        price,
            "volume":       volume,
            "change_pct":   round(chng, 2),
            "open":         open_p,
            "float_shares": float_s,
            "avg_volume":   int(q.get("averageDailyVolume3Month") or 1_000_000),
        })

    # Sort by % gain descending — most explosive first
    out.sort(key=lambda x: x["change_pct"], reverse=True)
    return out


async def _fetch_candles(client: httpx.AsyncClient, ticker: str) -> list[CandleData]:
    """Fetch today's 1-minute candles from Yahoo Finance chart endpoint."""
    try:
        r = await client.get(
            _CHART_URL.format(ticker=ticker),
            params={"interval": "1m", "range": "1d", "includePrePost": "false"},
        )
        r.raise_for_status()
        raw = r.json()

        result = raw.get("chart", {}).get("result", [])
        if not result:
            return []

        res      = result[0]
        ts_list  = res.get("timestamp", [])
        quotes   = res.get("indicators", {}).get("quote", [{}])[0]
        opens    = quotes.get("open", [])
        highs    = quotes.get("high", [])
        lows     = quotes.get("low", [])
        closes   = quotes.get("close", [])
        volumes  = quotes.get("volume", [])

        candles: list[CandleData] = []
        cum_vol = 0
        cum_tp  = 0.0

        for i, ts in enumerate(ts_list):
            try:
                o = opens[i]
                h = highs[i]
                lo = lows[i]
                c = closes[i]
                v = volumes[i] or 0

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
