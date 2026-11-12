"""Workout report generation (US-12, BR-03 to BR-05, BR-12) and set ingestion (BR-01, BR-02)."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import models as m
from ..schemas import SetIn
from . import scoring


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _f(x) -> float | None:
    return None if x is None else float(x)


def ingest_set(db: Session, session: m.WorkoutSession, data: SetIn) -> tuple[m.ExerciseSet, bool]:
    """Store one completed set. Returns (set, created). Re-sending the same set is a no-op (NFR-12)."""
    existing = db.scalar(select(m.ExerciseSet).where(
        m.ExerciseSet.session_id == session.session_id, m.ExerciseSet.set_number == data.set_number))
    if existing is not None:
        return existing, False

    rules = {r.rule_id: r for r in db.scalars(
        select(m.TechniqueRule).where(m.TechniqueRule.exercise_id == data.exercise_id))}
    s = m.ExerciseSet(session_id=session.session_id, exercise_id=data.exercise_id, set_number=data.set_number,
                      started_at=data.started_at.replace(tzinfo=None), ended_at=data.ended_at.replace(tzinfo=None))
    db.add(s)
    db.flush()

    scores: list[float] = []
    roms: list[float] = []
    valid = 0
    for r in sorted(data.reps, key=lambda x: x.rep_number):
        # one penalty per violated rule per rep (BR-02), unknown rule ids are ignored
        violated = {e.rule_id for e in r.errors if e.rule_id in rules}
        severities = [rules[rid].severity for rid in violated]
        score = scoring.rep_score(severities)
        is_valid = scoring.rep_is_valid(r.reached_depth, severities)
        rep = m.Repetition(set_id=s.set_id, rep_number=r.rep_number, duration_ms=r.duration_ms,
                           min_angle_deg=r.min_angle_deg, max_angle_deg=r.max_angle_deg,
                           is_valid=is_valid, score=Decimal(str(score)))
        db.add(rep)
        db.flush()
        for e in r.errors:
            if e.rule_id not in rules:
                continue
            db.add(m.FormErrorEvent(set_id=s.set_id, rep_id=rep.rep_id, rule_id=e.rule_id,
                                    occurred_at=e.occurred_at.replace(tzinfo=None),
                                    measured_value=e.measured_value,
                                    feedback_text=e.feedback_text or rules[e.rule_id].error_message))
        scores.append(score)
        valid += int(is_valid)
        if r.min_angle_deg is not None and r.max_angle_deg is not None:
            roms.append(r.max_angle_deg - r.min_angle_deg)

    s.total_reps = len(scores)
    s.valid_reps = valid
    sc = scoring.set_score(scores)
    s.technique_score = None if sc is None else Decimal(str(sc))
    s.avg_rom_deg = Decimal(str(round(sum(roms) / len(roms), 1))) if roms else None
    return s, True


def _previous_exercise_scores(db: Session, session: m.WorkoutSession, exercise_id: int) -> list[float]:
    """Per-session score for one exercise in the trainee's earlier sessions, newest first (BR-04)."""
    rows = db.execute(
        select(m.WorkoutSession.session_id, m.ExerciseSet.technique_score, m.ExerciseSet.total_reps)
        .join(m.ExerciseSet, m.ExerciseSet.session_id == m.WorkoutSession.session_id)
        .where(m.WorkoutSession.trainee_id == session.trainee_id,
               m.WorkoutSession.session_id != session.session_id,  # SQL Server rounds DATETIME, so < alone may match itself
               m.WorkoutSession.started_at < session.started_at,
               m.WorkoutSession.status != "InProgress",
               m.ExerciseSet.exercise_id == exercise_id)
        .order_by(m.WorkoutSession.started_at.desc())
    ).all()
    per: dict[int, list[tuple[float | None, int]]] = defaultdict(list)
    order: list[int] = []
    for sid, sc, n in rows:
        if sid not in per:
            order.append(sid)
        per[sid].append((_f(sc), n))
    out = [scoring.session_score(per[sid]) for sid in order]
    return [x for x in out if x is not None][: scoring.TREND_WINDOW]


def _previous_session_scores(db: Session, session: m.WorkoutSession) -> list[float]:
    vals = db.scalars(
        select(m.WorkoutSession.avg_technique_score)
        .where(m.WorkoutSession.trainee_id == session.trainee_id,
               m.WorkoutSession.session_id != session.session_id,
               m.WorkoutSession.started_at < session.started_at,
               m.WorkoutSession.avg_technique_score.is_not(None))
        .order_by(m.WorkoutSession.started_at.desc()).limit(scoring.TREND_WINDOW)
    ).all()
    return [float(v) for v in vals]


