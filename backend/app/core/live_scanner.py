"""
Live scanner: runs every minute during market hours (Israel 11:00-23:00).
Fetches real penny stock movers from Polygon.io, generates paper trade signals,
and stores results in SQLite.
"""

import uuid
import logging
from datetime import datetime, date, timezone, timedelta

import httpx

from app.core.config import get_settings
from app.data.database import SessionLocal
from app.models.db_models import PaperTrade, StrategyTracker

logger = logging.getLogger(__name__)

ISRAEL_TZ_OFFSET = 3   # UTC+3 (summer IDT)
ET_TZ_OFFSET    = -4   # UTC-4 (summer EDT)

POSITION_DOLLARS = 500  # Paper trading position size

# Strategies tracked in the live lab (maps strategy_id → entry/filter logic)
STRATEGY_CONFIGS = {
    "gap-and-go": {
        "name": "Gap & Go",
        "entry": "hod",
        "min_rvol": 5, "max_float": 10_000_000,
        "min_price": 1.0, "max_price": 20.0,
        "tp_pct": 20, "sl_pct": -7,
    },
    "vwap-reclaim": {
        "name": "VWAP Reclaim",
        "entry": "vwap",
        "min_rvol": 3, "max_float": 20_000_000,
        "min_price": 0.5, "max_price": 20.0,
        "tp_pct": 15, "sl_pct": -5,
    },
    "bull-flag": {
        "name": "Bull Flag Breakout",
        "entry": "hod",
        "min_rvol": 6, "max_float": 10_000_000,
        "min_price": 1.0, "max_price": 20.0,
        "tp_pct": 20, "sl_pct": -7,
    },
    "red-to-green": {
        "name": "Red to Green",
        "entry": "vwap",
        "min_rvol": 4, "max_float": 15_000_000,
        "min_price": 0.5, "max_price": 15.0,
        "tp_pct": 15, "sl_pct": -5,
    },
    "first-green-day": {
        "name": "First Green Day",
        "entry": "hod",
        "min_rvol": 5, "max_float": 20_000_000,
        "min_price": 0.5, "max_price": 10.0,
        "tp_pct": 25, "sl_pct": -8,
    },
    "halt-resume": {
        "name": "Halt & Resume",
        "entry": "halt",
        "min_rvol": 10, "max_float": 15_000_000,
        "min_price": 0.5, "max_price": 20.0,
        "tp_pct": 25, "sl_pct": -10,
    },
}


def _now_israel() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=ISRAEL_TZ_OFFSET)


def _now_et() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=ET_TZ_OFFSET)


def _session_type(et_hour: int) -> str:
    if et_hour < 9 or (et_hour == 9 and True):  # before 9:30
        return "premarket"
    if et_hour >= 16:
        return "afterhours"
    return "regular"


def _price_bucket(price: float) -> str:
    if price < 1.0:   return "$0.5-1"
    if price < 3.0:   return "$1-3"
    if price < 7.0:   return "$3-7"
    if price < 15.0:  return "$7-15"
    return "$15+"


async def _fetch_penny_movers(api_key: str) -> list[dict]:
    """
    Fetch top % gainers from Polygon.io grouped daily endpoint.
    Returns list of dicts with ticker, price, change_pct, volume, vwap.
    """
    today = date.today().isoformat()
    url = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params={"apiKey": api_key, "include_otc": "false"})
            r.raise_for_status()
            data = r.json()
            tickers = data.get("tickers", [])
            results = []
            for t in tickers:
                price = t.get("day", {}).get("c", 0)
                change_pct = t.get("todaysChangePerc", 0)
                volume = t.get("day", {}).get("v", 0)
                vwap = t.get("day", {}).get("vw", price)
                prev_close = t.get("prevDay", {}).get("c", price)
                avg_volume = t.get("prevDay", {}).get("v", volume) or 1
                rvol = volume / avg_volume if avg_volume else 1
                if 0.5 <= price <= 20 and change_pct >= 10 and volume > 500_000:
                    results.append({
                        "ticker": t["ticker"],
                        "price": price,
                        "change_pct": change_pct,
                        "volume": volume,
                        "vwap": vwap,
                        "prev_close": prev_close,
                        "rvol": rvol,
                        "float": t.get("shareClassSharesOutstanding", 50_000_000),
                    })
            return results
    except Exception as e:
        logger.error(f"Polygon movers fetch failed: {e}")
        return []


def _check_filters(mover: dict, config: dict) -> bool:
    return (
        mover["rvol"] >= config["min_rvol"] and
        mover["float"] <= config["max_float"] and
        config["min_price"] <= mover["price"] <= config["max_price"]
    )


def _entry_signal(mover: dict, config: dict) -> bool:
    entry = config["entry"]
    if entry == "hod":
        return mover["price"] >= mover.get("day_high", mover["price"])
    if entry == "vwap":
        return mover["price"] > mover["vwap"]
    if entry == "halt":
        return mover["rvol"] > 10
    return False


