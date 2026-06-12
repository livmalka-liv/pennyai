"""
Real Polygon.io data provider for penny stock backtesting.

Architecture:
  1. fetch_catalyst_days()  — finds days where a stock was $1-10, volume>1M, move>10%
  2. fetch_intraday()       — downloads 1-minute OHLCV for a specific ticker+date
  3. All fetched data is cached in a local SQLite file so we never re-download

Cost model:
  - One nightly job runs fetch_catalyst_days() for yesterday
  - All user backtests hit the local cache — zero Polygon calls at query time
  - Monthly Polygon cost is fixed regardless of user count
"""

import sqlite3
import json
import time
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx

from app.data.types import CandleData, CatalystDay
from app.data.edgar_provider import get_historical_float

logger = logging.getLogger(__name__)

POLYGON_BASE = "https://api.polygon.io"
CACHE_DB = Path(__file__).parent.parent.parent / "data_cache" / "penny_cache.db"


# ── Cache setup ──────────────────────────────────────────────────────────────

def _init_cache():
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS catalyst_days (
            ticker TEXT,
            date TEXT,
            open_price REAL,
            gap_pct REAL,
            day_volume INTEGER,
            float_shares INTEGER,
            rvol REAL,
            catalyst_type TEXT,
            candles_json TEXT,
            fetched_at TEXT,
            PRIMARY KEY (ticker, date)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_volume_avg (
            ticker TEXT,
            as_of_date TEXT,
            avg_volume_20d INTEGER,
            PRIMARY KEY (ticker, as_of_date)
        )
    """)
    conn.commit()
    conn.close()


def _get_cached_days(start: date, end: date) -> list[CatalystDay]:
    conn = sqlite3.connect(CACHE_DB)
    rows = conn.execute(
        "SELECT * FROM catalyst_days WHERE date BETWEEN ? AND ? ORDER BY date",
        (str(start), str(end))
    ).fetchall()
    conn.close()

    days = []
    for row in rows:
        ticker, dt, open_p, gap, vol, float_s, rvol, catalyst, candles_json, _ = row
        candles_raw = json.loads(candles_json)
        candles = [
            CandleData(
                ticker=ticker,
                timestamp=datetime.fromisoformat(c["t"]),
                open=c["o"], high=c["h"], low=c["l"], close=c["c"],
                volume=c["v"], vwap=c.get("vw", (c["h"] + c["l"] + c["c"]) / 3),
            )
            for c in candles_raw
        ]
        days.append(CatalystDay(
            ticker=ticker, date=date.fromisoformat(dt),
            open_price=open_p, pre_market_gap_pct=gap,
            day_volume=vol, float_shares=float_s,
            rvol=rvol, catalyst_type=catalyst,
            candles_1m=candles,
        ))
    return days


def _save_day(day: CatalystDay):
    conn = sqlite3.connect(CACHE_DB)
    candles_json = json.dumps([
        {"t": c.timestamp.isoformat(), "o": c.open, "h": c.high,
         "l": c.low, "c": c.close, "v": c.volume, "vw": c.vwap}
        for c in day.candles_1m
    ])
    conn.execute("""
        INSERT OR REPLACE INTO catalyst_days
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        day.ticker, str(day.date), day.open_price, day.pre_market_gap_pct,
        day.day_volume, day.float_shares, day.rvol, day.catalyst_type,
        candles_json, datetime.utcnow().isoformat()
    ))
    conn.commit()
    conn.close()


# ── Polygon API calls ────────────────────────────────────────────────────────

def _polygon_get(path: str, params: dict, api_key: str, retries: int = 3) -> dict:
    url = f"{POLYGON_BASE}{path}"
    params["apiKey"] = api_key

    for attempt in range(retries):
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.get(url, params=params)

            if resp.status_code == 429:
                wait = 12 * (attempt + 1)
                logger.warning(f"Rate limited. Waiting {wait}s...")
                time.sleep(wait)
                continue

            resp.raise_for_status()
            return resp.json()

        except httpx.HTTPError as e:
            if attempt == retries - 1:
                raise
            time.sleep(3)

    return {}


def _fetch_grouped_daily(target_date: date, api_key: str) -> list[dict]:
    """Fetch all US stock tickers for a given date with their daily OHLCV."""
    data = _polygon_get(
        f"/v2/aggs/grouped/locale/us/market/stocks/{target_date}",
        {"adjusted": "false", "include_otc": "false"},
        api_key,
    )
    return data.get("results", [])


def _fetch_1min_candles(ticker: str, target_date: date, api_key: str) -> list[dict]:
    """Fetch 1-minute OHLCV for a specific ticker on a specific date."""
    next_day = target_date + timedelta(days=1)
    data = _polygon_get(
        f"/v2/aggs/ticker/{ticker}/range/1/minute/{target_date}/{next_day}",
        {"adjusted": "false", "sort": "asc", "limit": 500},
        api_key,
    )
    return data.get("results", [])


