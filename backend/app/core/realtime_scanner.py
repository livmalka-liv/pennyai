"""
Real-time penny stock scanner via Polygon.io WebSocket.
Detects explosive moves within seconds (vs. 5-minute REST polling).
Falls back to REST polling every 30s if WebSocket auth fails.
"""

import asyncio
import json
import logging
from datetime import datetime, date, timezone, timedelta

logger = logging.getLogger(__name__)

POLYGON_WS_URL = "wss://socket.polygon.io/stocks"

# Global scan interval for REST fallback (seconds). Updated by /settings endpoint.
_poll_interval_seconds: int = 30

# Live ticker price state  {ticker: {price, change_pct, rvol, float, vwap, volume, day_high}}
_ticker_state: dict[str, dict] = {}
_watchlist: set[str] = set()

# Whether WS is connected (used for status display)
ws_connected: bool = False


def set_poll_interval(seconds: int) -> None:
    global _poll_interval_seconds
    _poll_interval_seconds = max(5, seconds)


def _now_israel() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=3)


def _now_et() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=-4)


async def _refresh_watchlist(api_key: str) -> None:
    from app.core.live_scanner import _fetch_penny_movers
    movers = await _fetch_penny_movers(api_key)
    for m in movers:
        t = m["ticker"]
        _watchlist.add(t)
        if t not in _ticker_state:
            _ticker_state[t] = {
                "price": m["price"],
                "change_pct": m["change_pct"],
                "rvol": m["rvol"],
                "float": m["float"],
                "vwap": m["vwap"],
                "volume": m["volume"],
                "day_high": m["price"],
            }
    logger.info(f"Watchlist updated: {len(_watchlist)} penny movers")


async def _process_signal(ticker: str, data: dict) -> None:
    from app.core.live_scanner import (
        STRATEGY_CONFIGS, _check_filters, _entry_signal,
        _session_type, _price_bucket, POSITION_DOLLARS,
    )
    from app.data.database import SessionLocal
    from app.models.db_models import PaperTrade, StrategyTracker
    import uuid

    now_il = _now_israel()
    now_et = _now_et()
    if not (11 <= now_il.hour < 23):
        return

    mover = {
        "ticker": ticker,
        "price": data["price"],
        "change_pct": data.get("change_pct", 0),
        "rvol": data.get("rvol", 1),
        "float": data.get("float", 50_000_000),
        "vwap": data.get("vwap", data["price"]),
        "volume": data.get("volume", 0),
        "day_high": data.get("day_high", data["price"]),
    }

    db = SessionLocal()
    try:
        trackers = db.query(StrategyTracker).filter(StrategyTracker.is_active == True).all()
        active_ids = {t.id for t in trackers} if trackers else set(STRATEGY_CONFIGS.keys())
        today_str = date.today().isoformat()

        for strat_id, config in STRATEGY_CONFIGS.items():
            if strat_id not in active_ids:
                continue
            if not _check_filters(mover, config):
                continue
            if not _entry_signal(mover, config):
                continue
            existing = db.query(PaperTrade).filter(
                PaperTrade.strategy_id == strat_id,
                PaperTrade.ticker == ticker,
                PaperTrade.trade_date == today_str,
            ).first()
            if existing:
                continue

            entry_price = mover["price"]
            trade = PaperTrade(
                id=str(uuid.uuid4())[:8],
                strategy_id=strat_id,
                strategy_name=config["name"],
                ticker=ticker,
                trade_date=today_str,
                entry_time=now_il.strftime("%H:%M"),
                entry_time_et=now_et.strftime("%H:%M"),
                entry_price=entry_price,
                tp_price=entry_price * (1 + config["tp_pct"] / 100),
                sl_price=entry_price * (1 + config["sl_pct"] / 100),
                status="open",
                session=_session_type(now_et.hour),
                catalyst="realtime",
                rvol=round(mover["rvol"], 1),
                float_shares=mover["float"],
                day_volume=mover["volume"],
                hour_bucket=f"{now_il.hour:02d}:00",
                price_bucket=_price_bucket(entry_price),
                variant="realtime",
            )
            db.add(trade)
            logger.info(f"RT Signal [{strat_id}] {ticker} @ ${entry_price:.2f}")

        db.commit()
    finally:
        db.close()


