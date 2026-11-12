from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import cache
from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import AssignmentAction, AssignmentOut, AssignmentRequest
from ..security import current_user, require_role, utcnow
from .common import assignment_out

router = APIRouter(prefix="/assignments", tags=["assignments"])
MAX_CODE_ATTEMPTS = 5  # TC-07: 5 wrong codes lock the form for 15 minutes


@router.post("", response_model=AssignmentOut, status_code=201)
def request_assignment(data: AssignmentRequest, request: Request, user: m.User = Depends(require_role("Trainee")),
                       db: Session = Depends(get_db)):
    lock_key = f"invite-fail:{user.user_id}"
    fails = cache.client.get(lock_key)
    if fails is not None and int(fails) >= MAX_CODE_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות")
    trainer = db.scalar(select(m.TrainerProfile).where(m.TrainerProfile.invite_code == data.invite_code.upper()))
    if trainer is None or not trainer.user.is_active:
        cache.hit_counter(lock_key, 900)
        audit(db, user.user_id, "invite_code_failed", "TrainerProfiles", None, request)
        db.commit()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "קוד ההזמנה לא נמצא")
    existing = db.scalar(select(m.TrainerTraineeAssignment).where(
        m.TrainerTraineeAssignment.trainee_id == user.user_id,
        m.TrainerTraineeAssignment.status.in_(["Pending", "Active"])))
    if existing is not None:  # BR-09: at most one active (or pending) assignment
        raise HTTPException(status.HTTP_409_CONFLICT, "כבר קיים שיוך פעיל או בקשה ממתינה")
    a = m.TrainerTraineeAssignment(trainer_id=trainer.user_id, trainee_id=user.user_id, status="Pending")
    db.add(a)
    db.flush()
    audit(db, user.user_id, "assignment_request", "TrainerTraineeAssignments", a.assignment_id, request)
    db.commit()
    cache.invalidate(cache.k_dashboard(trainer.user_id))
    return assignment_out(a)


@router.get("", response_model=list[AssignmentOut])
def list_assignments(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.TrainerTraineeAssignment)
    if user.role == "Trainer":
        q = q.where(m.TrainerTraineeAssignment.trainer_id == user.user_id)
    elif user.role == "Trainee":
        q = q.where(m.TrainerTraineeAssignment.trainee_id == user.user_id)
    return [assignment_out(a) for a in db.scalars(q.order_by(m.TrainerTraineeAssignment.assignment_id.desc()).limit(200))]


@router.patch("/{assignment_id}", response_model=AssignmentOut)
def act(assignment_id: int, data: AssignmentAction, request: Request, user: m.User = Depends(current_user),
        db: Session = Depends(get_db)):
    a = db.get(m.TrainerTraineeAssignment, assignment_id)
    if a is None:
        raise HTTPException(404, "השיוך לא נמצא")
    allowed = (
        (user.role == "Trainer" and a.trainer_id == user.user_id)
        or (data.action == "end" and user.role == "Trainee" and a.trainee_id == user.user_id)
        or (data.action == "end" and user.role == "Admin")
    )
    if not allowed:
        audit(db, user.user_id, "access_denied", "TrainerTraineeAssignments", a.assignment_id, request)
        db.commit()
        raise HTTPException(403, "אין הרשאה לפעולה זו")
    if data.action in ("approve", "reject") and a.status != "Pending":
        raise HTTPException(409, "הבקשה כבר טופלה")
    if data.action == "approve":
        a.status, a.start_date = "Active", utcnow()
    elif data.action == "reject":
        a.status, a.end_date = "Ended", utcnow()
    else:
        if a.status == "Ended":
            raise HTTPException(409, "השיוך כבר הסתיים")
        a.status, a.end_date = "Ended", utcnow()  # BR-09: access closes immediately
    audit(db, user.user_id, f"assignment_{data.action}", "TrainerTraineeAssignments", a.assignment_id, request)
    db.commit()
    cache.invalidate(cache.k_dashboard(a.trainer_id), cache.k_alerts(a.trainer_id))
    return assignment_out(a)
