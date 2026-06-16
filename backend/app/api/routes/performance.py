"""Performance reporting endpoints — powered by PaperTrade history."""

from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.data.database import get_db
from app.models.db_models import PaperTrade

router = APIRouter(prefix="/performance", tags=["performance"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _week_start(date_str: str) -> str:
    """Return the Monday of the ISO week that contains date_str (YYYY-MM-DD)."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def _month_key(date_str: str) -> str:
    return date_str[:7]  # "YYYY-MM"


def _year_key(date_str: str) -> str:
    return date_str[:4]  # "YYYY"


def _period_key(date_str: str, period: str) -> str:
    if period == "daily":
        return date_str
    if period == "weekly":
        return _week_start(date_str)
    if period == "monthly":
        return _month_key(date_str)
    if period == "yearly":
        return _year_key(date_str)
    return date_str


# ---------------------------------------------------------------------------
# GET /performance/summary
# ---------------------------------------------------------------------------

@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    """Per-strategy summary across all time."""
    rows = (
        db.query(PaperTrade)
        .filter(PaperTrade.status.in_(["win", "loss", "flat"]))
        .all()
    )

    buckets: dict[str, list[PaperTrade]] = defaultdict(list)
    for t in rows:
        buckets[t.strategy_name].append(t)

    result = []
    for strategy, trades in buckets.items():
        closed = [t for t in trades if t.status in ("win", "loss", "flat")]
        total  = len(closed)
        wins   = sum(1 for t in closed if t.status == "win")
        returns = [t.return_pct for t in closed if t.return_pct is not None]
        dollars = [t.dollars_gain for t in closed if t.dollars_gain is not None]
        dates   = set(t.trade_date for t in closed if t.trade_date)

        result.append({
            "strategy":         strategy,
            "total_trades":     total,
            "wins":             wins,
            "win_rate":         round(wins / total * 100, 1) if total else 0.0,
            "total_return_pct": round(sum(returns), 2),
            "avg_return_pct":   round(sum(returns) / len(returns), 2) if returns else 0.0,
            "best_trade":       round(max(returns), 2) if returns else 0.0,
            "worst_trade":      round(min(returns), 2) if returns else 0.0,
            "total_pnl":        round(sum(dollars), 2),
            "active_days":      len(dates),
        })

    result.sort(key=lambda x: x["win_rate"], reverse=True)
    return result


# ---------------------------------------------------------------------------
# GET /performance/by-period
# ---------------------------------------------------------------------------

@router.get("/by-period")
def get_by_period(
    strategy: str = Query(..., description="Strategy name"),
    period: str   = Query("daily", description="daily | weekly | monthly | yearly"),
    db: Session   = Depends(get_db),
):
    """Aggregate closed trades by time period for a single strategy."""
    if period not in ("daily", "weekly", "monthly", "yearly"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="period must be daily | weekly | monthly | yearly")

    rows = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_name == strategy,
            PaperTrade.status.in_(["win", "loss", "flat"]),
        )
        .order_by(PaperTrade.trade_date)
        .all()
    )

    buckets: dict[str, list[PaperTrade]] = defaultdict(list)
    for t in rows:
        key = _period_key(t.trade_date, period)
        buckets[key].append(t)

    result = []
    for pkey in sorted(buckets.keys()):
        trades = buckets[pkey]
        total  = len(trades)
        wins   = sum(1 for t in trades if t.status == "win")
        returns = [t.return_pct  for t in trades if t.return_pct  is not None]
        dollars = [t.dollars_gain for t in trades if t.dollars_gain is not None]
        result.append({
            "period":     pkey,
            "trades":     total,
            "wins":       wins,
            "win_rate":   round(wins / total * 100, 1) if total else 0.0,
            "return_pct": round(sum(returns), 2),
            "pnl":        round(sum(dollars), 2),
        })

    return result


# ---------------------------------------------------------------------------
# GET /performance/timeline
# ---------------------------------------------------------------------------

@router.get("/timeline")
def get_timeline(
    strategy: str       = Query(..., description="Strategy name"),
    start_equity: float = Query(10000.0, description="Starting equity for the curve"),
    db: Session         = Depends(get_db),
):
    """Cumulative equity curve from closed paper trades, sorted by trade_date."""
    rows = (
        db.query(PaperTrade)
        .filter(
            PaperTrade.strategy_name == strategy,
            PaperTrade.status.in_(["win", "loss", "flat"]),
            PaperTrade.return_pct.isnot(None),
        )
        .order_by(PaperTrade.trade_date)
        .all()
    )

    equity = start_equity
    # Group by date so multiple trades on the same day compound correctly
    date_buckets: dict[str, list[float]] = defaultdict(list)
    for t in rows:
        date_buckets[t.trade_date].append(t.return_pct)

    curve = []
    for date in sorted(date_buckets.keys()):
        for ret in date_buckets[date]:
            equity *= 1 + ret / 100
        curve.append({"date": date, "equity": round(equity, 2)})

    return curve


# ---------------------------------------------------------------------------
# GET /performance/strategies/active
# ---------------------------------------------------------------------------

@router.get("/strategies/active")
def get_active_strategies(db: Session = Depends(get_db)):
    """List all strategies that have at least one paper trade, sorted by win_rate desc."""
    rows = (
        db.query(
            PaperTrade.strategy_name,
            func.count(PaperTrade.id).label("total_trades"),
            func.sum(
                func.case((PaperTrade.status == "win", 1), else_=0)
            ).label("wins"),
        )
        .filter(PaperTrade.status.in_(["win", "loss", "flat"]))
        .group_by(PaperTrade.strategy_name)
        .all()
    )

    result = []
    for r in rows:
        total = r.total_trades or 0
        wins  = int(r.wins or 0)
        result.append({
            "strategy":    r.strategy_name,
            "total_trades": total,
            "wins":         wins,
            "win_rate":     round(wins / total * 100, 1) if total else 0.0,
        })

    result.sort(key=lambda x: x["win_rate"], reverse=True)
    return result
