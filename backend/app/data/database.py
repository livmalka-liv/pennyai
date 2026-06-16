"""Database setup — PostgreSQL (prod) or SQLite (dev)."""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Railway injects DATABASE_URL for PostgreSQL — fix the scheme if needed
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH = os.environ.get("DB_PATH", "/app/data/livelab.db")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models.db_models import (  # noqa — imports register tables with SQLAlchemy
        User, PaperTrade, StrategyTracker, OptimizationResult,
        BrokerConnection, BrokerOrder, BacktestRun, BacktestTrade,
        PolygonCatalystDay,
    )
    Base.metadata.create_all(bind=engine)
