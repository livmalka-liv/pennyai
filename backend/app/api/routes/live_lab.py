"""Live Lab API endpoints."""

from datetime import date, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.data.database import get_db
from app.models.db_models import PaperTrade, StrategyTracker, OptimizationResult
from app.core.live_scanner import STRATEGY_CONFIGS

router = APIRouter(prefix="/live-lab", tags=["live-lab"])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class StrategyToggle(BaseModel):
    strategy_id: str
    active: bool


class TradeOut(BaseModel):
    id: str
    strategy_id: str
    strategy_name: str
    ticker: str
    trade_date: str
    entry_time: str
    entry_time_et: str
    exit_time: str | None
    entry_price: float
    exit_price: float | None
    tp_price: float | None
    sl_price: float | None
    return_pct: float | None
    dollars_gain: float | None
    hold_minutes: int | None
    status: str
    exit_reason: str | None
    session: str
    catalyst: str | None
    rvol: float | None
    float_shares: float | None
    hour_bucket: str | None
    price_bucket: str | None
    variant: str

    class Config:
        from_attributes = True


class OptimizationOut(BaseModel):
    id: str
    strategy_id: str
    variable_name: str
    variable_value: str
    base_win_rate: float | None
    improved_win_rate: float | None
    base_trades: int | None
    improved_trades: int | None
    status: str
    description: str | None
    discovered_at: str

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    """Return which strategies are active + overall summary stats."""
    trackers = db.query(StrategyTracker).all()
    tracker_map = {t.id: t for t in trackers}

    strategies = []
    for sid, config in STRATEGY_CONFIGS.items():
        tracker = tracker_map.get(sid)
        is_active = tracker.is_active if tracker else True

        trades = db.query(PaperTrade).filter(
            PaperTrade.strategy_id == sid,
            PaperTrade.status.in_(["win", "loss"])
        ).all()
        wins = sum(1 for t in trades if t.status == "win")
        total_pnl = sum((t.dollars_gain or 0) for t in trades)

        strategies.append({
            "id": sid,
            "name": config["name"],
            "active": is_active,
            "total_signals": len(trades),
            "wins": wins,
            "losses": len(trades) - wins,
            "total_pnl": round(total_pnl, 2),
            "win_rate": round(wins / len(trades) * 100, 1) if trades else 0,
        })

    # Total stats
    all_trades = db.query(PaperTrade).filter(PaperTrade.status.in_(["win", "loss"])).all()
    all_wins = sum(1 for t in all_trades if t.status == "win")
    overall_pnl = sum((t.dollars_gain or 0) for t in all_trades)
    days_of_data = 0
    if all_trades:
        dates = {t.trade_date for t in all_trades}
        days_of_data = len(dates)

    return {
        "strategies": strategies,
        "total_trades": len(all_trades),
        "total_wins": all_wins,
        "overall_win_rate": round(all_wins / len(all_trades) * 100, 1) if all_trades else 0,
        "overall_pnl": round(overall_pnl, 2),
        "days_of_data": days_of_data,
        "coach_unlocked": days_of_data >= 90,
    }


@router.post("/toggle")
def toggle_strategy(body: StrategyToggle, db: Session = Depends(get_db)):
    tracker = db.query(StrategyTracker).filter(StrategyTracker.id == body.strategy_id).first()
    if not tracker:
        config = STRATEGY_CONFIGS.get(body.strategy_id)
        if not config:
            raise HTTPException(404, "Strategy not found")
        tracker = StrategyTracker(id=body.strategy_id, name=config["name"], is_active=body.active)
        db.add(tracker)
    else:
        tracker.is_active = body.active
    db.commit()
    return {"ok": True, "active": body.active}


@router.get("/signals", response_model=list[TradeOut])
def get_signals(
    days: int = 1,
    strategy_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db)
):
    since = (date.today() - timedelta(days=days - 1)).isoformat()
    q = db.query(PaperTrade).filter(PaperTrade.trade_date >= since)
    if strategy_id:
        q = q.filter(PaperTrade.strategy_id == strategy_id)
    if status:
        q = q.filter(PaperTrade.status == status)
    return q.order_by(PaperTrade.created_at.desc()).limit(200).all()


