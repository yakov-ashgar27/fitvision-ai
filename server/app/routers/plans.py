from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import cache
from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import PlanIn, PlanOut
from ..security import active_assignment, assert_can_view_trainee, current_user, require_role

router = APIRouter(tags=["plans"])


def _load(db: Session, plan_id: int) -> m.WorkoutPlan | None:
    return db.scalar(select(m.WorkoutPlan).where(m.WorkoutPlan.plan_id == plan_id).options(
        selectinload(m.WorkoutPlan.exercises).selectinload(m.PlanExercise.exercise).selectinload(m.Exercise.rules)))


def _out(db: Session, p: m.WorkoutPlan) -> dict:
    out = PlanOut.model_validate(p).model_dump()
    out["goals"] = [{"goal_id": g.goal_id, "goal_type": g.goal_type,
                     "target_value": float(g.target_value) if g.target_value is not None else None,
                     "target_date": g.target_date, "status": g.status}
                    for g in db.scalars(select(m.Goal).where(m.Goal.trainee_id == p.trainee_id, m.Goal.status == "Active"))]
    return out


def _apply(db: Session, plan: m.WorkoutPlan, data: PlanIn, trainer: m.User) -> None:
    ex_ids = {e.exercise_id for e in data.exercises}
    found = set(db.scalars(select(m.Exercise.exercise_id).where(m.Exercise.exercise_id.in_(ex_ids),
                                                                 m.Exercise.is_active.is_(True))))
    if found != ex_ids:
        raise HTTPException(422, "תרגיל לא קיים או לא פעיל")
    plan.name, plan.start_date, plan.end_date, plan.notes = data.name, data.start_date, data.end_date, data.notes
    plan.exercises.clear()
    db.flush()
    for i, e in enumerate(data.exercises):
        plan.exercises.append(m.PlanExercise(exercise_id=e.exercise_id, order_index=i, target_sets=e.target_sets,
                                             target_reps=e.target_reps, rest_seconds=e.rest_seconds))
    for g in data.goals:
        db.add(m.Goal(trainee_id=plan.trainee_id, set_by_id=trainer.user_id, goal_type=g.goal_type,
                      target_value=g.target_value, target_date=g.target_date, status="Active"))


@router.post("/plans", status_code=201)
def create_plan(data: PlanIn, request: Request, user: m.User = Depends(require_role("Trainer")),
                db: Session = Depends(get_db)):
    if active_assignment(db, user.user_id, data.trainee_id) is None:
        audit(db, user.user_id, "access_denied", "WorkoutPlans", None, request)
        db.commit()
        raise HTTPException(403, "ניתן לבנות תוכנית רק למתאמן משויך")
    # a new plan replaces the previous open one
    for old in db.scalars(select(m.WorkoutPlan).where(m.WorkoutPlan.trainee_id == data.trainee_id,
                                                       m.WorkoutPlan.end_date.is_(None))):
        old.end_date = max(old.start_date, data.start_date)
    plan = m.WorkoutPlan(trainer_id=user.user_id, trainee_id=data.trainee_id, name=data.name,
                         start_date=data.start_date)
    db.add(plan)
    _apply(db, plan, data, user)
    db.flush()
    audit(db, user.user_id, "plan_create", "WorkoutPlans", plan.plan_id, request)
    db.commit()
    cache.invalidate(cache.k_dashboard(user.user_id), cache.k_alerts(user.user_id))
    return _out(db, _load(db, plan.plan_id))


@router.put("/plans/{plan_id}")
def update_plan(plan_id: int, data: PlanIn, request: Request, user: m.User = Depends(require_role("Trainer")),
                db: Session = Depends(get_db)):
    plan = _load(db, plan_id)
    if plan is None or plan.trainer_id != user.user_id or active_assignment(db, user.user_id, plan.trainee_id) is None:
        raise HTTPException(403, "אין הרשאה לתוכנית זו")
    _apply(db, plan, data, user)
    audit(db, user.user_id, "plan_update", "WorkoutPlans", plan.plan_id, request)
    db.commit()
    return _out(db, _load(db, plan.plan_id))


@router.get("/plans/active")
def active_plan(user: m.User = Depends(require_role("Trainee")), db: Session = Depends(get_db)):
    today = datetime.now(UTC).date()
    p = db.scalar(select(m.WorkoutPlan.plan_id).where(
        m.WorkoutPlan.trainee_id == user.user_id, m.WorkoutPlan.start_date <= today,
        (m.WorkoutPlan.end_date.is_(None)) | (m.WorkoutPlan.end_date >= today)).order_by(m.WorkoutPlan.plan_id.desc()))
    return None if p is None else _out(db, _load(db, p))


@router.get("/trainees/{trainee_id}/plans")
def trainee_plans(trainee_id: int, request: Request, user: m.User = Depends(current_user),
                  db: Session = Depends(get_db)):
    assert_can_view_trainee(db, user, trainee_id, request)
    ids = db.scalars(select(m.WorkoutPlan.plan_id).where(m.WorkoutPlan.trainee_id == trainee_id)
                     .order_by(m.WorkoutPlan.plan_id.desc()).limit(20)).all()
    return [_out(db, _load(db, i)) for i in ids]
