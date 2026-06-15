"""Strategy Tracker — daily reports and per-strategy performance table."""

from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.data.database import get_db
from app.models.db_models import BacktestRun, BacktestTrade

router = APIRouter(prefix="/tracker", tags=["tracker"])


@router.get("/strategies")
def get_strategy_table(db: Session = Depends(get_db)):
    """
    Tracking table: one row per strategy name with cumulative stats
    across all backtest runs.
    """
    rows = (
        db.query(
            BacktestTrade.strategy_name,
            func.count(BacktestTrade.id).label("total_trades"),
            func.avg(BacktestTrade.return_pct).label("avg_return"),
            func.sum(func.case((BacktestTrade.return_pct > 0, 1), else_=0)).label("wins"),
            func.min(BacktestTrade.return_pct).label("worst_trade"),
            func.max(BacktestTrade.return_pct).label("best_trade"),
            func.count(func.distinct(BacktestTrade.ticker)).label("unique_tickers"),
            func.count(func.distinct(BacktestTrade.run_id)).label("runs"),
        )
        .group_by(BacktestTrade.strategy_name)
        .all()
    )

    result = []
    for r in rows:
        total = r.total_trades or 0
        wins = int(r.wins or 0)
        result.append({
            "strategy":       r.strategy_name,
            "runs":           r.runs,
            "total_trades":   total,
            "win_rate":       round(wins / total * 100, 1) if total else 0,
            "avg_return_pct": round(float(r.avg_return or 0), 2),
            "best_trade":     round(float(r.best_trade or 0), 2),
            "worst_trade":    round(float(r.worst_trade or 0), 2),
            "unique_tickers": r.unique_tickers,
        })

    result.sort(key=lambda x: x["win_rate"], reverse=True)
    return result


@router.get("/daily-report")
def get_daily_report(days: int = 30, db: Session = Depends(get_db)):
    """
    Daily report: for each trading day in the last N days,
    show which strategies fired and on which tickers.
    """
    trades = (
        db.query(BacktestTrade)
        .order_by(BacktestTrade.trade_date.desc())
        .limit(days * 20)
        .all()
    )

    by_date: dict = defaultdict(lambda: defaultdict(list))
    for t in trades:
        by_date[t.trade_date][t.strategy_name].append({
            "ticker":       t.ticker,
            "return_pct":   t.return_pct,
            "exit_reason":  t.exit_reason,
            "rvol":         t.rvol,
            "catalyst":     t.catalyst_type,
            "holding_min":  t.holding_minutes,
        })

    report = []
    for day in sorted(by_date.keys(), reverse=True):
        strategies = []
        for strat_name, day_trades in by_date[day].items():
            wins = sum(1 for t in day_trades if (t["return_pct"] or 0) > 0)
            total = len(day_trades)
            avg_ret = sum(t["return_pct"] or 0 for t in day_trades) / total if total else 0
            strategies.append({
                "strategy":    strat_name,
                "trades":      total,
                "wins":        wins,
                "win_rate":    round(wins / total * 100, 1) if total else 0,
                "avg_return":  round(avg_ret, 2),
                "tickers":     [t["ticker"] for t in day_trades],
                "details":     day_trades,
            })
        strategies.sort(key=lambda s: s["win_rate"], reverse=True)
        report.append({"date": day, "strategies": strategies})

    return report


@router.get("/top-tickers")
def get_top_tickers(limit: int = 20, db: Session = Depends(get_db)):
    """Which tickers appear most in winning trades."""
    rows = (
        db.query(
            BacktestTrade.ticker,
            func.count(BacktestTrade.id).label("appearances"),
            func.avg(BacktestTrade.return_pct).label("avg_return"),
            func.sum(func.case((BacktestTrade.return_pct > 0, 1), else_=0)).label("wins"),
        )
        .filter(BacktestTrade.return_pct.isnot(None))
        .group_by(BacktestTrade.ticker)
        .order_by(func.count(BacktestTrade.id).desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "ticker":      r.ticker,
            "appearances": r.appearances,
            "avg_return":  round(float(r.avg_return or 0), 2),
            "win_rate":    round(int(r.wins or 0) / r.appearances * 100, 1),
        }
        for r in rows
    ]
