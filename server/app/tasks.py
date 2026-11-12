"""Background jobs executed by the RQ worker (or inline). Each job opens its own DB session."""
from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import delete, select

from . import cache
from . import models as m
from .db import SessionLocal
from .services import alerts, email, exporting
from .services.reports import generate_report


@contextmanager
def _db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def report_context(db, report: m.Report) -> dict:
    import json

    trainee = report.session.trainee if hasattr(report.session, "trainee") else db.get(m.User, report.session.trainee_id)
    return {
        "report_id": report.report_id, "session_id": report.session_id, "trainee_id": report.session.trainee_id,
        "trainee_name": trainee.full_name, "generated_at": report.generated_at, "started_at": report.session.started_at,
        "status": report.status, "summary": json.loads(report.summary_json),
        "notes": [{"trainer_name": n.trainer.full_name, "note_text": n.note_text, "created_at": n.created_at}
                  for n in report.notes],
    }


def job_generate_report(session_id: int) -> dict:
    with _db() as db:
        rid = generate_report(db, session_id)
        s = db.get(m.WorkoutSession, session_id)
        if s is not None:
            for a in db.scalars(select(m.TrainerTraineeAssignment).where(
                    m.TrainerTraineeAssignment.trainee_id == s.trainee_id,
                    m.TrainerTraineeAssignment.status == "Active")):
                cache.invalidate(cache.k_dashboard(a.trainer_id), cache.k_alerts(a.trainer_id))
        return {"report_id": rid}


def job_export(report_id: int, fmt: str) -> dict:
    with _db() as db:
        rep = db.get(m.Report, report_id)
        path = exporting.EXPORTERS[fmt](report_context(db, rep))
        rep.file_path = path
        db.commit()
        return {"report_id": report_id, "format": fmt, "path": path}


def job_send_report(report_id: int, channel: str, fmt: str) -> dict:
    with _db() as db:
        rep = db.get(m.Report, report_id)
        trainee = db.get(m.User, rep.session.trainee_id)
        attachment = None
        if channel == "Email":
            attachment = exporting.EXPORTERS[fmt.lower()](report_context(db, rep))
            email.send(trainee.email, "דוח סיכום אימון – FitVision AI",
                       f"שלום {trainee.first_name},\nמצורף דוח הסיכום של האימון שלך.", attachment)
        return {"report_id": report_id, "channel": channel, "attachment": attachment}


def job_close_stale_sessions(hours: int = 12) -> dict:
    """Close workouts left open (app closed mid-workout): with sets → Aborted + partial report (BR-12); empty → deleted."""
    from datetime import UTC, datetime, timedelta

    limit = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=hours)
    closed = deleted = 0
    with _db() as db:
        stale = db.scalars(select(m.WorkoutSession).where(m.WorkoutSession.status == "InProgress",
                                                          m.WorkoutSession.started_at < limit)).all()
        for s in stale:
            if s.sets:
                s.status, s.ended_at = "Aborted", max(x.ended_at for x in s.sets)
                db.flush()
                generate_report(db, s.session_id)
                closed += 1
            else:
                db.delete(s)
                deleted += 1
        db.commit()
    return {"closed": closed, "deleted": deleted}


def job_refresh_alerts() -> dict:
    with _db() as db:
        return {"trainers": alerts.refresh_all(db)}


def job_send_reminder(trainee_id: int, trainer_name: str) -> dict:
    with _db() as db:
        t = db.get(m.User, trainee_id)
        email.send(t.email, "תזכורת אימון – FitVision AI",
                   f"שלום {t.first_name},\nהמאמן/ת {trainer_name} מזכיר/ה לך לחזור להתאמן לפי התוכנית.")
        return {"trainee_id": trainee_id}


def job_purge_user(user_id: int) -> dict:
    """NFR-08: delete a user's personal and workout data (runs well inside the 30-day limit)."""
    with _db() as db:
        sessions = db.scalars(select(m.WorkoutSession.session_id).where(m.WorkoutSession.trainee_id == user_id)).all()
        if sessions:
            set_ids = db.scalars(select(m.ExerciseSet.set_id).where(m.ExerciseSet.session_id.in_(sessions))).all()
            report_ids = db.scalars(select(m.Report.report_id).where(m.Report.session_id.in_(sessions))).all()
            if set_ids:
                db.execute(delete(m.FormErrorEvent).where(m.FormErrorEvent.set_id.in_(set_ids)))
                db.execute(delete(m.Repetition).where(m.Repetition.set_id.in_(set_ids)))
                db.execute(delete(m.ExerciseSet).where(m.ExerciseSet.set_id.in_(set_ids)))
            if report_ids:
                db.execute(delete(m.TrainerNote).where(m.TrainerNote.report_id.in_(report_ids)))
                db.execute(delete(m.ReportDelivery).where(m.ReportDelivery.report_id.in_(report_ids)))
                db.execute(delete(m.Report).where(m.Report.report_id.in_(report_ids)))
            db.execute(delete(m.WorkoutSession).where(m.WorkoutSession.session_id.in_(sessions)))
        plan_ids = db.scalars(select(m.WorkoutPlan.plan_id).where(m.WorkoutPlan.trainee_id == user_id)).all()
        if plan_ids:
            db.execute(delete(m.PlanExercise).where(m.PlanExercise.plan_id.in_(plan_ids)))
            db.execute(delete(m.WorkoutPlan).where(m.WorkoutPlan.plan_id.in_(plan_ids)))
        db.execute(delete(m.Goal).where(m.Goal.trainee_id == user_id))
        db.execute(delete(m.TraineeProfile).where(m.TraineeProfile.user_id == user_id))
        db.execute(delete(m.TrainerTraineeAssignment).where(m.TrainerTraineeAssignment.trainee_id == user_id))
        u = db.get(m.User, user_id)
        if u is not None:
            u.email = f"deleted-{user_id}@deleted.invalid"
            u.first_name, u.last_name, u.phone = "משתמש", "שנמחק", None
            u.password_hash = "!"
            u.is_active = False
        db.commit()
        return {"user_id": user_id, "sessions_deleted": len(sessions)}
