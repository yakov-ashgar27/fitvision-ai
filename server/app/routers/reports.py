from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import cache, jobs
from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import JobOut, NoteIn, NoteOut, ReportOut, SendIn
from ..security import assert_can_view_session, current_user, require_role, utcnow
from ..services import exporting
from ..tasks import job_export, job_send_report

router = APIRouter(tags=["reports"])


def _get(db: Session, report_id: int, user: m.User, request: Request) -> m.Report:
    r = db.get(m.Report, report_id)
    if r is None:
        raise HTTPException(404, "הדוח לא נמצא")
    assert_can_view_session(db, user, r.session, request)
    return r


def _out(db: Session, r: m.Report) -> ReportOut:
    trainee = db.get(m.User, r.session.trainee_id)
    return ReportOut(
        report_id=r.report_id, session_id=r.session_id, trainee_id=trainee.user_id, trainee_name=trainee.full_name,
        generated_at=r.generated_at, status=r.status, total_reps=r.total_reps, valid_reps=r.valid_reps,
        avg_score=float(r.avg_score) if r.avg_score is not None else None,
        improvement_pct=float(r.improvement_pct) if r.improvement_pct is not None else None,
        summary=json.loads(r.summary_json),
        notes=[NoteOut(note_id=n.note_id, trainer_id=n.trainer_id, trainer_name=n.trainer.full_name,
                       note_text=n.note_text, created_at=n.created_at) for n in r.notes],
        session_status=r.session.status, started_at=r.session.started_at)


@router.get("/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: int, request: Request, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """One request returns the whole screen 5: sets, reps, failure points, trend and notes (6.3.2)."""
    r = _get(db, report_id, user, request)
    if user.role == "Trainee":
        for d in db.scalars(select(m.ReportDelivery).where(m.ReportDelivery.report_id == r.report_id,
                                                            m.ReportDelivery.recipient_id == user.user_id,
                                                            m.ReportDelivery.opened_at.is_(None))):
            d.opened_at = utcnow()  # US-15: opening time is recorded
        db.commit()
    return _out(db, r)


@router.get("/reports")
def list_reports(status: str | None = None, trainee_id: int | None = None,
                 user: m.User = Depends(require_role("Trainer")), db: Session = Depends(get_db)):
    q = (select(m.Report.report_id, m.Report.status, m.Report.generated_at, m.Report.avg_score, m.User.user_id,
                m.User.first_name, m.User.last_name, m.WorkoutSession.started_at)
         .join(m.WorkoutSession, m.WorkoutSession.session_id == m.Report.session_id)
         .join(m.User, m.User.user_id == m.WorkoutSession.trainee_id)
         .join(m.TrainerTraineeAssignment, (m.TrainerTraineeAssignment.trainee_id == m.User.user_id)
               & (m.TrainerTraineeAssignment.trainer_id == user.user_id)
               & (m.TrainerTraineeAssignment.status == "Active"))
         .where(m.WorkoutSession.started_at >= m.TrainerTraineeAssignment.start_date))
    if status:
        q = q.where(m.Report.status == status)
    if trainee_id:
        q = q.where(m.User.user_id == trainee_id)
    rows = db.execute(q.order_by(m.Report.generated_at.desc()).limit(200)).all()
    return [{"report_id": r[0], "status": r[1], "generated_at": r[2], "avg_score": float(r[3]) if r[3] is not None else None,
             "trainee_id": r[4], "trainee_name": f"{r[5]} {r[6]}", "started_at": r[7]} for r in rows]


@router.post("/reports/{report_id}/notes", response_model=NoteOut, status_code=201)
def add_note(report_id: int, data: NoteIn, request: Request, user: m.User = Depends(require_role("Trainer")),
             db: Session = Depends(get_db)):
    r = _get(db, report_id, user, request)
    n = m.TrainerNote(report_id=r.report_id, trainer_id=user.user_id, note_text=data.note_text, created_at=utcnow())
    db.add(n)
    if r.status == "Draft":
        r.status = "Reviewed"  # BR-10
    db.flush()
    audit(db, user.user_id, "report_note", "Reports", r.report_id, request)
    db.commit()
    cache.invalidate(cache.k_dashboard(user.user_id))
    return NoteOut(note_id=n.note_id, trainer_id=user.user_id, trainer_name=user.full_name, note_text=n.note_text,
                   created_at=n.created_at)


@router.post("/reports/{report_id}/export/{fmt}", response_model=JobOut)
def export(report_id: int, fmt: str, request: Request, user: m.User = Depends(require_role("Trainer", "Trainee")),
           db: Session = Depends(get_db)):
    # trainers export their trainees' reports (US-14); a trainee may export their own (access checked in _get)
    if fmt not in exporting.EXPORTERS:
        raise HTTPException(422, "פורמט לא נתמך")
    r = _get(db, report_id, user, request)
    audit(db, user.user_id, f"report_export_{fmt}", "Reports", r.report_id, request)  # US-14: export is logged
    db.commit()
    job_id, queued = jobs.enqueue(job_export, r.report_id, fmt)
    st = jobs.status(job_id)
    body = JobOut(job_id=job_id, status=st["status"], result=st.get("result"), error=st.get("error"))
    return JSONResponse(body.model_dump(), status_code=202 if queued else 200)


@router.get("/jobs/{job_id}", response_model=JobOut)
def job_status(job_id: str, user: m.User = Depends(current_user)):
    st = jobs.status(job_id)
    return JobOut(job_id=job_id, status=st["status"], result=st.get("result"), error=st.get("error"))


@router.get("/reports/{report_id}/files/{fmt}")
def download(report_id: int, fmt: str, request: Request, user: m.User = Depends(current_user),
             db: Session = Depends(get_db)):
    r = _get(db, report_id, user, request)
    path = exporting.file_for(r.report_id, fmt)
    if path is None:
        raise HTTPException(404, "הקובץ עדיין לא נוצר")
    return FileResponse(path, media_type=exporting.MIME[fmt], filename=f"fitvision-report-{r.report_id}.{fmt}")


@router.post("/reports/{report_id}/send", response_model=JobOut)
def send(report_id: int, data: SendIn, request: Request, user: m.User = Depends(require_role("Trainer")),
         db: Session = Depends(get_db)):
    r = _get(db, report_id, user, request)
    r.status = "Sent"  # BR-10
    db.add(m.ReportDelivery(report_id=r.report_id, recipient_id=r.session.trainee_id, channel=data.channel,
                            file_format=data.file_format, sent_at=utcnow()))
    audit(db, user.user_id, "report_send", "Reports", r.report_id, request)
    db.commit()
    cache.invalidate(cache.k_dashboard(user.user_id))
    job_id, queued = jobs.enqueue(job_send_report, r.report_id, data.channel, data.file_format)
    st = jobs.status(job_id)
    body = JobOut(job_id=job_id, status=st["status"], result=st.get("result"), error=st.get("error"))
    return JSONResponse(body.model_dump(), status_code=202 if queued else 200)
