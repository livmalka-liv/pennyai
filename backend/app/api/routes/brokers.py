"""Broker connection management endpoints."""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.models.db_models import BrokerConnection, BrokerOrder, PaperTrade
from app.core.auth import get_current_user
from app.models.db_models import User
from app.core.broker_manager import encrypt_credentials, decrypt_credentials, get_broker

router = APIRouter(prefix="/brokers", tags=["brokers"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AddBrokerBody(BaseModel):
    broker_type: str      # ibkr | colmex
    label: str
    credentials: dict     # raw creds — encrypted before storing
    auto_execute: bool = False


class ManualOrderBody(BaseModel):
    ticker: str
    side: str             # buy | sell
    qty: int
    order_type: str = "market"
    limit_price: float | None = None
    paper_trade_id: str | None = None


class BrokerOut(BaseModel):
    id: str
    broker_type: str
    label: str
    account_id: str | None
    status: str
    auto_execute: bool
    last_tested_at: str | None
    last_error: str | None

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[BrokerOut])
def list_brokers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(BrokerConnection).filter(BrokerConnection.user_id == user.id).all()
    return [BrokerOut(
        id=r.id,
        broker_type=r.broker_type,
        label=r.label or r.broker_type,
        account_id=r.account_id,
        status=r.status,
        auto_execute=r.auto_execute,
        last_tested_at=r.last_tested_at.isoformat() if r.last_tested_at else None,
        last_error=r.last_error,
    ) for r in rows]


@router.post("")
async def add_broker(body: AddBrokerBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    enc = encrypt_credentials(body.credentials)
    conn = BrokerConnection(
        id=str(uuid.uuid4()),
        user_id=user.id,
        broker_type=body.broker_type.lower(),
        label=body.label,
        account_id=body.credentials.get("account_id"),
        credentials_enc=enc,
        auto_execute=body.auto_execute,
        status="disconnected",
    )
    db.add(conn)
    db.commit()

    # Test it immediately
    try:
        broker = get_broker(conn.broker_type, enc)
        ok, msg = await broker.test_connection()
        conn.status = "connected" if ok else "error"
        conn.last_error = None if ok else msg
        conn.last_tested_at = datetime.utcnow()
        db.commit()
        return {"id": conn.id, "status": conn.status, "message": msg}
    except Exception as e:
        conn.status = "error"
        conn.last_error = str(e)
        db.commit()
        return {"id": conn.id, "status": "error", "message": str(e)}


@router.delete("/{conn_id}")
def remove_broker(conn_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = db.query(BrokerConnection).filter(BrokerConnection.id == conn_id, BrokerConnection.user_id == user.id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    db.delete(conn)
    db.commit()
    return {"ok": True}


@router.post("/{conn_id}/test")
async def test_broker(conn_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = db.query(BrokerConnection).filter(BrokerConnection.id == conn_id, BrokerConnection.user_id == user.id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    try:
        broker = get_broker(conn.broker_type, conn.credentials_enc)
        ok, msg = await broker.test_connection()
        conn.status = "connected" if ok else "error"
        conn.last_error = None if ok else msg
        conn.last_tested_at = datetime.utcnow()
        db.commit()
        return {"ok": ok, "message": msg, "status": conn.status}
    except Exception as e:
        conn.status = "error"
        conn.last_error = str(e)
        db.commit()
        return {"ok": False, "message": str(e), "status": "error"}


@router.get("/{conn_id}/account")
async def get_account(conn_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = _get_conn(conn_id, user.id, db)
    broker = get_broker(conn.broker_type, conn.credentials_enc)
    try:
        info = await broker.get_account()
        return {
            "account_id": info.account_id,
            "net_liquidation": info.net_liquidation,
            "cash": info.cash,
            "buying_power": info.buying_power,
            "currency": info.currency,
        }
    except Exception as e:
        raise HTTPException(502, f"Broker error: {e}")


@router.get("/{conn_id}/positions")
async def get_positions(conn_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = _get_conn(conn_id, user.id, db)
    broker = get_broker(conn.broker_type, conn.credentials_enc)
    try:
        positions = await broker.get_positions()
        return [
            {
                "ticker": p.ticker,
                "qty": p.qty,
                "side": p.side,
                "avg_cost": p.avg_cost,
                "market_value": p.market_value,
                "unrealized_pnl": p.unrealized_pnl,
                "unrealized_pnl_pct": round(p.unrealized_pnl_pct, 2),
            }
            for p in positions
        ]
    except Exception as e:
        raise HTTPException(502, f"Broker error: {e}")


@router.post("/{conn_id}/order")
async def place_order(conn_id: str, body: ManualOrderBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = _get_conn(conn_id, user.id, db)
    broker = get_broker(conn.broker_type, conn.credentials_enc)

    try:
        if body.order_type == "limit" and body.limit_price:
            result = await broker.place_limit_order(body.ticker, body.side, body.qty, body.limit_price)
        else:
            result = await broker.place_market_order(body.ticker, body.side, body.qty)
    except Exception as e:
        raise HTTPException(502, f"Broker error: {e}")

    order = BrokerOrder(
        id=str(uuid.uuid4()),
        user_id=user.id,
        broker_conn_id=conn_id,
        paper_trade_id=body.paper_trade_id,
        ticker=body.ticker,
        side=body.side,
        qty=body.qty,
        order_type=body.order_type,
        limit_price=body.limit_price,
        broker_order_id=result.broker_order_id,
        status=result.status,
        fill_price=result.fill_price,
        fill_qty=result.fill_qty,
        error_msg=result.error_msg,
    )
    db.add(order)
    db.commit()

    return {
        "order_id": order.id,
        "broker_order_id": result.broker_order_id,
        "status": result.status,
        "fill_price": result.fill_price,
        "error": result.error_msg,
    }


@router.get("/{conn_id}/orders")
def list_orders(conn_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _get_conn(conn_id, user.id, db)
    orders = (
        db.query(BrokerOrder)
        .filter(BrokerOrder.broker_conn_id == conn_id, BrokerOrder.user_id == user.id)
        .order_by(BrokerOrder.submitted_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": o.id,
            "ticker": o.ticker,
            "side": o.side,
            "qty": o.qty,
            "order_type": o.order_type,
            "limit_price": o.limit_price,
            "status": o.status,
            "fill_price": o.fill_price,
            "fill_qty": o.fill_qty,
            "broker_order_id": o.broker_order_id,
            "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
            "error_msg": o.error_msg,
        }
        for o in orders
    ]


@router.patch("/{conn_id}/auto-execute")
def toggle_auto_execute(conn_id: str, enabled: bool, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = _get_conn(conn_id, user.id, db)
    if enabled and user.tier == "free":
        raise HTTPException(402, "ביצוע אוטומטי דורש מנוי Pro")
    conn.auto_execute = enabled
    db.commit()
    return {"ok": True, "auto_execute": enabled}


# ─── Speed comparison ─────────────────────────────────────────────────────────

@router.get("/{conn_id}/latency")
async def measure_latency(conn_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Ping the broker API and measure round-trip time."""
    import time
    conn = _get_conn(conn_id, user.id, db)
    broker = get_broker(conn.broker_type, conn.credentials_enc)

    t0 = time.monotonic()
    ok, msg = await broker.test_connection()
    latency_ms = round((time.monotonic() - t0) * 1000, 1)

    return {
        "broker_type": conn.broker_type,
        "label": conn.label,
        "latency_ms": latency_ms,
        "connected": ok,
        "message": msg,
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_conn(conn_id: str, user_id: str, db: Session) -> BrokerConnection:
    conn = db.query(BrokerConnection).filter(
        BrokerConnection.id == conn_id,
        BrokerConnection.user_id == user_id,
    ).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    return conn