def _fetch_avg_volume(ticker: str, target_date: date, api_key: str) -> int:
    """Fetch 20-day average volume ending before target_date."""
    end = target_date - timedelta(days=1)
    start = target_date - timedelta(days=30)
    data = _polygon_get(
        f"/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}",
        {"adjusted": "false", "sort": "asc", "limit": 30},
        api_key,
    )
    bars = data.get("results", [])
    if not bars:
        return 1_000_000
    vols = [b["v"] for b in bars[-20:]]
    return int(sum(vols) / len(vols))


def _fetch_news_catalyst(ticker: str, target_date: date, api_key: str) -> str:
    """
    Fetch news for ticker on target_date from Polygon News API and classify catalyst.
    Returns one of: fda, earnings, offering, merger, halt, partnership, pr
    Falls back to "pr" gracefully on rate limits or missing data.
    """
    next_day = target_date + timedelta(days=1)
    try:
        data = _polygon_get(
            "/v2/reference/news",
            {
                "ticker": ticker,
                "published_utc.gte": f"{target_date}T00:00:00Z",
                "published_utc.lte": f"{next_day}T00:00:00Z",
                "limit": 5,
                "order": "desc",
            },
            api_key,
            retries=1,  # Don't waste time retrying — move on
        )
    except Exception:
        return "pr"

    articles = data.get("results", [])
    if not articles:
        return "pr"

    # Combine title + description of all articles for classification
    text = " ".join(
        (a.get("title", "") + " " + a.get("description", "")).lower()
        for a in articles
    )

    # Rule-based classifier — order matters (most specific first)
    rules = [
        ("fda",         ["fda ", "approval", "approv", "pdufa", " nda ", " bla ", " anda",
                         "clinical trial", "phase 2", "phase 3", "phase ii", "phase iii",
                         "efficacy", "safety data", "drug"]),
        ("earnings",    ["earnings", "revenue", "eps ", "quarterly results", "annual report",
                         "fiscal year", "q1 ", "q2 ", "q3 ", "q4 ", "beats estimates",
                         "misses estimates", "guidance"]),
        ("offering",    ["offering", "dilut", "shares offered", "private placement",
                         "registered direct", "at-the-market", "atm offering", "warrant",
                         "prospectus"]),
        ("merger",      ["merger", "acqui", "takeover", "buyout", "going private",
                         "definitive agreement", "letter of intent", "loi "]),
        ("halt",        ["trading halt", "halted", "circuit breaker", "suspended trading"]),
        ("partnership", ["partnership", "license agreement", "collaboration", "milestone",
                         "signed agreement", "exclusive license"]),
    ]

    for catalyst, keywords in rules:
        if any(kw in text for kw in keywords):
            return catalyst

    return "pr"  # generic press release / news


# ── Main pipeline ────────────────────────────────────────────────────────────

def fetch_and_cache_day(target_date: date, api_key: str,
                         min_volume: int = 1_000_000,
                         min_move_pct: float = 10.0,
                         min_price: float = 1.0,
                         max_price: float = 10.0) -> int:
    """
    Fetch all penny stock catalyst days for target_date from Polygon.
    Filters: price $1-10, volume > 1M, daily move > 10%.
    Returns count of catalyst days found.
    """
    _init_cache()
    logger.info(f"Fetching {target_date} from Polygon...")

    bars = _fetch_grouped_daily(target_date, api_key)
    if not bars:
        logger.warning(f"No data returned for {target_date}")
        return 0

    # Filter to penny stock catalyst universe
    candidates = []
    for bar in bars:
        ticker = bar.get("T", "")
        o = bar.get("o", 0)
        c = bar.get("c", 0)
        v = bar.get("v", 0)
        h = bar.get("h", 0)
        l = bar.get("l", 0)

        if not (min_price <= o <= max_price):
            continue
        if v < min_volume:
            continue
        move_pct = abs(c - o) / o * 100 if o > 0 else 0
        if move_pct < min_move_pct:
            continue
        # Skip tickers with special chars (warrants, units, etc.)
        if any(c in ticker for c in ["+", ".", "W", "U", "R"]):
            continue

        candidates.append({
            "ticker": ticker,
            "open": o, "close": c, "high": h, "low": l,
            "volume": int(v),
            "move_pct": move_pct,
        })

    logger.info(f"Found {len(candidates)} penny stock catalyst candidates for {target_date}")

    saved = 0
    for stock in candidates:
        ticker = stock["ticker"]

        try:
            # Fetch 1-min intraday data
            raw_candles = _fetch_1min_candles(ticker, target_date, api_key)
            if not raw_candles:
                continue

            # Build CandleData with real VWAP
            candles = []
            cum_vol = 0
            cum_pv = 0.0
            for bar in raw_candles:
                ts_ms = bar.get("t", 0)
                ts = datetime.fromtimestamp(ts_ms / 1000)
                o_ = bar["o"]; h_ = bar["h"]; l_ = bar["l"]; c_ = bar["c"]
                v_ = int(bar.get("v", 0))
                cum_vol += v_
                cum_pv += ((h_ + l_ + c_) / 3) * v_
                vwap = cum_pv / cum_vol if cum_vol > 0 else c_
                candles.append(CandleData(
                    ticker=ticker, timestamp=ts,
                    open=o_, high=h_, low=l_, close=c_,
                    volume=v_, vwap=round(vwap, 4),
                ))

            # Average volume for Rvol
            avg_vol = _fetch_avg_volume(ticker, target_date, api_key)
            rvol = round(stock["volume"] / avg_vol, 1) if avg_vol > 0 else 1.0

            # Historical float from SEC EDGAR (quarterly 10-Q/10-K data)
            float_shares = get_historical_float(ticker, target_date)

            # Gap %
            gap_pct = stock["move_pct"]

            # Real catalyst type from Polygon News API
            catalyst_type = _fetch_news_catalyst(ticker, target_date, api_key)

            day = CatalystDay(
                ticker=ticker,
                date=target_date,
                open_price=stock["open"],
                pre_market_gap_pct=gap_pct,
                day_volume=stock["volume"],
                float_shares=float_shares,
                rvol=rvol,
                catalyst_type=catalyst_type,
                candles_1m=candles,
            )
            _save_day(day)
            saved += 1
            logger.info(f"  ✓ {ticker}: +{gap_pct:.1f}%, vol {stock['volume']:,}, rvol {rvol}x")

            # Respect rate limits
            time.sleep(0.25)

        except Exception as e:
            logger.error(f"  ✗ {ticker}: {e}")
            continue

    logger.info(f"Saved {saved} catalyst days for {target_date}")
    return saved


