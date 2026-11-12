"""Trainer alerts BR-06 to BR-08 (US-16), computed from the database and cached in Redis."""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import cache
from .. import models as m
from . import scoring

ALERT_TTL = 3600


def _today() -> date:
    return datetime.now(UTC).date()


def compute_for_trainer(db: Session, trainer_id: int, today: date | None = None) -> list[dict]:
    today = today or _today()
    assigns = db.scalars(select(m.TrainerTraineeAssignment).where(
        m.TrainerTraineeAssignment.trainer_id == trainer_id, m.TrainerTraineeAssignment.status == "Active")).all()
    alerts: list[scoring.Alert] = []
    for a in assigns:
        tid = a.trainee_id
        name = a.trainee.full_name
        since = a.start_date or datetime.min
        sessions = db.scalars(
            select(m.WorkoutSession).where(m.WorkoutSession.trainee_id == tid, m.WorkoutSession.started_at >= since,
                                           m.WorkoutSession.status != "InProgress")
            .order_by(m.WorkoutSession.started_at.desc()).limit(30)).all()

        # BR-06: same failure point in the last 3 sessions
        failure_sets: list[set[int]] = []
        rule_names: dict[int, str] = {}
        for s in sessions[: scoring.REPEAT_ERROR_SESSIONS]:
            rep = s.report
            rules: set[int] = set()
            if rep is not None:
                summary = json.loads(rep.summary_json)
                for ex in summary.get("exercises", []):
                    for f in ex.get("failure_points", []):
                        rules.add(f["rule_id"])
                        rule_names[f["rule_id"]] = f["message"]
            failure_sets.append(rules)
        for rid in sorted(scoring.repeat_error_rules(failure_sets)):
            alerts.append(scoring.Alert("repeat_error", tid, "High",
                                        f"{name}: אותה שגיאה ב-3 אימונים רצופים – {rule_names.get(rid, '')}",
                                        {"rule_id": rid, "trainee_name": name}))

        # BR-07: weekly score drop
        scores = [(s.started_at, float(s.avg_technique_score)) for s in sessions if s.avg_technique_score is not None]
        drop = scoring.weekly_drop(scores, today)
        if drop is not None:
            alerts.append(scoring.Alert("score_drop", tid, "Med", f"{name}: ציון הטכניקה השבועי ירד ב-{drop}%",
                                        {"drop_pct": drop, "trainee_name": name}))

        # BR-08: inactivity with an active plan
        has_plan = db.scalar(select(m.WorkoutPlan.plan_id).where(
            m.WorkoutPlan.trainee_id == tid, m.WorkoutPlan.trainer_id == trainer_id,
            (m.WorkoutPlan.end_date.is_(None)) | (m.WorkoutPlan.end_date >= today)).limit(1)) is not None
        last = sessions[0].started_at if sessions else None
        days = scoring.inactive_days(last, has_plan, today)
        if days is not None:
            alerts.append(scoring.Alert("inactivity", tid, "Low", f"{name}: לא התאמן {days} ימים",
                                        {"days": days, "trainee_name": name}))
    order = {"High": 0, "Med": 1, "Low": 2}
    return [a.as_dict() for a in sorted(alerts, key=lambda a: order[a.severity])]


def get_for_trainer(db: Session, trainer_id: int) -> list[dict]:
    hit = cache.get_json(cache.k_alerts(trainer_id))
    if hit is not None:
        return hit
    out = compute_for_trainer(db, trainer_id)
    cache.set_json(cache.k_alerts(trainer_id), out, ALERT_TTL)
    return out


def refresh_all(db: Session) -> int:
    trainers = db.scalars(select(m.User.user_id).where(m.User.role == "Trainer", m.User.is_active.is_(True))).all()
    for tid in trainers:
        cache.set_json(cache.k_alerts(tid), compute_for_trainer(db, tid), ALERT_TTL)
    return len(trainers)


def group_by_trainee(alerts: list[dict]) -> dict[int, int]:
    out: dict[int, int] = defaultdict(int)
    for a in alerts:
        out[a["trainee_id"]] += 1
    return out
