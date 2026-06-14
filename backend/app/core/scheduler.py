"""
APScheduler setup for Live Lab.

Schedule (Israel time):
- 11:00-23:00: scan every 5 minutes for penny movers
- 23:05:       close all open paper trades (EOD)
- Sunday 08:00: run weekly optimizer
"""

import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Jerusalem")


def start_scheduler():
    from app.core.live_scanner import run_scan, close_eod_trades
    from app.core.optimizer import run_optimization
    from app.data.database import SessionLocal

    def sync_run_scan():
        asyncio.create_task(run_scan())

    def sync_close_eod():
        asyncio.create_task(close_eod_trades())

    def sync_optimize():
        db = SessionLocal()
        try:
            run_optimization(db)
        finally:
            db.close()

    # Scan every 5 minutes, 11:00-22:55 Israel
    scheduler.add_job(
        sync_run_scan,
        CronTrigger(hour="11-22", minute="*/5", timezone="Asia/Jerusalem"),
        id="live_scan",
        name="Live penny stock scanner",
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
    logger.info("Scheduler started: scan every 5min (11:00-23:00 Israel), EOD at 23:05, optimizer Sundays")