def build_summary(db: Session, session: m.WorkoutSession) -> dict:
    sets = db.scalars(
        select(m.ExerciseSet).where(m.ExerciseSet.session_id == session.session_id)
        .options(selectinload(m.ExerciseSet.exercise), selectinload(m.ExerciseSet.errors)
                 .selectinload(m.FormErrorEvent.rule), selectinload(m.ExerciseSet.reps))
        .order_by(m.ExerciseSet.set_number)
    ).all()
    by_ex: dict[int, list[m.ExerciseSet]] = defaultdict(list)
    for s in sets:
        by_ex[s.exercise_id].append(s)

    exercises = []
    all_errors: Counter[str] = Counter()
    for ex_id, ex_sets in by_ex.items():
        ex = ex_sets[0].exercise
        set_rows = []
        failure: dict[int, dict] = {}
        for s in ex_sets:
            for e in s.errors:
                all_errors[e.rule.error_message] += 1
            # count reps with the rule violated, not raw events
            reps_with_rule: Counter[int] = Counter()
            seen: set[tuple[int, int]] = set()
            for e in s.errors:
                if e.rep_id is not None and (e.rep_id, e.rule_id) not in seen:
                    seen.add((e.rep_id, e.rule_id))
                    reps_with_rule[e.rule_id] += 1
            fp = scoring.failure_points(s.total_reps, dict(reps_with_rule))
            for rid, pct in fp.items():
                rule = next(e.rule for e in s.errors if e.rule_id == rid)
                cur = failure.get(rid)
                if cur is None or pct > cur["pct"]:
                    failure[rid] = {"rule_id": rid, "rule_name": rule.rule_name, "message": rule.error_message,
                                    "severity": rule.severity, "pct": pct, "set_number": s.set_number}
            set_rows.append({
                "set_number": s.set_number, "total_reps": s.total_reps, "valid_reps": s.valid_reps,
                "technique_score": _f(s.technique_score), "avg_rom_deg": _f(s.avg_rom_deg),
                "reps": [{"rep_number": r.rep_number, "score": _f(r.score), "is_valid": r.is_valid,
                          "min_angle_deg": _f(r.min_angle_deg), "max_angle_deg": _f(r.max_angle_deg),
                          "duration_ms": r.duration_ms} for r in s.reps],
            })
        ex_score = scoring.session_score([(_f(s.technique_score), s.total_reps) for s in ex_sets])
        prev = _previous_exercise_scores(db, session, ex_id)
        exercises.append({
            "exercise_id": ex_id, "name": ex.name, "camera_view": ex.camera_view,
            "total_reps": sum(s.total_reps for s in ex_sets), "valid_reps": sum(s.valid_reps for s in ex_sets),
            "score": ex_score,
            "trend": {"previous": prev, "improvement_pct": scoring.improvement(ex_score, prev),
                      "enough_data": len(prev) >= scoring.TREND_WINDOW},
            "failure_points": sorted(failure.values(), key=lambda x: -x["pct"]),
            "sets": set_rows,
        })

    total = sum(s.total_reps for s in sets)
    valid = sum(s.valid_reps for s in sets)
    score = scoring.session_score([(_f(s.technique_score), s.total_reps) for s in sets])
    return {
        "session_id": session.session_id, "status": session.status,
        "started_at": session.started_at.isoformat(), "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "total_reps": total, "valid_reps": valid, "avg_score": score,
        "improvement_pct": scoring.improvement(score, _previous_session_scores(db, session)),
        "top_errors": [{"message": msg, "count": c} for msg, c in all_errors.most_common(2)],  # US-07
        "exercises": exercises,
    }


def generate_report(db: Session, session_id: int) -> int | None:
    """Create or refresh the Draft report for a finished session. Returns report_id, or None (BR-12)."""
    session = db.get(m.WorkoutSession, session_id)
    if session is None:
        return None
    completed_sets = sum(1 for s in session.sets if s.total_reps > 0)
    if not scoring.should_generate_report(session.status, completed_sets):
        return None
    summary = build_summary(db, session)
    session.avg_technique_score = None if summary["avg_score"] is None else Decimal(str(summary["avg_score"]))
    rep = session.report
    if rep is None:
        rep = m.Report(session_id=session.session_id, generated_at=_now(), total_reps=0, valid_reps=0,
                       summary_json="{}", status="Draft")
        db.add(rep)
    elif rep.status == "Sent":  # BR-10: a sent report is frozen
        return rep.report_id
    rep.generated_at = _now()
    rep.total_reps = summary["total_reps"]
    rep.valid_reps = summary["valid_reps"]
    rep.avg_score = None if summary["avg_score"] is None else Decimal(str(summary["avg_score"]))
    rep.improvement_pct = None if summary["improvement_pct"] is None else Decimal(str(summary["improvement_pct"]))
    rep.summary_json = json.dumps(summary, ensure_ascii=False)
    db.commit()
    return rep.report_id
