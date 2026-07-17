"""
W-Pattern (Double Bottom on Midpoint) Scanner.

Universe:  stocks with >10% intraday gain (sourced from multi_strategy_runner cache).
Zones:     3 structural anchors calculated from 1-minute OHLCV data.
Pattern:   Double bottom on the mid-zone, validated with volume dry-up + RR ≥ 1:3.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ── In-memory state (reset each day) ─────────────────────────────────────────
_universe:  List[Dict] = []   # stocks with >10% gain being monitored
_zones:     Dict[str, Dict] = {}   # ticker → {zone1, zone2, zone3}
_signals:   List[Dict] = []   # triggered W-pattern alerts (ordered newest first)
_alerted:   set = set()        # (ticker, zone_key) already fired → no duplicates
_last_scan: Optional[str] = None
_scan_lock  = asyncio.Lock()


# ── Time helpers ──────────────────────────────────────────────────────────────

def _now_et() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=-4)


# ── Data fetching ─────────────────────────────────────────────────────────────

async def _get_candles_1m(ticker: str) -> List[Dict]:
    """Fetch 2 days of 1-minute OHLCV via yfinance (async-safe)."""
    try:
        import yfinance as yf
        import pandas as pd

        def _fetch():
            df = yf.download(ticker, period="2d", interval="1m",
                             progress=False, auto_adjust=True)
            if df.empty:
                return []
            df = df.reset_index()
            rows = []
            for _, r in df.iterrows():
                ts = r.get("Datetime", r.get("Date", None))
                if ts is None:
                    continue
                # Ensure tz-aware
                if hasattr(ts, "tzinfo") and ts.tzinfo is None:
                    ts = ts.tz_localize("UTC")
                et_offset = timedelta(hours=-4)
                ts_et = ts.to_pydatetime().astimezone(timezone.utc) + et_offset
                rows.append({
                    "t": ts_et.strftime("%Y-%m-%dT%H:%M"),
                    "o": float(r["Open"]),
                    "h": float(r["High"]),
                    "l": float(r["Low"]),
                    "c": float(r["Close"]),
                    "v": float(r["Volume"]),
                    "et_hour":   ts_et.hour,
                    "et_minute": ts_et.minute,
                    "date":      ts_et.date().isoformat(),
                })
            return rows

        return await asyncio.to_thread(_fetch)
    except Exception as exc:
        logger.warning(f"wpattern yfinance error {ticker}: {exc}")
        return []


def _window(candles: List[Dict], date_str: str,
            h_start: int, m_start: int,
            h_end: int, m_end: int) -> List[Dict]:
    """Filter candles to a date + ET time window."""
    result = []
    for c in candles:
        if c["date"] != date_str:
            continue
        t = c["et_hour"] * 60 + c["et_minute"]
        if h_start * 60 + m_start <= t < h_end * 60 + m_end:
            result.append(c)
    return result


# ── Zone calculation ──────────────────────────────────────────────────────────

def _calc_zone(candles_in_window: List[Dict], label: str) -> Optional[Dict]:
    if not candles_in_window:
        return None
    highs = [c["h"] for c in candles_in_window]
    lows  = [c["l"] for c in candles_in_window]
    vols  = [c["v"] for c in candles_in_window]
    h = max(highs)
    l = min(lows)
    # V_run = avg volume in the 3 candles around the High_Zone peak
    peak_idx = highs.index(h)
    expansion_slice = candles_in_window[max(0, peak_idx-1):peak_idx+2]
    v_run = sum(c["v"] for c in expansion_slice) / len(expansion_slice) if expansion_slice else 0.0
    return {
        "label":   label,
        "high":    round(h, 4),
        "low":     round(l, 4),
        "mid":     round((h + l) / 2, 4),
        "target":  round(h, 4),
        "v_run":   round(v_run, 0),
        "bars":    len(candles_in_window),
    }


def calculate_zones(ticker: str, candles: List[Dict]) -> Dict:
    """Calculate 3 structural zones from 1-minute OHLCV."""
    now_et   = _now_et()
    today    = now_et.date().isoformat()
    # Previous trading day: go back 1 day (skip weekends)
    prev_dt  = now_et - timedelta(days=1)
    if prev_dt.weekday() >= 5:   # Sat/Sun → go back further
        prev_dt = prev_dt - timedelta(days=prev_dt.weekday() - 4)
    yesterday = prev_dt.date().isoformat()

    zones = {}

    # Zone 1 — Prev RTH:  09:30–16:00 ET yesterday
    z1c = _window(candles, yesterday, 9, 30, 16, 0)
    z1  = _calc_zone(z1c, "Zone 1 — RTH Prev Day")
    if z1:
        zones["zone1"] = z1

    # Zone 2 — Prev Extended: 04:00–16:00 ET yesterday
    z2c = _window(candles, yesterday, 4, 0, 16, 0)
    z2  = _calc_zone(z2c, "Zone 2 — Extended Prev Day")
    if z2:
        zones["zone2"] = z2

    # Zone 3 — Today Pre-Market: 04:00–09:30 ET today
    z3c = _window(candles, today, 4, 0, 9, 30)
    z3  = _calc_zone(z3c, "Zone 3 — Pre-Market Today")
    if z3:
        zones["zone3"] = z3

    return zones


# ── Intraday candles (RTH + extended today) ───────────────────────────────────

def _today_candles(candles: List[Dict]) -> List[Dict]:
    """Return only today's candles (04:00–23:59 ET)."""
    today = _now_et().date().isoformat()
    return [c for c in candles if c["date"] == today and c["et_hour"] >= 4]


