"""
Multi-strategy runner — manages multiple StrategyConfig objects running
simultaneously against live Polygon data.
"""

import uuid
import logging
from datetime import datetime, timezone, date

from sqlalchemy.orm import Session

from app.models.db_models import StrategyTracker, PaperTrade
from app.data.types import CatalystDay

logger = logging.getLogger(__name__)

ISRAEL_UTC_OFFSET = 3   # summer IDT UTC+3
ET_UTC_OFFSET     = -4  # summer EDT UTC-4
POSITION_DOLLARS  = 1000


def _is_market_open() -> bool:
    """Return True if current time is within US regular market hours (9:30–16:00 ET)."""
    now_utc = datetime.now(timezone.utc)
    now_et_hour  = (now_utc.hour + ET_UTC_OFFSET) % 24
    now_et_min   = now_utc.minute
    now_et_total = now_et_hour * 60 + now_et_min
    open_total   = 9 * 60 + 30
    close_total  = 16 * 60
    return open_total <= now_et_total < close_total


async def scan_and_save_signals(db: Session) -> int:
    """
    Scheduled job: scan all users' active custom strategies, save new signals as PaperTrades.
    Returns the number of new signals saved.
    """
    if not _is_market_open():
        logger.debug("scan_and_save_signals: market closed, skipping")
        return 0

    # Collect all unique user_ids with active custom strategies
    rows = (
        db.query(StrategyTracker.user_id)
        .filter(StrategyTracker.is_active == True)  # noqa: E712
        .distinct()
        .all()
    )
    if not rows:
        return 0

    today = date.today().isoformat()
    now_utc = datetime.now(timezone.utc)
    entry_time_il = f"{(now_utc.hour + ISRAEL_UTC_OFFSET) % 24:02d}:{now_utc.minute:02d}"
    entry_time_et = f"{(now_utc.hour + ET_UTC_OFFSET) % 24:02d}:{now_utc.minute:02d}"

    new_signals = 0
    for (user_id,) in rows:
        if not user_id:
            continue
        try:
            signals = await scan_and_signal(user_id, db)
        except Exception as exc:
            logger.warning(f"scan_and_save_signals: scan failed for {user_id}: {exc}")
            continue

        for sig in signals:
            # Deduplicate: skip if same strategy+ticker already open today
            existing = (
                db.query(PaperTrade)
                .filter(
                    PaperTrade.strategy_name == sig["strategy_name"],
                    PaperTrade.ticker == sig["ticker"],
                    PaperTrade.trade_date == today,
                )
                .first()
            )
            if existing:
                continue

            entry = sig["entry_price"]
            trade = PaperTrade(
                id=str(uuid.uuid4()),
                strategy_id=f"custom:{user_id}:{sig['strategy_name']}",
                strategy_name=sig["strategy_name"],
                ticker=sig["ticker"],
                trade_date=today,
                entry_time=entry_time_il,
                entry_time_et=entry_time_et,
                entry_price=entry,
                tp_price=round(entry * 1.15, 4),
                sl_price=round(entry * 0.95, 4),
                status="open",
                session="regular",
                catalyst=sig.get("catalyst_type"),
                rvol=sig.get("rvol"),
                variant="custom",
            )
            db.add(trade)
            new_signals += 1

    if new_signals:
        db.commit()
        logger.info(f"scan_and_save_signals: saved {new_signals} new signals")
    return new_signals


async def activate_strategy(user_id: str, strategy: dict, db: Session) -> str:
    """
    Save a strategy as active. Returns the StrategyTracker ID.
    If a tracker with the same name already exists for this user, it is
    updated in-place; otherwise a new row is created.
    """
    name = strategy.get("name", "Unnamed Strategy")

    existing = (
        db.query(StrategyTracker)
        .filter(
            StrategyTracker.user_id == user_id,
            StrategyTracker.name == name,
        )
        .first()
    )

    if existing:
        existing.is_active = True
        existing.config_json = strategy
        existing.started_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        logger.info(f"Re-activated strategy '{name}' for user {user_id} (id={existing.id})")
        return existing.id

    tracker = StrategyTracker(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=name,
        is_active=True,
        config_json=strategy,
        started_at=datetime.utcnow(),
    )
    db.add(tracker)
    db.commit()
    db.refresh(tracker)
    logger.info(f"Activated new strategy '{name}' for user {user_id} (id={tracker.id})")
    return tracker.id


