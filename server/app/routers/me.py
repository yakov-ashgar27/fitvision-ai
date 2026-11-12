from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs
from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import ProfileUpdate, SessionOut, UserOut
from ..security import current_user, require_role, utcnow
from ..tasks import job_purge_user
from .common import assignment_out, session_list, trends

router = APIRouter(prefix="/me", tags=["me"])


def _profile(db: Session, u: m.User) -> dict:
    out: dict = {"user": UserOut.model_validate(u).model_dump()}
    if u.role == "Trainee":
        p = u.trainee_profile
        out["trainee"] = None if p is None else {
            "birth_date": p.birth_date, "gender": p.gender,
            "height_cm": float(p.height_cm) if p.height_cm is not None else None,
            "weight_kg": float(p.weight_kg) if p.weight_kg is not None else None,
            "fitness_level": p.fitness_level, "injuries_notes": p.injuries_notes}
        a = db.scalar(select(m.TrainerTraineeAssignment).where(
            m.TrainerTraineeAssignment.trainee_id == u.user_id,
            m.TrainerTraineeAssignment.status.in_(["Pending", "Active"])))
        out["assignment"] = assignment_out(a).model_dump() if a else None
        out["goals"] = [{"goal_id": g.goal_id, "goal_type": g.goal_type,
                         "target_value": float(g.target_value) if g.target_value is not None else None,
                         "target_date": g.target_date, "status": g.status}
                        for g in db.scalars(select(m.Goal).where(m.Goal.trainee_id == u.user_id, m.Goal.status == "Active"))]
    elif u.role == "Trainer":
        p = u.trainer_profile
        out["trainer"] = None if p is None else {"certification": p.certification, "specialization": p.specialization,
                                                 "bio": p.bio, "invite_code": p.invite_code}
    return out


@router.get("")
def me(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return _profile(db, user)


@router.put("/profile")
def update_profile(data: ProfileUpdate, request: Request, user: m.User = Depends(current_user),
                   db: Session = Depends(get_db)):
    for f in ("first_name", "last_name", "phone"):
        v = getattr(data, f)
        if v is not None:
            setattr(user, f, v)
    if data.trainee is not None and user.role == "Trainee":
        p = user.trainee_profile or m.TraineeProfile(user_id=user.user_id)
        for k, v in data.trainee.model_dump(exclude_unset=True).items():
            setattr(p, k, v)
        db.add(p)
    if data.trainer is not None and user.role == "Trainer":
        p = user.trainer_profile
        for k, v in data.trainer.model_dump(exclude_unset=True).items():
            setattr(p, k, v)
    audit(db, user.user_id, "profile_update", "Users", user.user_id, request)
    db.commit()
    db.refresh(user)
    return _profile(db, user)


@router.post("/consent")
def consent(request: Request, user: m.User = Depends(require_role("Trainee")), db: Session = Depends(get_db)):
    """NFR-08: informed consent before the first camera use."""
    if user.consent_at is None:
        user.consent_at = utcnow()
        audit(db, user.user_id, "consent", "Users", user.user_id, request)
        db.commit()
    return {"consent_at": user.consent_at}


@router.delete("", status_code=202)
def delete_me(request: Request, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "Admin":
        raise HTTPException(400, "לא ניתן למחוק חשבון מנהל מערכת")
    audit(db, user.user_id, "delete_request", "Users", user.user_id, request)
    user.is_active = False
    db.commit()
    job_id, queued = jobs.enqueue(job_purge_user, user.user_id)
    return {"job_id": job_id, "queued": queued}


@router.get("/sessions", response_model=list[SessionOut])
def my_sessions(exercise_id: int | None = None, limit: int = Query(50, le=200), offset: int = 0,
                user: m.User = Depends(require_role("Trainee")), db: Session = Depends(get_db)):
    return session_list(db, user.user_id, None, exercise_id, limit, offset)


@router.get("/trends")
def my_trends(weeks: int = Query(8, ge=1, le=52), user: m.User = Depends(require_role("Trainee")),
              db: Session = Depends(get_db)):
    return trends(db, user.user_id, weeks, None)


@router.get("/reports")
def my_reports(user: m.User = Depends(require_role("Trainee")), db: Session = Depends(get_db)):
    rows = db.execute(
        select(m.Report.report_id, m.Report.generated_at, m.Report.status, m.Report.avg_score,
               m.WorkoutSession.started_at, m.ReportDelivery.sent_at, m.ReportDelivery.opened_at)
        .join(m.WorkoutSession, m.WorkoutSession.session_id == m.Report.session_id)
        .outerjoin(m.ReportDelivery, (m.ReportDelivery.report_id == m.Report.report_id)
                   & (m.ReportDelivery.recipient_id == user.user_id))
        .where(m.WorkoutSession.trainee_id == user.user_id)
        .order_by(m.Report.generated_at.desc()).limit(100)
    ).all()
    seen: dict[int, dict] = {}
    for rid, gen, st, sc, started, sent, opened in rows:
        cur = seen.setdefault(rid, {"report_id": rid, "generated_at": gen, "status": st,
                                     "avg_score": float(sc) if sc is not None else None, "started_at": started,
                                     "sent_at": None, "opened_at": None})
        if sent and (cur["sent_at"] is None or sent > cur["sent_at"]):
            cur["sent_at"], cur["opened_at"] = sent, opened
    return list(seen.values())
