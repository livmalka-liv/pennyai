"""
Stripe webhook handler and checkout session creator.

Entitlement logic:
  - checkout.session.completed  → activate subscription, set tier in DB
  - customer.subscription.updated → handle upgrades/downgrades
  - customer.subscription.deleted → downgrade to free tier
  - invoice.payment_failed → send warning, allow grace period (3 days)

Tier price mapping (configure real Price IDs in .env):
  tester_monthly  → $39/mo
  pro_monthly     → $89/mo
  elite_monthly   → $149/mo
  elite_yearly    → $1,200/yr
"""

import stripe
from fastapi import APIRouter, Request, HTTPException, Header
from app.core.config import get_settings
from app.models.schemas import StripeCheckoutRequest, SubscriptionTier

router = APIRouter(prefix="/stripe", tags=["stripe"])

TIER_PRICE_MAP = {
    ("tester", "monthly"): "stripe_price_tester_monthly",
    ("pro", "monthly"): "stripe_price_pro_monthly",
    ("elite", "monthly"): "stripe_price_elite_monthly",
    ("elite", "yearly"): "stripe_price_elite_yearly",
}

TIER_METADATA_MAP = {
    "price_tester": SubscriptionTier.TESTER,
    "price_pro": SubscriptionTier.PRO,
    "price_elite": SubscriptionTier.ELITE,
}


@router.post("/create-checkout")
async def create_checkout_session(request: StripeCheckoutRequest):
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key

    price_attr = TIER_PRICE_MAP.get((request.tier, request.billing))
    if not price_attr:
        raise HTTPException(status_code=400, detail="Invalid tier/billing combination")

    price_id = getattr(settings, price_attr, "")
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail="Stripe not configured — set price IDs in .env",
        )

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=request.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=request.cancel_url,
            metadata={
                "user_id": request.user_id,
                "tier": request.tier,
            },
            subscription_data={
                "metadata": {
                    "user_id": request.user_id,
                    "tier": request.tier,
                }
            },
        )
        return {"url": session.url}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
):
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key

    body = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            body, stripe_signature, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        user_id = data["metadata"].get("user_id")
        tier = data["metadata"].get("tier")
        if user_id and tier:
            await _activate_subscription(user_id, tier)

    elif event_type == "customer.subscription.updated":
        user_id = data["metadata"].get("user_id")
        status = data["status"]
        tier = data["metadata"].get("tier")
        if user_id and status == "active" and tier:
            await _activate_subscription(user_id, tier)

    elif event_type == "customer.subscription.deleted":
        user_id = data["metadata"].get("user_id")
        if user_id:
            await _downgrade_to_free(user_id)

    elif event_type == "invoice.payment_failed":
        user_id = data.get("metadata", {}).get("user_id")
        if user_id:
            await _handle_payment_failure(user_id)

    return {"received": True}


async def _activate_subscription(user_id: str, tier: str):
    """Update user tier in database. Replace stub with real DB call."""
    # TODO: db.users.update(user_id, tier=tier, subscription_active=True)
    pass


async def _downgrade_to_free(user_id: str):
    """Downgrade user to free tier on subscription cancellation."""
    # TODO: db.users.update(user_id, tier="free", subscription_active=False)
    pass


async def _handle_payment_failure(user_id: str):
    """Flag account for payment issue — allow 3-day grace before downgrade."""
    # TODO: db.users.update(user_id, payment_failed_at=datetime.utcnow())
    # TODO: schedule_downgrade_job(user_id, delay_days=3)
    pass
