"""
Yahoo Finance provider — today's top gainers + 1-minute candles.
Free, no API key.

Uses a fixed watchlist of known volatile penny stocks (AMC, GME, FFIE, etc.).
Batch-downloads daily OHLCV via yfinance, filters for big movers, then
fetches 1-minute candles for each via the Yahoo chart API.
"""

import asyncio
import logging
from datetime import date, datetime, timezone

import httpx

from app.data.types import CandleData, CatalystDay

logger = logging.getLogger(__name__)

_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PennyAI/1.0)",
    "Accept": "application/json",
}

_MAX_PRICE   = 20.0
_MIN_PRICE   = 0.30
_MIN_VOLUME  = 100_000
_MAX_TICKERS = 20
_MIN_CHANGE  = 3.0   # minimum % gain to be considered a mover

# Known volatile penny stocks — we scan these every cycle
LIVE_WATCHLIST = [
    "AMC", "GME", "BBBY", "CLOV", "FFIE", "MULN", "ATER", "PROG",
    "MARA", "RIOT", "SNDL", "EXPR", "KOSS", "BB", "NOK", "WISH",
    "CTRM", "MVIS", "GNUS", "ZOM", "IDEX", "NKLA", "TLRY", "ACB",
    "CGC", "HEXO", "ASTS", "HIMS", "SPCE", "PRTY", "NLST",
    "MOXC", "MXCT", "OBLG", "AABB", "BFRI", "PHUN",
]


def _current_et_hour() -> int:
    now_utc = datetime.now(timezone.utc)
    return (now_utc.hour - 4) % 24


def _is_premarket() -> bool:
    h = _current_et_hour()
    return 4 <= h < 9 or (h == 9 and datetime.now(timezone.utc).minute < 30)


def _get_watchlist_movers_sync() -> list[dict]:
    """
    Batch-download 5 days of daily OHLCV for LIVE_WATCHLIST via yfinance,
    compute % change from previous close, return tickers that moved >= MIN_CHANGE.
    Runs in a thread (blocking I/O).
    """
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not installed — no watchlist movers")
        return []

    raw = yf.download(
        tickers=" ".join(LIVE_WATCHLIST),
        period="5d",
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    if raw is None or raw.empty:
        logger.warning("yfinance watchlist download returned empty DataFrame")
        return []

    try:
        closes  = raw["Close"]
        volumes = raw["Volume"]
    except KeyError:
        logger.warning("yfinance DataFrame missing Close/Volume columns")
        return []

    movers: list[dict] = []
    for ticker in LIVE_WATCHLIST:
        try:
            if ticker not in closes.columns:
                continue

            close_s = closes[ticker].dropna()
            vol_s   = volumes[ticker].dropna() if ticker in volumes.columns else close_s.iloc[:0]

            if len(close_s) < 2:
                continue

            curr = float(close_s.iloc[-1])
            prev = float(close_s.iloc[-2])

            if curr <= 0 or prev <= 0:
                continue
            if curr < _MIN_PRICE or curr > _MAX_PRICE:
                continue

            chng_pct = (curr - prev) / prev * 100
            if chng_pct < _MIN_CHANGE:
                continue

            volume  = int(vol_s.iloc[-1])        if len(vol_s) > 0 else 0
            avg_vol = int(vol_s.mean())           if len(vol_s) > 1 else max(volume, 1)

            if volume < _MIN_VOLUME:
                continue

            movers.append({
                "ticker":       ticker,
                "price":        curr,
                "volume":       volume,
                "change_pct":   round(chng_pct, 2),
                "open":         curr,
                "float_shares": None,
                "avg_volume":   max(avg_vol, 1),
            })
        except Exception:
            continue

    movers.sort(key=lambda x: x["change_pct"], reverse=True)
    logger.info(f"yfinance watchlist: {len(movers)} movers ≥{_MIN_CHANGE}% today")
    return movers[:_MAX_TICKERS]


async def get_todays_movers() -> list[CatalystDay]:
    """
    Fetch today's movers from the watchlist, then get 1-minute candles for each.
    Returns CatalystDay objects ready for strategy evaluation.
    """
    tickers_info = await asyncio.to_thread(_get_watchlist_movers_sync)

    if not tickers_info:
        logger.info("yahoo_provider: no movers in watchlist today")
        return []

    logger.info(f"yahoo_provider: {len(tickers_info)} movers — fetching 1m candles")
    days: list[CatalystDay] = []

    async with httpx.AsyncClient(headers=_HEADERS, timeout=12) as client:
        for t in tickers_info:
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
        )
        r.raise_for_status()
        raw = r.json()

        result = raw.get("chart", {}).get("result", [])
        if not result:
            return []

        res     = result[0]
        ts_list = res.get("timestamp", [])
        quotes  = res.get("indicators", {}).get("quote", [{}])[0]
        opens   = quotes.get("open", [])
        highs   = quotes.get("high", [])
        lows    = quotes.get("low", [])
        closes  = quotes.get("close", [])
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
