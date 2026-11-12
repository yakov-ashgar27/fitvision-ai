from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import cache, jobs
from .. import models as m
from ..audit import audit
from ..db import SessionLocal, get_db
from ..security import assert_can_view_trainee, current_user, require_role
from ..services import alerts as alert_svc
from ..tasks import job_send_reminder
from .common import assignment_out, trends

router = APIRouter(tags=["trainer"])
DASH_TTL = 60


def _with_session(fn, *args):
    db = SessionLocal()
    try:
        return fn(db, *args)
    finally:
        db.close()


def _trainee_rows(db: Session, trainer_id: int) -> list[dict]:
    now = datetime.now(UTC).replace(tzinfo=None)
    four_weeks = now - timedelta(weeks=4)
    assigns = db.scalars(select(m.TrainerTraineeAssignment).where(
        m.TrainerTraineeAssignment.trainer_id == trainer_id, m.TrainerTraineeAssignment.status == "Active")).all()
    rows = []
    for a in assigns:
        since = max(a.start_date or four_weeks, four_weeks)
        stats = db.execute(
            select(func.max(m.WorkoutSession.started_at), func.avg(m.WorkoutSession.avg_technique_score),
                   func.count(m.WorkoutSession.session_id))
            .where(m.WorkoutSession.trainee_id == a.trainee_id, m.WorkoutSession.started_at >= since)
        ).one()
        last_any = db.scalar(select(func.max(m.WorkoutSession.started_at)).where(
            m.WorkoutSession.trainee_id == a.trainee_id, m.WorkoutSession.started_at >= (a.start_date or now)))
        recent = db.scalars(select(m.WorkoutSession.avg_technique_score).where(
            m.WorkoutSession.trainee_id == a.trainee_id, m.WorkoutSession.started_at >= (a.start_date or now),
            m.WorkoutSession.avg_technique_score.is_not(None)).order_by(m.WorkoutSession.started_at.desc()).limit(4)).all()
        trend = None
        if len(recent) >= 2:
            prev = [float(x) for x in recent[1:]]
            base = sum(prev) / len(prev)
            trend = round(100 * (float(recent[0]) - base) / base, 1) if base else None
        rows.append({"trainee_id": a.trainee_id, "name": a.trainee.full_name, "since": a.start_date,
                     "last_session": last_any, "avg_score": round(float(stats[1]), 1) if stats[1] is not None else None,
                     "sessions_4w": stats[2], "trend_pct": trend, "assignment_id": a.assignment_id})
    return rows


def _kpis(db: Session, trainer_id: int) -> dict:
    now = datetime.now(UTC).replace(tzinfo=None)
    week = now - timedelta(days=7)
    active = db.scalar(select(func.count()).select_from(m.TrainerTraineeAssignment).where(
        m.TrainerTraineeAssignment.trainer_id == trainer_id, m.TrainerTraineeAssignment.status == "Active"))
    base = (select(m.WorkoutSession)
            .join(m.TrainerTraineeAssignment, (m.TrainerTraineeAssignment.trainee_id == m.WorkoutSession.trainee_id)
                  & (m.TrainerTraineeAssignment.trainer_id == trainer_id)
                  & (m.TrainerTraineeAssignment.status == "Active"))
            .where(m.WorkoutSession.started_at >= m.TrainerTraineeAssignment.start_date))
    sub = base.where(m.WorkoutSession.started_at >= week).subquery()
    sessions_week = db.scalar(select(func.count()).select_from(sub))
    avg_week = db.scalar(select(func.avg(sub.c.avg_technique_score)))
    pending = db.scalar(select(func.count()).select_from(
        select(m.Report.report_id).join(m.WorkoutSession, m.WorkoutSession.session_id == m.Report.session_id)
        .join(m.TrainerTraineeAssignment, (m.TrainerTraineeAssignment.trainee_id == m.WorkoutSession.trainee_id)
              & (m.TrainerTraineeAssignment.trainer_id == trainer_id) & (m.TrainerTraineeAssignment.status == "Active"))
        .where(m.Report.status == "Draft", m.WorkoutSession.started_at >= m.TrainerTraineeAssignment.start_date)
        .subquery()))
    return {"active_trainees": active or 0, "sessions_week": sessions_week or 0,
            "avg_score_week": round(float(avg_week), 1) if avg_week is not None else None,
            "reports_to_review": pending or 0}


def _requests(db: Session, trainer_id: int) -> list[dict]:
    return [assignment_out(a).model_dump() for a in db.scalars(select(m.TrainerTraineeAssignment).where(
        m.TrainerTraineeAssignment.trainer_id == trainer_id, m.TrainerTraineeAssignment.status == "Pending"))]


@router.get("/dashboard")
async def dashboard(user: m.User = Depends(require_role("Trainer"))):
    """Screen 4 in one request: KPIs, trainees table, alerts and pending requests (6.3.2)."""
    hit = cache.get_json(cache.k_dashboard(user.user_id))
    if hit is not None:
        return {**hit, "cached": True}
    tid = user.user_id
    kpis, rows, alerts, requests = await asyncio.gather(  # independent queries in parallel, separate sessions
        run_in_threadpool(_with_session, _kpis, tid),
        run_in_threadpool(_with_session, _trainee_rows, tid),
        run_in_threadpool(_with_session, alert_svc.get_for_trainer, tid),
        run_in_threadpool(_with_session, _requests, tid),
    )
    counts = alert_svc.group_by_trainee(alerts)
    for r in rows:
        r["alerts"] = counts.get(r["trainee_id"], 0)
    out = {"kpis": kpis, "trainees": rows, "alerts": alerts, "requests": requests}
    cache.set_json(cache.k_dashboard(tid), out, DASH_TTL)
    return {**out, "cached": False}


@router.get("/alerts")
def get_alerts(user: m.User = Depends(require_role("Trainer")), db: Session = Depends(get_db)):
    return alert_svc.get_for_trainer(db, user.user_id)


@router.get("/trainees/{trainee_id}")
def trainee_detail(trainee_id: int, request: Request, user: m.User = Depends(require_role("Trainer")),
                   db: Session = Depends(get_db)):
    a = assert_can_view_trainee(db, user, trainee_id, request)
    t = db.get(m.User, trainee_id)
    p = t.trainee_profile
    return {"trainee_id": t.user_id, "name": t.full_name, "email": t.email, "phone": t.phone,
            "assignment": assignment_out(a).model_dump(),
            "profile": None if p is None else {
                "birth_date": p.birth_date, "gender": p.gender,
                "height_cm": float(p.height_cm) if p.height_cm is not None else None,
                "weight_kg": float(p.weight_kg) if p.weight_kg is not None else None,
                "fitness_level": p.fitness_level, "injuries_notes": p.injuries_notes}}


@router.get("/trainees/{trainee_id}/trends")
def trainee_trends(trainee_id: int, request: Request, weeks: int = Query(8, ge=1, le=52),
                   user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    a = assert_can_view_trainee(db, user, trainee_id, request)
    return trends(db, trainee_id, weeks, a.start_date if a is not None else None)


@router.post("/trainees/{trainee_id}/remind", status_code=202)
def remind(trainee_id: int, request: Request, user: m.User = Depends(require_role("Trainer")),
           db: Session = Depends(get_db)):
    assert_can_view_trainee(db, user, trainee_id, request)
    audit(db, user.user_id, "reminder_send", "Users", trainee_id, request)
    db.commit()
    job_id, queued = jobs.enqueue(job_send_reminder, trainee_id, user.full_name)
    return {"job_id": job_id, "queued": queued}