@router.get("/performance")
def get_performance(db: Session = Depends(get_db)):
    """Aggregated performance by hour, price bucket, strategy, day."""
    trades = db.query(PaperTrade).filter(PaperTrade.status.in_(["win", "loss"])).all()

    by_hour: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "pnl": 0.0})
    by_price: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0})
    by_strategy: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "pnl": 0.0, "name": ""})
    by_day: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0})

    for t in trades:
        key_h = t.hour_bucket or "?"
        key_p = t.price_bucket or "?"
        key_s = t.strategy_id
        try:
            from datetime import datetime as dt
            dow = dt.strptime(t.trade_date, "%Y-%m-%d").strftime("%a")
        except Exception:
            dow = "?"

        pnl = t.dollars_gain or 0
        if t.status == "win":
            by_hour[key_h]["wins"] += 1
            by_price[key_p]["wins"] += 1
            by_strategy[key_s]["wins"] += 1
        else:
            by_hour[key_h]["losses"] += 1
            by_price[key_p]["losses"] += 1
            by_strategy[key_s]["losses"] += 1
            by_day[dow]["losses"] += 1
        by_hour[key_h]["pnl"] += pnl
        by_strategy[key_s]["pnl"] += pnl
        by_strategy[key_s]["name"] = t.strategy_name
        if t.status == "win":
            by_day[dow]["wins"] += 1

    def to_list_wr(d: dict) -> list:
        out = []
        for k, v in d.items():
            total = v["wins"] + v["losses"]
            out.append({
                "key": k,
                "wins": v["wins"],
                "losses": v["losses"],
                "total": total,
                "win_rate": round(v["wins"] / total * 100, 1) if total else 0,
                "pnl": round(v.get("pnl", 0), 2),
                "name": v.get("name", k),
            })
        return sorted(out, key=lambda x: x["win_rate"], reverse=True)

    return {
        "by_hour": to_list_wr(by_hour),
        "by_price": to_list_wr(by_price),
        "by_strategy": to_list_wr(by_strategy),
        "by_day": to_list_wr(by_day),
    }


@router.get("/optimizations", response_model=list[OptimizationOut])
def get_optimizations(db: Session = Depends(get_db)):
    results = db.query(OptimizationResult).order_by(
        OptimizationResult.discovered_at.desc()
    ).limit(50).all()
    return [OptimizationOut(
        **{c.name: getattr(r, c.name) for c in r.__table__.columns if c.name != "discovered_at"},
        discovered_at=r.discovered_at.isoformat() if r.discovered_at else "",
    ) for r in results]


@router.post("/scan-now")
async def trigger_scan():
    """Manual scan trigger — useful for testing."""
    from app.core.live_scanner import run_scan
    await run_scan()
    return {"ok": True}


@router.post("/optimize-now")
def trigger_optimization(db: Session = Depends(get_db)):
    """Manually trigger the optimizer."""
    from app.core.optimizer import run_optimization
    run_optimization(db)
    return {"ok": True}


class ScanSettings(BaseModel):
    start_hour: int = 11
    end_hour: int = 23
    interval_minutes: int = 5


@router.post("/settings")
def update_scan_settings(body: ScanSettings):
    """Update the live scan schedule dynamically."""
    from app.core.scheduler import scheduler
    from app.core.live_scanner import run_scan
    from apscheduler.triggers.cron import CronTrigger
    import asyncio

    # Remove existing scan job and re-add with new settings
    try:
        scheduler.remove_job("live_scan")
    except Exception:
        pass

    def sync_run_scan():
        asyncio.create_task(run_scan())

    hour_range = f"{body.start_hour}-{body.end_hour - 1}"
    scheduler.add_job(
        sync_run_scan,
        CronTrigger(
            hour=hour_range,
            minute=f"*/{body.interval_minutes}",
            timezone="Asia/Jerusalem"
        ),
        id="live_scan",
        name="Live penny stock scanner",
        replace_existing=True,
    )
    return {
        "ok": True,
        "start_hour": body.start_hour,
        "end_hour": body.end_hour,
        "interval_minutes": body.interval_minutes,
        "message": f"Scanner set: {body.start_hour}:00-{body.end_hour}:00, every {body.interval_minutes}min",
    }
