from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..audit import audit
from ..cache import hit_counter
from ..db import get_db
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..security import create_token, hash_password, new_invite_code, utcnow, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(m.User.user_id).where(m.User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "כתובת הדוא\"ל כבר רשומה במערכת")
    user = m.User(email=email, password_hash=hash_password(data.password), first_name=data.first_name.strip(),
                  last_name=data.last_name.strip(), phone=data.phone, role=data.role, is_active=True,
                  created_at=utcnow(), last_login=utcnow())
    db.add(user)
    db.flush()
    if data.role == "Trainee":
        db.add(m.TraineeProfile(user_id=user.user_id))
    else:
        code = new_invite_code()
        while db.scalar(select(m.TrainerProfile.user_id).where(m.TrainerProfile.invite_code == code)) is not None:
            code = new_invite_code()
        db.add(m.TrainerProfile(user_id=user.user_id, invite_code=code))
    audit(db, user.user_id, "register", "Users", user.user_id, request)
    db.commit()
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    if hit_counter(f"login:{ip}:{data.email.lower()}", 900) > 10:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות")
    user = db.scalar(select(m.User).where(m.User.email == data.email.lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        audit(db, user.user_id if user else None, "login_failed", "Users", user.user_id if user else None, request)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "דוא\"ל או סיסמה שגויים")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "החשבון מושבת")
    user.last_login = utcnow()
    audit(db, user.user_id, "login", "Users", user.user_id, request)
    db.commit()
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))
