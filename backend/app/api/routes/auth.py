"""Auth endpoints — register, login, me."""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.data.database import get_db
from app.models.db_models import User
from app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tier: str
    email: str


@router.post("/register", response_model=TokenOut)
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if len(body.password) < 6:
        raise HTTPException(400, "סיסמה חייבת להיות לפחות 6 תווים")

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(409, "אימייל כבר רשום")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        password_hash=hash_password(body.password),
        tier="free",
    )
    db.add(user)
    db.commit()

    token = create_access_token(user.id, user.email, user.tier)
    return TokenOut(access_token=token, tier=user.tier, email=user.email)


@router.post("/login", response_model=TokenOut)
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "אימייל או סיסמה שגויים")

    token = create_access_token(user.id, user.email, user.tier)
    return TokenOut(access_token=token, tier=user.tier, email=user.email)


@router.post("/reset-password")
def reset_password(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(404, "משתמש לא נמצא")
    user.password_hash = hash_password(body.password)
    db.commit()
    token = create_access_token(user.id, user.email, user.tier)
    return TokenOut(access_token=token, tier=user.tier, email=user.email)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "tier": user.tier,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
