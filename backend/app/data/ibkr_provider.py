"""
Real-time penny stock data from IBKR Client Portal Gateway.

Uses the user's connected IBKR gateway (ngrok tunnel → local Gateway)
to fetch live market scanner results + 1-minute candles.
"""

import logging
from datetime import date, datetime

import httpx

from app.data.types import CandleData, CatalystDay

logger = logging.getLogger(__name__)

_SCANNER_PAYLOAD = {
    "instrument": "STK",
    "type": "TOP_PERC_GAIN",
    "filter": [
        {"code": "priceBelow",  "value": 20.0},
        {"code": "priceAbove",  "value": 0.30},
        {"code": "volumeAbove", "value": 500_000},
    ],
    "location": "STK.US.MAJOR",
    "size": "50",
}

# IBKR market-data field codes
_F_LAST   = "31"
_F_OPEN   = "7295"
_F_CHNG   = "83"    # day change %
_F_VOL    = "7762"  # volume
_F_VWAP   = "7741"  # VWAP


def _client(gateway_url: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=f"{gateway_url.rstrip('/')}/v1/api",
        verify=False,
        timeout=10,
    )


async def _tickle(gateway_url: str) -> None:
    """Keep the session alive — required before data requests."""
    try:
        async with _client(gateway_url) as c:
            await c.get("/tickle")
    except Exception:
        pass


async def get_ibkr_movers(gateway_url: str) -> list[CatalystDay]:
    """
    Return today's penny-stock movers from IBKR's built-in scanner.
    Falls back to empty list on any error so callers can use mock data.
    """
    await _tickle(gateway_url)
    today = date.today()
    days: list[CatalystDay] = []

    try:
        async with _client(gateway_url) as c:
            # 1. Run market scanner
            r = await c.post("/iserver/scanner/run", json=_SCANNER_PAYLOAD)
            r.raise_for_status()
            scanner_data = r.json()

        contracts = scanner_data.get("contracts", [])
        if not contracts:
            logger.info("IBKR scanner returned 0 contracts")
            return []

        # Map conid → ticker
        conid_to_ticker: dict[str, str] = {}
        for entry in contracts[:25]:
            inner = entry if isinstance(entry, dict) else {}
            for item in inner.get("contracts", [inner]):
                cid = str(item.get("conid", item.get("con_id", "")))
                sym = item.get("symbol", item.get("ticker", ""))
                if cid and sym:
                    conid_to_ticker[cid] = sym

        if not conid_to_ticker:
            return []

        conids_str = ",".join(conid_to_ticker.keys())

        async with _client(gateway_url) as c:
            # 2. Snapshot quotes
            r = await c.get(
                "/iserver/marketdata/snapshot",
                params={"conids": conids_str, "fields": f"{_F_LAST},{_F_OPEN},{_F_CHNG},{_F_VOL},{_F_VWAP}"},
            )
            r.raise_for_status()
            snapshots: list[dict] = r.json() if isinstance(r.json(), list) else []

        for snap in snapshots:
            conid  = str(snap.get("conid", ""))
            ticker = conid_to_ticker.get(conid) or snap.get("symbol", "")
            if not ticker:
                continue

            try:
                last_price  = float(snap.get(_F_LAST, 0) or 0)
                open_price  = float(snap.get(_F_OPEN, last_price) or last_price)
                day_vol     = int(float(snap.get(_F_VOL, 0) or 0))
                chng_str    = str(snap.get(_F_CHNG, "0") or "0").replace("%", "").strip()
                gap_pct     = float(chng_str) if chng_str else 0.0
            except (ValueError, TypeError):
                continue

            if last_price <= 0 or day_vol < 100_000:
                continue

            candles = await _get_candles(gateway_url, conid, ticker)
            if not candles:
                continue

            # Rough RVOL — compare to a 1M-share baseline for penny stocks
            rvol = round(day_vol / max(1_000_000, day_vol * 0.3), 1)

            days.append(CatalystDay(
                ticker=ticker,
                date=today,
                open_price=open_price,
                pre_market_gap_pct=gap_pct,
                day_volume=day_vol,
                float_shares=5_000_000,   # IBKR doesn't expose float — default
                rvol=rvol,
                catalyst_type="ibkr_live",
                candles_1m=candles,
            ))

    except Exception as exc:
        logger.warning(f"get_ibkr_movers failed: {exc}")

    logger.info(f"IBKR real-time provider: {len(days)} movers")
    return days


async def _get_candles(gateway_url: str, conid: str, ticker: str) -> list[CandleData]:
    """Fetch 1-min intraday candles from IBKR for the current session."""
    try:
        async with _client(gateway_url) as c:
            r = await c.get(
                "/iserver/marketdata/history",
                params={"conid": conid, "period": "1D", "bar": "1min", "outsideRth": "false"},
            )
            r.raise_for_status()
            raw = r.json().get("data", [])

        candles: list[CandleData] = []
        cum_vol   = 0
        cum_tp    = 0.0   # sum of (typical_price * volume) for VWAP

        for c in raw:
            try:
                ts    = datetime.fromtimestamp(int(c["t"]) / 1000)
                o     = float(c["o"])
                h     = float(c["h"])
                lo    = float(c["l"])
                close = float(c["c"])
                vol   = int(c.get("v", 0))

                typical  = (h + lo + close) / 3
                cum_vol += vol
                cum_tp  += typical * vol
                vwap     = cum_tp / cum_vol if cum_vol else close

                candles.append(CandleData(
                    ticker=ticker,
                    timestamp=ts,
                    open=o,
                    high=h,
                    low=lo,
                    close=close,
                    volume=vol,
                    vwap=round(vwap, 4),
                ))
            except Exception:
                continue

        return candles
    except Exception as exc:
        logger.debug(f"_get_candles {ticker}: {exc}")
        return []
