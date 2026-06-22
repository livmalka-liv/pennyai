"""
APScheduler setup for Live Lab.

Schedule (Israel time):
- Real-time: Polygon.io WebSocket (1-second aggregates) + REST fallback every 30s
- 23:05: close all open paper trades (EOD)
- Sunday 08:00: run weekly optimizer
"""

import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Jerusalem")


def start_scheduler():
    from app.core.live_scanner import close_eod_trades
    from app.core.optimizer import run_optimization
    from app.data.database import SessionLocal

    def sync_close_eod():
        asyncio.create_task(close_eod_trades())

    def sync_optimize():
        db = SessionLocal()
        try:
            run_optimization(db)
        finally:
            db.close()

    # Custom strategy scanner — every 5 min (runs only when market is open)
    def sync_custom_scan():
        from app.core.multi_strategy_runner import scan_and_save_signals
        db = SessionLocal()
        try:
            asyncio.create_task(scan_and_save_signals(db))
        finally:
            db.close()

    scheduler.add_job(
        sync_custom_scan,
        "interval",
        minutes=5,
        id="custom_strategy_scan",
        name="Custom strategy live scanner",
        replace_existing=True,
    )

    # Close open trades at 23:05 Israel (after US market close)
    scheduler.add_job(
        sync_close_eod,
        CronTrigger(hour=23, minute=5, timezone="Asia/Jerusalem"),
        id="eod_close",
        name="EOD paper trade closer",
        replace_existing=True,
    )

    # Weekly optimizer — Sunday 08:00 Israel
    scheduler.add_job(
        sync_optimize,
        CronTrigger(day_of_week="sun", hour=8, minute=0, timezone="Asia/Jerusalem"),
        id="weekly_optimizer",
        name="Strategy optimizer",
        replace_existing=True,
    )

    scheduler.start()

    # Launch real-time WebSocket scanner as persistent background task
    asyncio.get_event_loop().create_task(_launch_realtime())
    logger.info("Scheduler started + real-time scanner launching (WebSocket + REST fallback)")


async def _launch_realtime():
    from app.core.realtime_scanner import start_realtime_scanner
    try:
        await start_realtime_scanner()
    except Exception as e:
        logger.error(f"Real-time scanner crashed: {e}")
