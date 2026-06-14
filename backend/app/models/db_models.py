"""SQLAlchemy ORM models for Live Lab persistent storage."""

from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, JSON, ForeignKey
from app.data.database import Base


class User(Base):
    __tablename__ = "users"

    id                 = Column(String, primary_key=True)
    email              = Column(String, unique=True, nullable=False, index=True)
    password_hash      = Column(String, nullable=False)
    tier               = Column(String, default="free")   # free | starter | pro
    stripe_customer_id = Column(String)
    created_at         = Column(DateTime, default=datetime.utcnow)


class PaperTrade(Base):
    __tablename__ = "paper_trades"

    id             = Column(String, primary_key=True)
    strategy_id    = Column(String, nullable=False, index=True)
    strategy_name  = Column(String, nullable=False)
    ticker         = Column(String, nullable=False)
    trade_date     = Column(String, nullable=False, index=True)   # YYYY-MM-DD
    entry_time     = Column(String, nullable=False)               # HH:MM Israel
    entry_time_et  = Column(String, nullable=False)               # HH:MM ET
    exit_time      = Column(String)
    entry_price    = Column(Float, nullable=False)
    exit_price     = Column(Float)
    tp_price       = Column(Float)
    sl_price       = Column(Float)
    return_pct     = Column(Float)
    dollars_gain   = Column(Float)
    hold_minutes   = Column(Integer)
    status         = Column(String, default="open")  # open | win | loss | flat
    exit_reason    = Column(String)                  # take_profit | stop_loss | eod_close
    session        = Column(String)                  # premarket | regular | afterhours
    catalyst       = Column(String)
    rvol           = Column(Float)
    float_shares   = Column(Float)
    day_volume     = Column(Integer)
    # Meta
    hour_bucket    = Column(String)   # "16:00" etc Israel hour
    price_bucket   = Column(String)   # "$1-3" etc
    # Optimizer flag: which variant produced this trade
    variant        = Column(String, default="base")   # "base" | "variant_X"
    created_at     = Column(DateTime, default=datetime.utcnow)


class StrategyTracker(Base):
    __tablename__ = "strategy_trackers"

    id             = Column(String, primary_key=True)
    user_id        = Column(String, index=True)   # NULL = legacy global row
    name           = Column(String, nullable=False)
    is_active      = Column(Boolean, default=True)
    config_json    = Column(JSON)
    started_at     = Column(DateTime, default=datetime.utcnow)
    paused_at      = Column(DateTime)


class OptimizationResult(Base):
    """AI-suggested parameter improvements found during forward testing."""
    __tablename__ = "optimization_results"

    id              = Column(String, primary_key=True)
    strategy_id     = Column(String, nullable=False, index=True)
    variable_name   = Column(String, nullable=False)   # e.g. "min_rvol", "hour_filter"
    variable_value  = Column(String, nullable=False)   # e.g. "8x", "16:30-18:00"
    base_win_rate   = Column(Float)
    improved_win_rate = Column(Float)
    base_trades     = Column(Integer)
    improved_trades = Column(Integer)
    status          = Column(String, default="testing")  # testing | accepted | rejected
    discovered_at   = Column(DateTime, default=datetime.utcnow)
    description     = Column(Text)
