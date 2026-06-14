"""Stripe checkout and webhook endpoints."""

import os
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.models.db_models import User
from app.core.auth import get_current_user

router = APIRouter(prefix="/stripe", tags=["stripe"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://frontend-liav-malka.vercel.app")

# ILS prices per tier per billing cycle (in agorot — smallest ILS unit)
PRICES: dict[str, dict[str, int]] = {
    "starter": {"monthly": 5900,  "yearly": 47400},   # ₪59 / ₪474
    "pro":     {"monthly": 14900, "yearly": 119200},  # ₪149 / ₪1192
}

TIER_NAMES = {"starter": "Starter", "pro": "Pro"}


class CheckoutBody(BaseModel):
    tier: str          # "starter" | "pro"
    billing: str       # "monthly" | "yearly"


@router.post("/create-checkout")
def create_checkout(
    body: CheckoutBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not stripe.api_key:
        raise HTTPException(503, "Stripe not configured")

    tier = body.tier.lower()
    billing = body.billing.lower()
    if tier not in PRICES:
        raise HTTPException(400, f"Unknown tier: {tier}")
    if billing not in ("monthly", "yearly"):
        raise HTTPException(400, "billing must be monthly or yearly")

    unit_amount = PRICES[tier][billing]
    interval = "month" if billing == "monthly" else "year"
    name = f"PennyAI {TIER_NAMES[tier]} ({'חודשי' if billing == 'monthly' else 'שנתי'})"

    session = stripe.checkout.Session.create(
        customer_email=user.email,
        metadata={"user_id": user.id, "tier": tier},
        mode="subscription",
        line_items=[{
            "quantity": 1,
            "price_data": {
                "currency": "ils",
                "unit_amount": unit_amount,
                "recurring": {"interval": interval},
                "product_data": {"name": name},
            },
        }],
        success_url=f"{FRONTEND_URL}/sandbox?upgraded={tier}",
        cancel_url=f"{FRONTEND_URL}/vault",
    )

    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe sends events here. Verify signature, update user tier."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            raise HTTPException(400, "Invalid signature")
    else:
        # Dev mode — no signature verification
        import json
        event = json.loads(payload)

    etype = event.get("type") if isinstance(event, dict) else event.type

    if etype == "checkout.session.completed":
        session_obj = event["data"]["object"] if isinstance(event, dict) else event.data.object
        meta = session_obj.get("metadata", {}) if isinstance(session_obj, dict) else session_obj.metadata
        user_id = meta.get("user_id") if meta else None
        tier = meta.get("tier") if meta else None
        customer_id = (
            session_obj.get("customer") if isinstance(session_obj, dict)
            else session_obj.customer
        )

        if user_id and tier:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.tier = tier
                if customer_id:
                    user.stripe_customer_id = customer_id
                db.commit()

    elif etype in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"] if isinstance(event, dict) else event.data.object
        customer_id = sub.get("customer") if isinstance(sub, dict) else sub.customer
        if customer_id:
            user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
            if user:
                user.tier = "free"
                db.commit()

    return {"ok": True}


@router.get("/portal")
def billing_portal(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Redirect to Stripe Customer Portal to manage subscription."""
    if not stripe.api_key:
        raise HTTPException(503, "Stripe not configured")
    if not user.stripe_customer_id:
        raise HTTPException(400, "No active subscription")

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{FRONTEND_URL}/sandbox",
    )
    return {"url": session.url}