def backfill_history(years: int, api_key: str):
    """
    Backfill historical data. Run once to populate cache.
    Will take several hours for 5 years — run overnight.
    """
    _init_cache()
    end = date.today() - timedelta(days=1)
    start = date(end.year - years, end.month, end.day)
    current = start
    total = 0

    while current <= end:
        if current.weekday() < 5:  # Skip weekends
            # Check if already cached
            conn = sqlite3.connect(CACHE_DB)
            count = conn.execute(
                "SELECT COUNT(*) FROM catalyst_days WHERE date = ?", (str(current),)
            ).fetchone()[0]
            conn.close()

            if count == 0:
                try:
                    saved = fetch_and_cache_day(current, api_key)
                    total += saved
                    time.sleep(1)  # Be polite to the API
                except Exception as e:
                    logger.error(f"Failed {current}: {e}")
        current += timedelta(days=1)

    logger.info(f"Backfill complete. Total catalyst days saved: {total}")
    return total


def backfill_catalyst_types(api_key: str) -> int:
    """
    Update catalyst_type for all cached days that still have the old placeholder value.
    Safe to run multiple times — skips already-classified entries.
    """
    _init_cache()
    conn = sqlite3.connect(CACHE_DB)
    rows = conn.execute(
        "SELECT ticker, date FROM catalyst_days WHERE catalyst_type IN ('high_volume_move', 'unknown', 'pr')"
    ).fetchall()
    conn.close()

    updated = 0
    for ticker, dt in rows:
        target_date = date.fromisoformat(dt)
        catalyst_type = _fetch_news_catalyst(ticker, target_date, api_key)

        conn = sqlite3.connect(CACHE_DB)
        conn.execute(
            "UPDATE catalyst_days SET catalyst_type = ? WHERE ticker = ? AND date = ?",
            (catalyst_type, ticker, dt),
        )
        conn.commit()
        conn.close()

        logger.info(f"  {ticker} {dt}: {catalyst_type}")
        updated += 1
        time.sleep(0.15)  # stay under Polygon rate limit

    logger.info(f"Updated catalyst types for {updated} days")
    return updated


def get_catalyst_days(lookback_years: int, api_key: str) -> list[CatalystDay]:
    """
    Main entry point for the backtest engine.
    Returns cached catalyst days for the requested period.
    If cache is empty, triggers a fetch (slow first run).
    """
    _init_cache()
    end = date.today()
    start = date(end.year - lookback_years, end.month, end.day)

    cached = _get_cached_days(start, end)

    if not cached:
        logger.warning("Cache empty — fetching last 30 days from Polygon as sample...")
        sample_start = end - timedelta(days=30)
        current = sample_start
        while current <= end:
            if current.weekday() < 5:
                try:
                    fetch_and_cache_day(current, api_key)
                    time.sleep(0.5)
                except Exception as e:
                    logger.error(f"Sample fetch failed for {current}: {e}")
            current += timedelta(days=1)
        cached = _get_cached_days(start, end)

    logger.info(f"Returning {len(cached)} cached catalyst days ({lookback_years}yr)")
    return cached