async def _check_tp_sl(ticker: str, current_price: float, day_high: float) -> None:
    from app.data.database import SessionLocal
    from app.models.db_models import PaperTrade
    from app.core.live_scanner import POSITION_DOLLARS

    db = SessionLocal()
    try:
        open_trades = db.query(PaperTrade).filter(
            PaperTrade.ticker == ticker,
            PaperTrade.status == "open",
        ).all()
        if not open_trades:
            return

        now_str = _now_israel().strftime("%H:%M")
        changed = False
        for trade in open_trades:
            if trade.tp_price and day_high >= trade.tp_price:
                ret = ((trade.tp_price - trade.entry_price) / trade.entry_price) * 100
                trade.exit_price = trade.tp_price
                trade.exit_time = now_str
                trade.return_pct = round(ret, 2)
                trade.dollars_gain = round(POSITION_DOLLARS * ret / 100, 2)
                trade.status = "win"
                trade.exit_reason = "take_profit"
                changed = True
                logger.info(f"TP hit {ticker} +{ret:.1f}%")
            elif trade.sl_price and current_price <= trade.sl_price:
                ret = ((trade.sl_price - trade.entry_price) / trade.entry_price) * 100
                trade.exit_price = trade.sl_price
                trade.exit_time = now_str
                trade.return_pct = round(ret, 2)
                trade.dollars_gain = round(POSITION_DOLLARS * ret / 100, 2)
                trade.status = "loss"
                trade.exit_reason = "stop_loss"
                changed = True
                logger.info(f"SL hit {ticker} {ret:.1f}%")
        if changed:
            db.commit()
    finally:
        db.close()


async def _ws_subscribe(ws) -> None:
    if not _watchlist:
        return
    params = ",".join(f"A.{t}" for t in list(_watchlist)[:200])
    await ws.send(json.dumps({"action": "subscribe", "params": params}))
    logger.info(f"Subscribed to {min(len(_watchlist), 200)} tickers")


async def _ws_loop(api_key: str) -> None:
    global ws_connected
    try:
        import websockets
    except ImportError:
        logger.warning("websockets not installed — skipping WS scanner")
        return

    reconnect_delay = 5
    while True:
        try:
            async with websockets.connect(
                POLYGON_WS_URL,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5,
            ) as ws:
                reconnect_delay = 5
                ws_connected = True
                logger.info("Polygon WebSocket connected")

                async for raw in ws:
                    events = json.loads(raw)
                    for ev in events:
                        ev_type = ev.get("ev")

                        if ev_type == "status":
                            status = ev.get("status", "")
                            msg = ev.get("message", "")
                            if status == "connected":
                                await ws.send(json.dumps({"action": "auth", "params": api_key}))
                            elif status == "auth_success":
                                await _ws_subscribe(ws)
                            elif "auth_failed" in status or "error" in status:
                                logger.error(f"WS auth failed: {msg}")
                                ws_connected = False
                                return  # Disable WS, REST fallback takes over
                            logger.info(f"WS: {msg}")

                        elif ev_type == "A":  # 1-second aggregate
                            sym = ev.get("sym", "")
                            price = ev.get("c", 0)
                            if not sym or not (0.5 <= price <= 20):
                                continue

                            day_open = ev.get("op", price)
                            vwap = ev.get("vw", price)
                            acc_vol = ev.get("av", 0)
                            seg_high = ev.get("h", price)

                            ts = _ticker_state.get(sym)
                            if ts is None:
                                _ticker_state[sym] = {
                                    "price": price, "vwap": vwap, "volume": acc_vol,
                                    "day_high": seg_high, "rvol": 1, "float": 50_000_000,
                                    "change_pct": 0,
                                }
                                ts = _ticker_state[sym]
                            else:
                                ts["price"] = price
                                ts["day_high"] = max(ts["day_high"], seg_high)
                                ts["vwap"] = vwap
                                ts["volume"] = acc_vol

                            if day_open > 0:
                                ts["change_pct"] = (price - day_open) / day_open * 100

                            await _check_tp_sl(sym, price, ts["day_high"])

                            if ts["change_pct"] >= 10 and acc_vol > 100_000:
                                await _process_signal(sym, ts)

        except Exception as e:
            ws_connected = False
            logger.error(f"WS error: {e}. Retry in {reconnect_delay}s")
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 60)


async def _rest_fallback_loop(api_key: str) -> None:
    """REST polling fallback — always runs. When WS is up, this is just watchlist refresh."""
    from app.core.live_scanner import run_scan
    while True:
        await asyncio.sleep(_poll_interval_seconds)
        if not (11 <= _now_israel().hour < 23):
            continue
        try:
            await _refresh_watchlist(api_key)
            if not ws_connected:
                await run_scan()
        except Exception as e:
            logger.error(f"REST fallback error: {e}")


async def start_realtime_scanner() -> None:
    from app.core.config import get_settings
    settings = get_settings()
    api_key = settings.polygon_api_key
    if not api_key:
        logger.warning("No Polygon API key — real-time scanner disabled")
        return

    await _refresh_watchlist(api_key)

    await asyncio.gather(
        _ws_loop(api_key),
        _rest_fallback_loop(api_key),
        return_exceptions=True,
    )
