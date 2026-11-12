from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import AuditOut, UserAdminUpdate, UserOut
from ..security import new_invite_code, require_role

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def users(q: str | None = None, role: str | None = None, limit: int = Query(200, le=1000), offset: int = 0,
          user: m.User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    query = select(m.User)
    if q:
        like = f"%{q}%"
        query = query.where(or_(m.User.email.like(like), m.User.first_name.like(like), m.User.last_name.like(like)))
    if role:
        query = query.where(m.User.role == role)
    return db.scalars(query.order_by(m.User.user_id).limit(limit).offset(offset)).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserAdminUpdate, request: Request, user: m.User = Depends(require_role("Admin")),
                db: Session = Depends(get_db)):
    u = db.get(m.User, user_id)
    if u is None:
        raise HTTPException(404, "המשתמש לא נמצא")
    if u.user_id == user.user_id and (data.is_active is False or (data.role and data.role != "Admin")):
        raise HTTPException(409, "מנהל אינו יכול להשבית את עצמו או לשנות את תפקידו")
    if data.role and data.role != u.role:
        old = u.role
        u.role = data.role
        if data.role == "Trainer" and u.trainer_profile is None:
            db.add(m.TrainerProfile(user_id=u.user_id, invite_code=new_invite_code()))
        if data.role == "Trainee" and u.trainee_profile is None:
            db.add(m.TraineeProfile(user_id=u.user_id))
        audit(db, user.user_id, f"role_change_{old}_to_{data.role}"[:50], "Users", u.user_id, request)
    if data.is_active is not None and data.is_active != u.is_active:
        u.is_active = data.is_active
        audit(db, user.user_id, "user_enable" if data.is_active else "user_disable", "Users", u.user_id, request)
    db.commit()
    db.refresh(u)
    return u


@router.get("/audit-log", response_model=list[AuditOut])
def audit_log(user_id: int | None = None, action: str | None = None, date_from: datetime | None = None,
              date_to: datetime | None = None, limit: int = Query(500, le=5000), offset: int = 0,
              admin: m.User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    q = select(m.AuditLog)
    if user_id is not None:
        q = q.where(m.AuditLog.user_id == user_id)
    if action:
        q = q.where(m.AuditLog.action.like(f"%{action}%"))
    if date_from:
        q = q.where(m.AuditLog.created_at >= date_from)
    if date_to:
        q = q.where(m.AuditLog.created_at <= date_to)
    return db.scalars(q.order_by(m.AuditLog.created_at.desc(), m.AuditLog.log_id.desc()).limit(limit).offset(offset)).all()
