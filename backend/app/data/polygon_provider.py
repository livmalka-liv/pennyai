"""
Real Polygon.io data provider — uses PostgreSQL so data survives Railway deploys.
"""

import json
import time
import logging
from datetime import date, datetime, timedelta

import httpx

from app.data.types import CandleData, CatalystDay
from app.data.edgar_provider import get_historical_float

logger = logging.getLogger(__name__)

POLYGON_BASE = "https://api.polygon.io"


# ── DB helpers ────────────────────────────────────────────────────────────────

def _session():
    from app.data.database import SessionLocal
    return SessionLocal()


def _get_cached_days(start: date, end: date) -> list[CatalystDay]:
    from app.models.db_models import PolygonCatalystDay
    db = _session()
    try:
        rows = (
            db.query(PolygonCatalystDay)
            .filter(PolygonCatalystDay.date >= str(start),
                    PolygonCatalystDay.date <= str(end))
            .order_by(PolygonCatalystDay.date)
            .all()
        )
        days = []
        for row in rows:
            candles_raw = json.loads(row.candles_json or "[]")
            candles = [
                CandleData(
                    ticker=row.ticker,
                    timestamp=datetime.fromisoformat(c["t"]),
                    open=c["o"], high=c["h"], low=c["l"], close=c["c"],
                    volume=c["v"], vwap=c.get("vw", (c["h"] + c["l"] + c["c"]) / 3),
                )
                for c in candles_raw
            ]
            days.append(CatalystDay(
                ticker=row.ticker, date=date.fromisoformat(row.date),
                open_price=row.open_price, pre_market_gap_pct=row.gap_pct,
                day_volume=row.day_volume, float_shares=row.float_shares,
                rvol=row.rvol, catalyst_type=row.catalyst_type,
                candles_1m=candles,
            ))
        return days
    finally:
        db.close()