# ── Volume baseline ───────────────────────────────────────────────────────────

def _vol_baseline(candles: List[Dict]) -> float:
    """15-minute pre-market/intraday volume baseline: avg vol of last 15 candles."""
    if not candles:
        return 0.0
    last15 = candles[-15:]
    return sum(c["v"] for c in last15) / len(last15)


# ── W-Pattern detection ───────────────────────────────────────────────────────

def _avg_range_5(candles: List[Dict], before_idx: int) -> float:
    """5-period average candle H-L range ending at before_idx."""
    slice_ = candles[max(0, before_idx - 5): before_idx]
    if not slice_:
        return 0.0
    return sum(c["h"] - c["l"] for c in slice_) / len(slice_)


def detect_wpattern(
    ticker: str,
    zone_key: str,
    zone: Dict,
    intraday: List[Dict],
) -> Optional[Dict]:
    """
    Scan intraday 1-min candles for W-pattern on zone["mid"].
    Returns signal dict if pattern found, else None.
    Does NOT mutate global state.
    """
    mid    = zone["mid"]
    target = zone["target"]
    v_run  = zone.get("v_run", 0.0)

    TOUCH_TOLERANCE = 0.015   # within 1.5% of mid counts as "touching"

    # ── Find B1 ──────────────────────────────────────────────────────────────
    b1_idx = None
    for i, c in enumerate(intraday):
        if c["l"] <= mid * (1 + TOUCH_TOLERANCE) and c["c"] > mid * (1 - TOUCH_TOLERANCE):
            # Heavy volume red candle → void this touch
            if v_run > 0 and c["v"] >= v_run and c["c"] < c["o"]:
                continue
            b1_idx = i
            break

    if b1_idx is None:
        return None

    b1 = intraday[b1_idx]

    # ── Find Apex: highest point between B1 and next mid_zone touch ──────────
    apex_idx = b1_idx + 1
    if apex_idx >= len(intraday):
        return None

    for i in range(b1_idx + 1, len(intraday)):
        if intraday[i]["h"] > intraday[apex_idx]["h"]:
            apex_idx = i
        # Stop looking for apex once price comes back down near mid_zone
        if intraday[i]["l"] <= mid * (1 + TOUCH_TOLERANCE * 2) and i > b1_idx + 2:
            break

    apex = intraday[apex_idx]

    # Apex must be meaningfully above B1
    if apex["h"] <= b1["c"] * 1.005:
        return None

    # ── Find B2: second touch of mid_zone after apex ──────────────────────────
    b2_idx = None
    avg_range = _avg_range_5(intraday, apex_idx)

    for i in range(apex_idx + 1, len(intraday)):
        c = intraday[i]

        # Price must touch near mid_zone
        if c["l"] > mid * (1 + TOUCH_TOLERANCE):
            continue

        # Rule A: B2 cannot close below B1 low
        if c["l"] < b1["l"] * 0.99:
            return None   # pattern voided — B2 undercut B1

        # Rule B: candle compression — range must be ≤ 5-period avg
        c_range = c["h"] - c["l"]
        if avg_range > 0 and c_range > avg_range * 1.1:
            continue   # too wide — skip this candle

        # Volume dry-up: red candle with heavy vol → void
        if v_run > 0 and c["v"] >= v_run and c["c"] < c["o"]:
            return None

        b2_idx = i
        break

    if b2_idx is None:
        return None

    b2 = intraday[b2_idx]

    # ── Entry + Risk/Reward ───────────────────────────────────────────────────
    entry       = round(apex["h"], 4)
    sl          = round(min(b1["l"], b2["l"]) - 0.01, 4)
    risk        = entry - sl
    reward      = target - entry

    if risk <= 0 or reward / risk < 3.0:
        return None   # RR < 1:3 → do not fire

    tp1 = round(entry + reward * 0.75, 4)
    tp2 = round(target, 4)

    # ── Breakout check ────────────────────────────────────────────────────────
    vol_base     = _vol_baseline(intraday[:b2_idx])
    is_triggered = False
    for c in intraday[b2_idx + 1:]:
        if c["h"] >= entry and c["v"] >= 2.5 * vol_base:
            is_triggered = True
            break

    return {
        "ticker":       ticker,
        "zone_key":     zone_key,
        "zone_label":   zone["label"],
        "mid_zone":     mid,
        "b1_low":       round(b1["l"], 4),
        "b1_time":      b1["t"],
        "apex_high":    round(apex["h"], 4),
        "apex_time":    apex["t"],
        "b2_low":       round(b2["l"], 4),
        "b2_time":      b2["t"],
        "entry":        entry,
        "sl":           sl,
        "tp1":          tp1,
        "tp2":          tp2,
        "risk":         round(risk, 4),
        "reward":       round(reward, 4),
        "rr_ratio":     round(reward / risk, 2),
        "triggered":    is_triggered,
        "detected_at":  datetime.now(timezone.utc).strftime("%H:%M:%S"),
    }