async def run_scan():
    """Called by scheduler. Scans for signals and stores paper trades."""
    settings = get_settings()
    if not settings.polygon_api_key:
        logger.warning("No Polygon API key — skipping live scan")
        return

    now_il = _now_israel()
    now_et = _now_et()
    hour_il = now_il.hour
    hour_et = now_et.hour

    # Only scan between 11:00-23:00 Israel time
    if not (11 <= hour_il < 23):
        return

    logger.info(f"Live scan at {now_il.strftime('%H:%M')} Israel / {now_et.strftime('%H:%M')} ET")

    movers = await _fetch_penny_movers(settings.polygon_api_key)
    if not movers:
        return

    db = SessionLocal()
    try:
        # Load active strategies
        trackers = db.query(StrategyTracker).filter(StrategyTracker.is_active == True).all()
        active_ids = {t.id for t in trackers} if trackers else set(STRATEGY_CONFIGS.keys())

        for strat_id, config in STRATEGY_CONFIGS.items():
            if strat_id not in active_ids:
                continue

            for mover in movers:
                if not _check_filters(mover, config):
                    continue
                if not _entry_signal(mover, config):
                    continue

                # Check we haven't already signaled this ticker+strategy today
                today_str = date.today().isoformat()
                existing = db.query(PaperTrade).filter(
                    PaperTrade.strategy_id == strat_id,
                    PaperTrade.ticker == mover["ticker"],
                    PaperTrade.trade_date == today_str,
                ).first()
                if existing:
                    continue

                entry_price = mover["price"]
                tp_pct = config["tp_pct"]
                sl_pct = config["sl_pct"]
                tp_price = entry_price * (1 + tp_pct / 100)
                sl_price = entry_price * (1 + sl_pct / 100)

                trade = PaperTrade(
                    id=str(uuid.uuid4())[:8],
                    strategy_id=strat_id,
                    strategy_name=config["name"],
                    ticker=mover["ticker"],
                    trade_date=today_str,
                    entry_time=now_il.strftime("%H:%M"),
                    entry_time_et=now_et.strftime("%H:%M"),
                    entry_price=entry_price,
                    tp_price=tp_price,
                    sl_price=sl_price,
                    status="open",
                    session=_session_type(hour_et),
                    catalyst="live",
                    rvol=round(mover["rvol"], 1),
                    float_shares=mover["float"],
                    day_volume=mover["volume"],
                    hour_bucket=f"{hour_il:02d}:00",
                    price_bucket=_price_bucket(entry_price),
                    variant="base",
                )
                db.add(trade)
                logger.info(f"Signal: {strat_id} {mover['ticker']} @ ${entry_price:.2f}")

        db.commit()
    finally:
        db.close()


async def close_eod_trades():
    """Called at market close (~23:00 Israel). Closes all open paper trades at last price."""
    settings = get_settings()
    if not settings.polygon_api_key:
        return

    db = SessionLocal()
    try:
        open_trades = db.query(PaperTrade).filter(PaperTrade.status == "open").all()
        if not open_trades:
            return

        # Fetch current prices
        tickers = list({t.ticker for t in open_trades})
        prices = {}
        async with httpx.AsyncClient(timeout=10) as client:
            for ticker in tickers:
                try:
                    r = await client.get(
                        f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}",
                        params={"apiKey": settings.polygon_api_key}
                    )
                    data = r.json()
                    prices[ticker] = data.get("ticker", {}).get("day", {}).get("c", 0)
                except Exception:
                    pass

        now_str = _now_israel().strftime("%H:%M")
        for trade in open_trades:
            exit_price = prices.get(trade.ticker, trade.entry_price)
            return_pct = ((exit_price - trade.entry_price) / trade.entry_price) * 100
            trade.exit_price = exit_price
            trade.exit_time = now_str
            trade.return_pct = round(return_pct, 2)
            trade.dollars_gain = round(POSITION_DOLLARS * return_pct / 100, 2)
            trade.status = "win" if return_pct > 0 else "loss"
            trade.exit_reason = "eod_close"
            # Check TP/SL
            if trade.tp_price and exit_price >= trade.tp_price:
                trade.exit_price = trade.tp_price
                trade.return_pct = round(((trade.tp_price - trade.entry_price) / trade.entry_price) * 100, 2)
                trade.dollars_gain = round(POSITION_DOLLARS * trade.return_pct / 100, 2)
                trade.status = "win"
                trade.exit_reason = "take_profit"
            elif trade.sl_price and exit_price <= trade.sl_price:
                trade.exit_price = trade.sl_price
                trade.return_pct = round(((trade.sl_price - trade.entry_price) / trade.entry_price) * 100, 2)
                trade.dollars_gain = round(POSITION_DOLLARS * trade.return_pct / 100, 2)
                trade.status = "loss"
                trade.exit_reason = "stop_loss"

        db.commit()
        logger.info(f"Closed {len(open_trades)} EOD paper trades")
    finally:
        db.close()