def _save_day(day: CatalystDay):
    from app.models.db_models import PolygonCatalystDay
    candles_json = json.dumps([
        {"t": c.timestamp.isoformat(), "o": c.open, "h": c.high,
         "l": c.low, "c": c.close, "v": c.volume, "vw": c.vwap}
        for c in day.candles_1m
    ])
    db = _session()
    try:
        existing = db.query(PolygonCatalystDay).filter_by(
            ticker=day.ticker, date=str(day.date)
        ).first()
        if existing:
            existing.candles_json = candles_json
            existing.catalyst_type = day.catalyst_type
            existing.fetched_at = datetime.utcnow().isoformat()
        else:
            db.add(PolygonCatalystDay(
                ticker=day.ticker,
                date=str(day.date),
                open_price=day.open_price,
                gap_pct=day.pre_market_gap_pct,
                day_volume=day.day_volume,
                float_shares=day.float_shares,
                rvol=day.rvol,
                catalyst_type=day.catalyst_type,
                candles_json=candles_json,
                fetched_at=datetime.utcnow().isoformat(),
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_cached_count() -> dict:
    from app.models.db_models import PolygonCatalystDay
    from sqlalchemy import func
    db = _session()
    try:
        row = db.query(
            func.count(PolygonCatalystDay.ticker),
            func.count(func.distinct(PolygonCatalystDay.ticker)),
            func.min(PolygonCatalystDay.date),
            func.max(PolygonCatalystDay.date),
        ).first()
        return {
            "records": row[0] or 0,
            "unique_tickers": row[1] or 0,
            "earliest": row[2],
            "latest": row[3],
        }
    finally:
        db.close()


# ── Polygon API ───────────────────────────────────────────────────────────────

def _polygon_get(path: str, params: dict, api_key: str, retries: int = 3) -> dict:
    url = f"{POLYGON_BASE}{path}"
    params["apiKey"] = api_key
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.get(url, params=params)
            if resp.status_code == 429:
                time.sleep(12 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            if attempt == retries - 1:
                raise
            time.sleep(3)
    return {}


def _fetch_grouped_daily(target_date: date, api_key: str) -> list[dict]:
    data = _polygon_get(
        f"/v2/aggs/grouped/locale/us/market/stocks/{target_date}",
        {"adjusted": "false", "include_otc": "false"},
        api_key,
    )
    return data.get("results", [])


def _fetch_1min_candles(ticker: str, target_date: date, api_key: str) -> list[dict]:
    next_day = target_date + timedelta(days=1)
    data = _polygon_get(
        f"/v2/aggs/ticker/{ticker}/range/1/minute/{target_date}/{next_day}",
        {"adjusted": "false", "sort": "asc", "limit": 500},
        api_key,
    )
    return data.get("results", [])


def _fetch_avg_volume(ticker: str, target_date: date, api_key: str) -> int:
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
    next_day = target_date + timedelta(days=1)
    try:
        data = _polygon_get(
            "/v2/reference/news",
            {"ticker": ticker,
             "published_utc.gte": f"{target_date}T00:00:00Z",
             "published_utc.lte": f"{next_day}T00:00:00Z",
             "limit": 5, "order": "desc"},
            api_key, retries=1,
        )
    except Exception:
        return "pr"

    articles = data.get("results", [])
    if not articles:
        return "pr"

    text = " ".join(
        (a.get("title", "") + " " + a.get("description", "")).lower()
        for a in articles
    )
    rules = [
        ("fda",         ["fda ", "approval", "approv", "pdufa", " nda ", " bla ", "clinical trial",
                         "phase 2", "phase 3", "efficacy", "drug"]),
        ("earnings",    ["earnings", "revenue", "eps ", "quarterly", "fiscal", "q1 ", "q2 ", "q3 ", "q4 "]),
        ("offering",    ["offering", "dilut", "private placement", "at-the-market", "warrant", "prospectus"]),
        ("merger",      ["merger", "acqui", "takeover", "buyout", "definitive agreement"]),
        ("halt",        ["trading halt", "halted", "circuit breaker"]),
        ("partnership", ["partnership", "license agreement", "collaboration", "milestone"]),
    ]
    for catalyst, keywords in rules:
        if any(kw in text for kw in keywords):
            return catalyst
    return "pr"


# ── Main pipeline ─────────────────────────────────────────────────────────────

def fetch_and_cache_day(target_date: date, api_key: str,
                        min_volume: int = 1_000_000,
                        min_move_pct: float = 10.0,
                        min_price: float = 1.0,
                        max_price: float = 10.0) -> int:
    logger.info(f"Fetching {target_date} from Polygon...")
    bars = _fetch_grouped_daily(target_date, api_key)
    if not bars:
        logger.warning(f"No data for {target_date}")
        return 0

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
        if any(ch in ticker for ch in ["+", ".", "W", "U", "R"]):
            continue

        candidates.append({"ticker": ticker, "open": o, "close": c,
                            "high": h, "low": l, "volume": int(v), "move_pct": move_pct})

    logger.info(f"{len(candidates)} candidates for {target_date}")
    saved = 0
    for stock in candidates:
        ticker = stock["ticker"]
        try:
            raw_candles = _fetch_1min_candles(ticker, target_date, api_key)
            if not raw_candles:
                continue

            candles = []
            cum_vol = 0
            cum_pv = 0.0
            for bar in raw_candles:
                ts = datetime.fromtimestamp(bar.get("t", 0) / 1000)
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

            avg_vol = _fetch_avg_volume(ticker, target_date, api_key)
            rvol = round(stock["volume"] / avg_vol, 1) if avg_vol > 0 else 1.0
            float_shares = get_historical_float(ticker, target_date)
            catalyst_type = _fetch_news_catalyst(ticker, target_date, api_key)

            _save_day(CatalystDay(
                ticker=ticker, date=target_date,
                open_price=stock["open"], pre_market_gap_pct=stock["move_pct"],
                day_volume=stock["volume"], float_shares=float_shares,
                rvol=rvol, catalyst_type=catalyst_type, candles_1m=candles,
            ))
            saved += 1
            logger.info(f"  ✓ {ticker}: +{stock['move_pct']:.1f}%, rvol {rvol}x")
            time.sleep(0.25)
        except Exception as e:
            logger.error(f"  ✗ {ticker}: {e}")
            continue

    logger.info(f"Saved {saved} catalyst days for {target_date}")
    return saved


def backfill_history(years: int, api_key: str):
    end = date.today() - timedelta(days=1)
    start = date(end.year - years, end.month, end.day)
    current = start
    total = 0

    from app.models.db_models import PolygonCatalystDay
    db = _session()
    try:
        existing_dates = {
            r[0] for r in db.query(PolygonCatalystDay.date).all()
        }
    finally:
        db.close()

    while current <= end:
        if current.weekday() < 5 and str(current) not in existing_dates:
            try:
                saved = fetch_and_cache_day(current, api_key)
                total += saved
                time.sleep(1)
            except Exception as e:
                logger.error(f"Failed {current}: {e}")
        current += timedelta(days=1)

    logger.info(f"Backfill complete. Total: {total}")
    return total


def get_catalyst_days(lookback_years: int, api_key: str) -> list[CatalystDay]:
    end = date.today()
    start = date(end.year - lookback_years, end.month, end.day)
    cached = _get_cached_days(start, end)

    if not cached:
        logger.warning("No cached data — fetching last 30 days as sample...")
        sample_start = end - timedelta(days=30)
        current = sample_start
        while current <= end:
            if current.weekday() < 5:
                try:
                    fetch_and_cache_day(current, api_key)
                    time.sleep(0.5)
                except Exception as e:
                    logger.error(f"Sample fetch failed {current}: {e}")
            current += timedelta(days=1)
        cached = _get_cached_days(start, end)

    logger.info(f"Returning {len(cached)} cached catalyst days ({lookback_years}yr)")
    return cached


def get_todays_movers(api_key: str,
                      min_change_pct: float = 10.0,
                      min_volume: int = 500_000,
                      min_price: float = 0.5,
                      max_price: float = 10.0) -> list[CatalystDay]:
    """
    Fetch today's top penny-stock movers from Polygon's snapshot gainers endpoint.
    Returns CatalystDay objects for the current trading day with intraday 1-min candles.
    """
    today = date.today()

    try:
        snapshot = _polygon_get(
            "/v2/snapshot/locale/us/markets/stocks/gainers",
            {"include_otc": "false"},
            api_key,
            retries=2,
        )
    except Exception as exc:
        logger.error(f"get_todays_movers: snapshot fetch failed: {exc}")
        return []

    tickers_data = snapshot.get("tickers", [])
    if not tickers_data:
        logger.warning("get_todays_movers: no gainers returned from Polygon snapshot")
        return []

    candidates = []
    for t in tickers_data:
        day = t.get("day", {})
        ticker = t.get("ticker", "")
        price = day.get("o", 0) or t.get("lastTrade", {}).get("p", 0)
        volume = int(day.get("v", 0))
        change_pct = t.get("todaysChangePerc", 0)

        if not ticker or any(ch in ticker for ch in ["+", ".", "W", "U", "R"]):
            continue
        if not (min_price <= price <= max_price):
            continue
        if volume < min_volume:
            continue
        if change_pct < min_change_pct:
            continue

        candidates.append({
            "ticker": ticker,
            "open": price,
            "change_pct": change_pct,
            "volume": volume,
            "prev_close": t.get("prevDay", {}).get("c", price),
        })

    logger.info(f"get_todays_movers: {len(candidates)} penny-stock gainers for {today}")

    result: list[CatalystDay] = []
    for stock in candidates[:20]:  # cap at 20 to avoid rate limits
        ticker = stock["ticker"]
        try:
            raw_candles = _fetch_1min_candles(ticker, today, api_key)
            if not raw_candles:
                continue

            candles = []
            cum_vol = 0
            cum_pv = 0.0
            for bar in raw_candles:
                ts = datetime.fromtimestamp(bar.get("t", 0) / 1000)
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

            if not candles:
                continue

            avg_vol = _fetch_avg_volume(ticker, today, api_key)
            rvol = round(stock["volume"] / avg_vol, 1) if avg_vol > 0 else 1.0
            float_shares = get_historical_float(ticker, today)
            gap_pct = ((stock["open"] - stock["prev_close"]) / stock["prev_close"] * 100
                       if stock["prev_close"] > 0 else stock["change_pct"])

            day_obj = CatalystDay(
                ticker=ticker, date=today,
                open_price=stock["open"], pre_market_gap_pct=round(gap_pct, 2),
                day_volume=stock["volume"], float_shares=float_shares,
                rvol=rvol, catalyst_type="live",
                candles_1m=candles,
            )
            result.append(day_obj)
            logger.info(f"  ✓ {ticker}: +{stock['change_pct']:.1f}%, rvol {rvol}x")
            time.sleep(0.2)

        except Exception as exc:
            logger.warning(f"  ✗ {ticker}: {exc}")
            continue

    logger.info(f"get_todays_movers: returning {len(result)} movers with candles")
    return result


def backfill_catalyst_types(api_key: str) -> int:
    from app.models.db_models import PolygonCatalystDay
    db = _session()
    try:
        rows = db.query(PolygonCatalystDay.ticker, PolygonCatalystDay.date).filter(
            PolygonCatalystDay.catalyst_type.in_(["high_volume_move", "unknown", "pr"])
        ).all()
    finally:
        db.close()

    updated = 0
    for ticker, dt in rows:
        target_date = date.fromisoformat(dt)
        catalyst_type = _fetch_news_catalyst(ticker, target_date, api_key)
        db = _session()
        try:
            db.query(PolygonCatalystDay).filter_by(ticker=ticker, date=dt).update(
                {"catalyst_type": catalyst_type}
            )
            db.commit()
        finally:
            db.close()
        updated += 1
        time.sleep(0.15)

    logger.info(f"Updated {updated} catalyst types")
    return updated
