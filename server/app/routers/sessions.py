from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from .. import jobs
from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import FinishIn, FinishOut, SessionIn, SessionOut, SetIn, SetOut
from ..security import assert_can_view_session, assert_can_view_trainee, current_user, require_role
from ..services.reports import ingest_set
from ..tasks import job_generate_report
from .common import session_list

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _own_session(db: Session, session_id: int, user: m.User) -> m.WorkoutSession:
    s = db.get(m.WorkoutSession, session_id)
    if s is None or s.trainee_id != user.user_id:
        raise HTTPException(404, "האימון לא נמצא")
    return s


def _out(s: m.WorkoutSession) -> SessionOut:
    return SessionOut(session_id=s.session_id, trainee_id=s.trainee_id, plan_id=s.plan_id, started_at=s.started_at,
                      ended_at=s.ended_at, status=s.status,
                      avg_technique_score=float(s.avg_technique_score) if s.avg_technique_score is not None else None,
                      report_id=s.report.report_id if s.report else None,
                      exercises=sorted({x.exercise.name for x in s.sets}), total_reps=sum(x.total_reps for x in s.sets))


@router.post("", response_model=SessionOut, status_code=201)
def start_session(data: SessionIn, request: Request, user: m.User = Depends(require_role("Trainee")),
                  db: Session = Depends(get_db)):
    if user.consent_at is None:  # NFR-08
        raise HTTPException(409, "יש לאשר את הסכמת הפרטיות לפני שימוש במצלמה")
    if data.plan_id is not None:
        p = db.get(m.WorkoutPlan, data.plan_id)
        if p is None or p.trainee_id != user.user_id:
            raise HTTPException(404, "התוכנית לא נמצאה")
    s = m.WorkoutSession(trainee_id=user.user_id, plan_id=data.plan_id, started_at=data.started_at.replace(tzinfo=None),
                         status="InProgress", device_info=data.device_info)
    db.add(s)
    db.flush()
    audit(db, user.user_id, "session_start", "WorkoutSessions", s.session_id, request)
    db.commit()
    return _out(s)


@router.post("/{session_id}/sets", response_model=SetOut, status_code=201)
def add_set(session_id: int, data: SetIn, response: Response, user: m.User = Depends(require_role("Trainee")),
            db: Session = Depends(get_db)):
    s = _own_session(db, session_id, user)
    if db.get(m.Exercise, data.exercise_id) is None:
        raise HTTPException(422, "תרגיל לא קיים")
    st, created = ingest_set(db, s, data)
    db.commit()
    if not created:
        response.status_code = 200  # replayed from the offline queue: already stored
    return st


@router.post("/{session_id}/finish", response_model=FinishOut)
def finish(session_id: int, data: FinishIn, request: Request, user: m.User = Depends(require_role("Trainee")),
           db: Session = Depends(get_db)):
    s = _own_session(db, session_id, user)
    if s.status == "InProgress":
        s.status = data.status
        s.ended_at = data.ended_at.replace(tzinfo=None)
        audit(db, user.user_id, f"session_{data.status.lower()}", "WorkoutSessions", s.session_id, request)
        db.commit()
    job_id, queued = jobs.enqueue(job_generate_report, s.session_id)  # heavy work goes to the queue (6.3.2)
    db.refresh(s)
    report_id = None
    if not queued:
        res = jobs.status(job_id).get("result") or {}
        report_id = res.get("report_id")
    return FinishOut(session=_out(s), report_job=job_id, report_queued=queued, report_id=report_id)


@router.get("", response_model=list[SessionOut])
def list_sessions(request: Request, trainee_id: int | None = None, exercise_id: int | None = None,
                  limit: int = Query(50, le=200), offset: int = 0, user: m.User = Depends(current_user),
                  db: Session = Depends(get_db)):
    tid = trainee_id if trainee_id is not None else user.user_id
    a = assert_can_view_trainee(db, user, tid, request)
    since: datetime | None = a.start_date if a is not None else None  # BR-09
    return session_list(db, tid, since, exercise_id, limit, offset)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, request: Request, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(m.WorkoutSession, session_id)
    if s is None:
        raise HTTPException(404, "האימון לא נמצא")
    assert_can_view_session(db, user, s, request)
    return _out(s)
