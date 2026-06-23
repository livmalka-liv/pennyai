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
        from app.core.multi_strategy_runner import eod_close_custom_signals
        db = SessionLocal()
        try:
            asyncio.create_task(eod_close_custom_signals(db))
        finally:
            db.close()

    def sync_optimize():
        db = SessionLocal()
        try:
            run_optimization(db)
        finally:
            db.close()

    # ── Email report helpers ──────────────────────────────────────────────────
    def _send_report(period: str):
        from app.core.email_service import send_report
        from app.core.config import get_settings
        db = SessionLocal()
        try:
            send_report(db, period, get_settings())
        finally:
            db.close()

    def sync_daily_report():
        _send_report("daily")

    def sync_weekly_report():
        _send_report("weekly")

    def sync_monthly_report():
        _send_report("monthly")

    # Close open trades at 23:05 Israel (after US market close)
    scheduler.add_job(
        sync_close_eod,
        CronTrigger(hour=23, minute=5, timezone="Asia/Jerusalem"),
        id="eod_close",
        name="EOD paper trade closer",
        replace_existing=True,
    )

    # Daily report — 23:30 Israel (after market close + 30 min buffer)
    scheduler.add_job(
        sync_daily_report,
        CronTrigger(hour=23, minute=30, timezone="Asia/Jerusalem"),
        id="daily_email_report",
        name="Daily performance email",
        replace_existing=True,
    )

    # Weekly report — Sunday 23:30 Israel
    scheduler.add_job(
        sync_weekly_report,
        CronTrigger(day_of_week="sun", hour=23, minute=30, timezone="Asia/Jerusalem"),
        id="weekly_email_report",
        name="Weekly performance email",
        replace_existing=True,
    )

    # Monthly report — 1st of month, 08:00 Israel
    scheduler.add_job(
        sync_monthly_report,
        CronTrigger(day=1, hour=8, minute=0, timezone="Asia/Jerusalem"),
        id="monthly_email_report",
        name="Monthly performance email",
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

    loop = asyncio.get_event_loop()
    loop.create_task(_launch_realtime())
    loop.create_task(_continuous_scanner_loop())
    logger.info("Scheduler started + continuous scanner loop running (11:00–23:00 IL)")


async def _launch_realtime():
    from app.core.realtime_scanner import start_realtime_scanner
    try:
        await start_realtime_scanner()
    except Exception as e:
        logger.error(f"Real-time scanner crashed: {e}")


async def _continuous_scanner_loop():
    """
    Runs continuously.
    - Every 5 seconds:  fast TP/SL check on open positions (uses cached prices)
    - Every 60 seconds: full market scan → finds new setups + refreshes price cache
    Window: 11:00–23:00 Israel time, Mon–Fri only.
    """
    import time as _time
    from app.data.database import SessionLocal

    last_full_scan = 0.0
    FULL_SCAN_INTERVAL = 60  # seconds
    FAST_CHECK_INTERVAL = 1  # second

    while True:
        try:
            from app.core.multi_strategy_runner import (
                _is_in_scan_window,
                scan_and_save_signals,
                check_tp_sl_fast,
            )

            if _is_in_scan_window():
                now = _time.monotonic()

                # Fast TP/SL check every 5 seconds
                db = SessionLocal()
                try:
                    await check_tp_sl_fast(db)
                finally:
                    db.close()

                # Full scan every 60 seconds
                if now - last_full_scan >= FULL_SCAN_INTERVAL:
                    db = SessionLocal()
                    try:
                        count = await scan_and_save_signals(db)
                        if count:
                            logger.info(f"Continuous scanner: {count} new signals")
                    finally:
                        db.close()
                    last_full_scan = now

        except Exception as exc:
            logger.error(f"Continuous scanner loop error: {exc}")

        await asyncio.sleep(FAST_CHECK_INTERVAL)  # 1 second
