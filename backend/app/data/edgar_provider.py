"""
SEC EDGAR historical float provider.

Uses the free EDGAR XBRL API to get shares outstanding from 10-Q/10-K filings.
This gives us quarterly historical float — far more accurate than current data
for backtesting strategies that filter by float size.

Rate limit: SEC asks for max 10 req/sec. We stay well under that.
"""

import sqlite3
import time
import logging
from datetime import date, datetime
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

EDGAR_BASE = "https://data.sec.gov"
EDGAR_WWW  = "https://www.sec.gov"
CACHE_DB = Path(__file__).parent.parent.parent / "data_cache" / "penny_cache.db"

# SEC requires a descriptive User-Agent identifying the app and contact
HEADERS = {
    "User-Agent": "PennyAI-Backtester admin@pennyai.app",
    "Accept": "application/json",
}


def _init_edgar_tables():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ticker_cik (
            ticker  TEXT PRIMARY KEY,
            cik     TEXT NOT NULL,
            name    TEXT,
            fetched_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS float_history (
            ticker      TEXT,
            period_end  TEXT,
            shares      INTEGER,
            PRIMARY KEY (ticker, period_end)
        )
    """)
    conn.commit()
    conn.close()


def _load_cik_map() -> dict[str, str]:
    """
    Returns {ticker: zero-padded-CIK} for all US public companies.
    Downloads once from SEC, caches in SQLite for 30 days.
    """
    conn = sqlite3.connect(CACHE_DB)
    # Check if we have a fresh enough bulk download
    fresh = conn.execute(
        "SELECT COUNT(*) FROM ticker_cik WHERE fetched_at > datetime('now', '-30 days')"
    ).fetchone()[0]

    if fresh > 1000:
        rows = conn.execute("SELECT ticker, cik FROM ticker_cik").fetchall()
        conn.close()
        return {r[0]: r[1] for r in rows}
    conn.close()

    logger.info("Downloading SEC ticker→CIK map (~2 MB, once per 30 days)...")
    with httpx.Client(headers=HEADERS, timeout=30) as client:
        resp = client.get(f"{EDGAR_WWW}/files/company_tickers.json")
        resp.raise_for_status()
        data = resp.json()

    now = datetime.utcnow().isoformat()
    conn = sqlite3.connect(CACHE_DB)
    cik_map: dict[str, str] = {}
    for item in data.values():
        ticker = item["ticker"].upper()
        cik = str(item["cik_str"]).zfill(10)
        name = item.get("title", "")
        cik_map[ticker] = cik
        conn.execute(
            "INSERT OR REPLACE INTO ticker_cik VALUES (?, ?, ?, ?)",
            (ticker, cik, name, now),
        )
    conn.commit()
    conn.close()
    logger.info(f"Cached {len(cik_map)} ticker→CIK mappings")
    return cik_map


def _fetch_and_cache_shares(ticker: str, cik: str) -> int:
    """
    Downloads all 10-Q/10-K shares outstanding history for ticker from EDGAR XBRL.
    Saves every quarterly data point to float_history.
    Returns total records saved.
    """
    try:
        with httpx.Client(headers=HEADERS, timeout=30) as client:
            resp = client.get(f"{EDGAR_BASE}/api/xbrl/companyfacts/CIK{cik}.json")
            if resp.status_code == 404:
                return 0
            resp.raise_for_status()
            facts = resp.json()
    except Exception as e:
        logger.warning(f"EDGAR XBRL fetch failed for {ticker} ({cik}): {e}")
        return 0

    # Pull shares outstanding from us-gaap or dei namespace
    entries: list[dict] = []
    for ns_key in ["us-gaap", "dei"]:
        ns = facts.get("facts", {}).get(ns_key, {})
        for field in ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"]:
            for entry in ns.get(field, {}).get("units", {}).get("shares", []):
                form = entry.get("form", "")
                if form in ("10-Q", "10-K", "10-K/A", "10-Q/A") and "end" in entry and "val" in entry:
                    entries.append({"end": entry["end"], "val": int(entry["val"])})

    if not entries:
        return 0

    conn = sqlite3.connect(CACHE_DB)
    for e in entries:
        conn.execute(
            "INSERT OR REPLACE INTO float_history VALUES (?, ?, ?)",
            (ticker, e["end"], e["val"]),
        )
    conn.commit()
    conn.close()
    return len(entries)


def get_historical_float(ticker: str, target_date: date) -> int:
    """
    Returns the shares outstanding as reported in the most recent 10-Q/10-K
    filed on or before target_date.

    Falls back to 0 if the ticker isn't found in EDGAR (some OTC penny stocks
    don't file with the SEC — they're not worth trading anyway).
    """
    _init_edgar_tables()

    # Fast path: check cache first
    conn = sqlite3.connect(CACHE_DB)
    row = conn.execute(
        "SELECT shares FROM float_history WHERE ticker = ? AND period_end <= ? ORDER BY period_end DESC LIMIT 1",
        (ticker, str(target_date)),
    ).fetchone()
    conn.close()
    if row:
        return row[0]

    # Need to fetch from EDGAR
    cik_map = _load_cik_map()
    cik = cik_map.get(ticker.upper())
    if not cik:
        logger.debug(f"No CIK found for {ticker} — not in SEC database")
        return 0

    saved = _fetch_and_cache_shares(ticker, cik)
    if saved == 0:
        return 0

    # Small delay to be polite to SEC
    time.sleep(0.12)

    conn = sqlite3.connect(CACHE_DB)
    row = conn.execute(
        "SELECT shares FROM float_history WHERE ticker = ? AND period_end <= ? ORDER BY period_end DESC LIMIT 1",
        (ticker, str(target_date)),
    ).fetchone()
    conn.close()
    return row[0] if row else 0


def prefetch_floats_for_tickers(tickers: list[str]) -> dict[str, int]:
    """
    Batch-fetch EDGAR float data for a list of tickers.
    Used during backfill to pre-populate the cache.
    Returns {ticker: records_saved}.
    """
    _init_edgar_tables()
    cik_map = _load_cik_map()
    results: dict[str, int] = {}

    for ticker in tickers:
        cik = cik_map.get(ticker.upper())
        if not cik:
            results[ticker] = 0
            continue

        # Skip if already cached (has any data)
        conn = sqlite3.connect(CACHE_DB)
        existing = conn.execute(
            "SELECT COUNT(*) FROM float_history WHERE ticker = ?", (ticker,)
        ).fetchone()[0]
        conn.close()

        if existing > 0:
            results[ticker] = existing
            continue

        saved = _fetch_and_cache_shares(ticker, cik)
        results[ticker] = saved
        logger.info(f"  EDGAR {ticker}: {saved} quarterly records")
        time.sleep(0.12)

    return results
