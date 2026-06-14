"""
Strategy Optimizer: automatically discovers variables that improve win rate.

Every 7 days, for each active strategy with 20+ trades, the optimizer:
1. Splits trades by candidate variables (hour, price range, rvol threshold, day of week)
2. Finds which filter raises win rate by ≥5% with ≥10 trades in the subset
3. Saves accepted improvements as OptimizationResult
4. Accepted variants are used alongside the base strategy (A/B style)
"""

import uuid
import logging
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import PaperTrade, OptimizationResult

logger = logging.getLogger(__name__)

MIN_TRADES_TO_OPTIMIZE = 20
MIN_IMPROVEMENT_PCT    = 5.0     # must raise WR by at least 5pp
MIN_SUBSET_TRADES      = 10      # subset must have at least 10 trades

# Candidate variables the optimizer tests
CANDIDATE_VARIABLES = [
    # Hour filter (Israel time) — best 3-hour windows
    {"name": "hour_filter",   "values": ["11:00-14:00", "14:00-16:30", "16:30-18:30", "18:30-20:30", "20:30-23:00"]},
    # Price bucket filter
    {"name": "price_filter",  "values": ["$0.5-1", "$1-3", "$3-7", "$7-15", "$15+"]},
    # Minimum rvol
    {"name": "min_rvol",      "values": ["3", "5", "7", "10", "15"]},
    # Day of week
    {"name": "day_filter",    "values": ["Mon", "Tue", "Wed", "Thu", "Fri"]},
    # Session
    {"name": "session_filter","values": ["premarket", "regular", "afterhours"]},
]


def _win_rate(trades: list[PaperTrade]) -> float:
    if not trades:
        return 0.0
    wins = sum(1 for t in trades if t.status == "win")
    return wins / len(trades) * 100


def _apply_filter(trades: list[PaperTrade], var_name: str, var_value: str) -> list[PaperTrade]:
    if var_name == "hour_filter":
        start_h, end_h = var_value.split("-")
        start = int(start_h.split(":")[0]) * 60 + int(start_h.split(":")[1])
        end   = int(end_h.split(":")[0]) * 60 + int(end_h.split(":")[1])
        return [t for t in trades if t.hour_bucket and _time_in_range(t.hour_bucket, start, end)]
    if var_name == "price_filter":
        return [t for t in trades if t.price_bucket == var_value]
    if var_name == "min_rvol":
        threshold = float(var_value)
        return [t for t in trades if t.rvol and t.rvol >= threshold]
    if var_name == "day_filter":
        day_map = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4}
        target = day_map.get(var_value, -1)
        def day_of(t):
            try:
                return datetime.strptime(t.trade_date, "%Y-%m-%d").weekday()
            except Exception:
                return -1
        return [t for t in trades if day_of(t) == target]
    if var_name == "session_filter":
        return [t for t in trades if t.session == var_value]
    return trades


def _time_in_range(hour_bucket: str, start_min: int, end_min: int) -> bool:
    try:
        h, m = map(int, hour_bucket.split(":"))
        t = h * 60 + m
        return start_min <= t < end_min
    except Exception:
        return False


def run_optimization(db: Session):
    """Find and record strategy improvements. Called weekly."""
    from app.models.db_models import StrategyTracker
    from app.core.live_scanner import STRATEGY_CONFIGS

    active = db.query(StrategyTracker).filter(StrategyTracker.is_active == True).all()
    strategy_ids = [s.id for s in active] if active else list(STRATEGY_CONFIGS.keys())

    for strat_id in strategy_ids:
        base_trades = (
            db.query(PaperTrade)
            .filter(PaperTrade.strategy_id == strat_id, PaperTrade.status.in_(["win", "loss"]))
            .all()
        )
        if len(base_trades) < MIN_TRADES_TO_OPTIMIZE:
            logger.info(f"Optimizer: {strat_id} has {len(base_trades)} trades — skipping (need {MIN_TRADES_TO_OPTIMIZE})")
            continue

        base_wr = _win_rate(base_trades)
        logger.info(f"Optimizer: {strat_id} — base WR {base_wr:.1f}% over {len(base_trades)} trades")

        for candidate in CANDIDATE_VARIABLES:
            var_name = candidate["name"]
            for var_value in candidate["values"]:
                subset = _apply_filter(base_trades, var_name, var_value)
                if len(subset) < MIN_SUBSET_TRADES:
                    continue
                subset_wr = _win_rate(subset)
                improvement = subset_wr - base_wr

                if improvement >= MIN_IMPROVEMENT_PCT:
                    # Check if we already have this optimization
                    existing = db.query(OptimizationResult).filter(
                        OptimizationResult.strategy_id == strat_id,
                        OptimizationResult.variable_name == var_name,
                        OptimizationResult.variable_value == var_value,
                    ).first()

                    if existing:
                        existing.improved_win_rate = round(subset_wr, 1)
                        existing.improved_trades = len(subset)
                    else:
                        result = OptimizationResult(
                            id=str(uuid.uuid4())[:8],
                            strategy_id=strat_id,
                            variable_name=var_name,
                            variable_value=var_value,
                            base_win_rate=round(base_wr, 1),
                            improved_win_rate=round(subset_wr, 1),
                            base_trades=len(base_trades),
                            improved_trades=len(subset),
                            status="accepted" if improvement >= 8 else "testing",
                            description=_describe(var_name, var_value, base_wr, subset_wr, len(subset)),
                        )
                        db.add(result)
                        logger.info(f"Optimizer: found {var_name}={var_value} → WR {base_wr:.1f}% → {subset_wr:.1f}% (+{improvement:.1f}pp)")

    db.commit()


def _describe(var_name: str, var_value: str, base_wr: float, improved_wr: float, count: int) -> str:
    label = {
        "hour_filter":    f"מסחר רק בשעות {var_value} (שעון ישראל)",
        "price_filter":   f"מניות בטווח מחיר {var_value} בלבד",
        "min_rvol":       f"סינון רק מניות עם rvol ≥ {var_value}x",
        "day_filter":     f"מסחר רק ביום {var_value}",
        "session_filter": f"מסחר רק ב-{var_value}",
    }.get(var_name, f"{var_name}={var_value}")
    return f"{label}. מתוך {count} עסקאות: אחוז הצלחה עלה מ-{base_wr:.0f}% ל-{improved_wr:.0f}% (+{improved_wr - base_wr:.0f}pp)"
