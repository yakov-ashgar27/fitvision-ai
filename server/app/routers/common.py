"""Queries shared by several routers."""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..schemas import AssignmentOut, SessionOut


def assignment_out(a: m.TrainerTraineeAssignment) -> AssignmentOut:
    return AssignmentOut(assignment_id=a.assignment_id, trainer_id=a.trainer_id, trainee_id=a.trainee_id,
                         status=a.status, start_date=a.start_date, end_date=a.end_date,
                         trainer_name=a.trainer.full_name, trainee_name=a.trainee.full_name)


def session_list(db: Session, trainee_id: int, since: datetime | None, exercise_id: int | None,
                 limit: int, offset: int) -> list[SessionOut]:
    q = select(m.WorkoutSession).where(m.WorkoutSession.trainee_id == trainee_id)
    if since is not None:
        q = q.where(m.WorkoutSession.started_at >= since)
    if exercise_id is not None:
        q = q.where(m.WorkoutSession.session_id.in_(
            select(m.ExerciseSet.session_id).where(m.ExerciseSet.exercise_id == exercise_id)))
    sessions = db.scalars(q.order_by(m.WorkoutSession.started_at.desc()).limit(limit).offset(offset)).all()
    if not sessions:
        return []
    ids = [s.session_id for s in sessions]
    names: dict[int, set[str]] = defaultdict(set)
    reps: dict[int, int] = defaultdict(int)
    for sid, name, n in db.execute(
        select(m.ExerciseSet.session_id, m.Exercise.name, m.ExerciseSet.total_reps)
        .join(m.Exercise, m.Exercise.exercise_id == m.ExerciseSet.exercise_id)
        .where(m.ExerciseSet.session_id.in_(ids))
    ):
        names[sid].add(name)
        reps[sid] += n
    rep_ids = dict(db.execute(select(m.Report.session_id, m.Report.report_id).where(m.Report.session_id.in_(ids))).all())
    return [SessionOut(session_id=s.session_id, trainee_id=s.trainee_id, plan_id=s.plan_id, started_at=s.started_at,
                       ended_at=s.ended_at, status=s.status,
                       avg_technique_score=float(s.avg_technique_score) if s.avg_technique_score is not None else None,
                       report_id=rep_ids.get(s.session_id), exercises=sorted(names[s.session_id]),
                       total_reps=reps[s.session_id]) for s in sessions]


def trends(db: Session, trainee_id: int, weeks: int, since: datetime | None) -> dict:
    """US-17: weekly technique score and range of motion per exercise."""
    start = datetime.now(UTC).replace(tzinfo=None) - timedelta(weeks=weeks)
    if since is not None and since > start:
        start = since
    rows = db.execute(
        select(m.WorkoutSession.started_at, m.Exercise.exercise_id, m.Exercise.name, m.ExerciseSet.technique_score,
               m.ExerciseSet.avg_rom_deg, m.ExerciseSet.total_reps)
        .join(m.ExerciseSet, m.ExerciseSet.session_id == m.WorkoutSession.session_id)
        .join(m.Exercise, m.Exercise.exercise_id == m.ExerciseSet.exercise_id)
        .where(m.WorkoutSession.trainee_id == trainee_id, m.WorkoutSession.started_at >= start)
    ).all()
    acc: dict[int, dict] = {}
    for started, ex_id, name, score, rom, n in rows:
        wk = (started.date() - timedelta(days=started.weekday())).isoformat()
        e = acc.setdefault(ex_id, {"exercise_id": ex_id, "name": name, "weeks": defaultdict(lambda: [0.0, 0, 0.0, 0])})
        w = e["weeks"][wk]
        if score is not None and n:
            w[0] += float(score) * n
            w[1] += n
        if rom is not None:
            w[2] += float(rom)
            w[3] += 1
    out = []
    for e in acc.values():
        pts = [{"week": wk, "score": round(v[0] / v[1], 1) if v[1] else None,
                "rom": round(v[2] / v[3], 1) if v[3] else None, "reps": v[1]} for wk, v in sorted(e["weeks"].items())]
        out.append({"exercise_id": e["exercise_id"], "name": e["name"], "points": pts})
    return {"weeks": weeks, "exercises": out}