async def deactivate_strategy(tracker_id: str, user_id: str, db: Session) -> bool:
    """
    Set is_active=False for the given tracker.
    Returns True if the tracker was found and updated, False otherwise.
    """
    tracker = (
        db.query(StrategyTracker)
        .filter(
            StrategyTracker.id == tracker_id,
            StrategyTracker.user_id == user_id,
        )
        .first()
    )
    if not tracker:
        return False

    tracker.is_active = False
    db.commit()
    logger.info(f"Deactivated strategy tracker {tracker_id} for user {user_id}")
    return True


def get_active_strategies(user_id: str, db: Session) -> list[dict]:
    """
    Return a list of active strategy configs with their tracker IDs.
    Each element: {"tracker_id": str, "config": dict}
    """
    trackers = (
        db.query(StrategyTracker)
        .filter(
            StrategyTracker.user_id == user_id,
            StrategyTracker.is_active == True,  # noqa: E712
        )
        .order_by(StrategyTracker.started_at.desc())
        .all()
    )
    return [
        {
            "tracker_id": t.id,
            "name": t.name,
            "started_at": t.started_at.isoformat() if t.started_at else None,
            "config": t.config_json or {},
        }
        for t in trackers
    ]


async def scan_and_signal(user_id: str, db: Session) -> list[dict]:
    """
    Main scanner: for each active strategy, fetch the latest Polygon data
    (lookback_years=1) and check whether entry conditions are met.

    Returns a list of signal dicts:
        {strategy_name, ticker, entry_price, catalyst_type, rvol, trade_date}
    """
    from app.core.config import get_settings
    from app.core.backtest_engine import _apply_filters, _candles_to_df, _detect_entry_signal
    from app.models.schemas import StrategyConfig

    active = get_active_strategies(user_id, db)
    if not active:
        logger.info(f"No active strategies for user {user_id}")
        return []

    settings = get_settings()

    # Fetch catalyst days (historical) + today's live movers
    try:
        if settings.use_mock_data or not settings.polygon_api_key:
            from app.data.mock_provider import generate_catalyst_days
            catalyst_days: list[CatalystDay] = generate_catalyst_days(lookback_years=1)
        else:
            from app.data.polygon_provider import get_catalyst_days, get_todays_movers
            catalyst_days = get_catalyst_days(lookback_years=1, api_key=settings.polygon_api_key)
            # Append today's live movers so the scanner checks current market
            try:
                todays = get_todays_movers(api_key=settings.polygon_api_key)
                catalyst_days = todays + catalyst_days  # prioritise today's at the front
                logger.info(f"scan_and_signal: added {len(todays)} live movers for today")
            except Exception as exc:
                logger.warning(f"scan_and_signal: could not fetch today's movers: {exc}")
    except Exception as exc:
        logger.error(f"scan_and_signal: failed to fetch catalyst days: {exc}")
        return []

    signals: list[dict] = []

    for entry in active:
        config_dict = entry.get("config") or {}
        strategy_name = entry.get("name", config_dict.get("name", "Unknown"))

        try:
            strategy = StrategyConfig(**config_dict)
        except Exception as exc:
            logger.warning(f"scan_and_signal: invalid config for '{strategy_name}': {exc}")
            continue

        filtered_days = _apply_filters(catalyst_days, strategy)

        for day in filtered_days:
            if not day.candles_1m:
                continue
            try:
                df = _candles_to_df(day.candles_1m)
                signal = _detect_entry_signal(df, strategy)
                if signal is None:
                    continue

                _entry_minute, entry_price = signal
                signals.append(
                    {
                        "strategy_name": strategy_name,
                        "ticker": day.ticker,
                        "entry_price": round(entry_price, 4),
                        "catalyst_type": day.catalyst_type,
                        "rvol": round(day.rvol, 1),
                        "trade_date": str(day.date),
                    }
                )
            except Exception as exc:
                logger.warning(
                    f"scan_and_signal: error processing {day.ticker}/{day.date} "
                    f"for '{strategy_name}': {exc}"
                )
                continue

    logger.info(
        f"scan_and_signal: {len(signals)} signals across "
        f"{len(active)} active strategies for user {user_id}"
    )
    return signals