# ── Universe: stocks with >10% intraday gain ──────────────────────────────────

def _get_universe() -> List[Dict]:
    """Pull tickers currently up >10% from the multi_strategy_runner cache."""
    try:
        from app.core.multi_strategy_runner import _latest_catalyst_days
        result = []
        for cd in _latest_catalyst_days:
            gain_pct = getattr(cd, "gap_pct", 0) or 0
            if gain_pct >= 10.0:
                result.append({
                    "ticker":    cd.ticker,
                    "gain_pct":  round(gain_pct, 1),
                    "price":     getattr(cd, "price", 0),
                    "rvol":      getattr(cd, "rvol", 0),
                })
        return result
    except Exception:
        return []


# ── Main scan ─────────────────────────────────────────────────────────────────

async def run_wpattern_scan():
    """
    Full W-pattern scan:
    1. Refresh universe (>10% movers)
    2. For each ticker, fetch 1-min candles, calculate zones
    3. Detect W-pattern on each zone
    4. Append new signals (deduplicated by ticker+zone)
    """
    global _universe, _zones, _signals, _alerted, _last_scan

    async with _scan_lock:
        universe = _get_universe()
        _universe = universe

        for item in universe:
            ticker = item["ticker"]
            try:
                candles = await _get_candles_1m(ticker)
                if not candles:
                    continue

                zones = calculate_zones(ticker, candles)
                _zones[ticker] = zones

                intraday = _today_candles(candles)
                if len(intraday) < 10:
                    continue

                for zone_key, zone in zones.items():
                    alert_key = f"{ticker}:{zone_key}"
                    if alert_key in _alerted:
                        continue   # already fired

                    sig = detect_wpattern(ticker, zone_key, zone, intraday)
                    if sig:
                        _alerted.add(alert_key)
                        _signals.insert(0, sig)
                        logger.info(
                            f"W-Pattern signal: {ticker} {zone_key} "
                            f"entry={sig['entry']} RR={sig['rr_ratio']} "
                            f"triggered={sig['triggered']}"
                        )

                await asyncio.sleep(0.5)   # rate limit yfinance
            except Exception as exc:
                logger.warning(f"W-pattern scan error {ticker}: {exc}")

        _last_scan = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
        # Keep only most recent 50 signals in memory
        _signals = _signals[:50]


# ── State accessors (used by route) ──────────────────────────────────────────

def get_state() -> Dict:
    return {
        "universe":  _universe,
        "zones":     _zones,
        "signals":   _signals,
        "last_scan": _last_scan,
        "signal_count": len(_signals),
    }
