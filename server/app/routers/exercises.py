from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import cache
from .. import models as m
from ..audit import audit
from ..db import get_db
from ..schemas import ExerciseIn, ExerciseOut, RuleIn, RuleOut
from ..security import current_user, require_role

router = APIRouter(tags=["exercises"])
RULES_TTL = 24 * 3600


def _exercise_payload(ex: m.Exercise) -> dict:
    return ExerciseOut.model_validate(ex).model_dump()


def exercise_cached(db: Session, exercise_id: int) -> dict | None:
    """TechniqueRules change rarely, so exercises with their rules are cached until an admin edits them."""
    hit = cache.get_json(cache.k_rules(exercise_id))
    if hit is not None:
        return hit
    ex = db.scalar(select(m.Exercise).where(m.Exercise.exercise_id == exercise_id).options(selectinload(m.Exercise.rules)))
    if ex is None:
        return None
    data = _exercise_payload(ex)
    cache.set_json(cache.k_rules(exercise_id), data, RULES_TTL)
    return data


@router.get("/exercises", response_model=list[ExerciseOut])
def list_exercises(include_inactive: bool = False, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.Exercise).options(selectinload(m.Exercise.rules)).order_by(m.Exercise.exercise_id)
    if not (include_inactive and user.role == "Admin"):
        q = q.where(m.Exercise.is_active.is_(True))
    return [_exercise_payload(e) for e in db.scalars(q)]


@router.get("/exercises/{exercise_id}", response_model=ExerciseOut)
def get_exercise(exercise_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    data = exercise_cached(db, exercise_id)
    if data is None:
        raise HTTPException(404, "התרגיל לא נמצא")
    return data


@router.post("/exercises", response_model=ExerciseOut, status_code=201)
def create_exercise(data: ExerciseIn, request: Request, user: m.User = Depends(require_role("Admin")),
                    db: Session = Depends(get_db)):
    ex = m.Exercise(created_by=user.user_id, **data.model_dump())
    db.add(ex)
    db.flush()
    audit(db, user.user_id, "exercise_create", "Exercises", ex.exercise_id, request)
    db.commit()
    db.refresh(ex)
    return _exercise_payload(ex)


@router.put("/exercises/{exercise_id}", response_model=ExerciseOut)
def update_exercise(exercise_id: int, data: ExerciseIn, request: Request,
                    user: m.User = Depends(require_role("Admin")), db: Session = Depends(get_db)):
    ex = db.get(m.Exercise, exercise_id)
    if ex is None:
        raise HTTPException(404, "התרגיל לא נמצא")
    for k, v in data.model_dump().items():
        setattr(ex, k, v)
    audit(db, user.user_id, "exercise_update", "Exercises", ex.exercise_id, request)
    db.commit()
    cache.invalidate(cache.k_rules(exercise_id))
    db.refresh(ex)
    return _exercise_payload(ex)


@router.post("/exercises/{exercise_id}/rules", response_model=RuleOut, status_code=201)
def create_rule(exercise_id: int, data: RuleIn, request: Request, user: m.User = Depends(require_role("Admin")),
                db: Session = Depends(get_db)):
    if db.get(m.Exercise, exercise_id) is None:
        raise HTTPException(404, "התרגיל לא נמצא")
    r = m.TechniqueRule(exercise_id=exercise_id, **data.model_dump())
    db.add(r)
    db.flush()
    audit(db, user.user_id, "rule_create", "TechniqueRules", r.rule_id, request)
    db.commit()
    cache.invalidate(cache.k_rules(exercise_id))  # NFR-13: active from the next workout, no code change
    return r


@router.put("/rules/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, data: RuleIn, request: Request, user: m.User = Depends(require_role("Admin")),
                db: Session = Depends(get_db)):
    r = db.get(m.TechniqueRule, rule_id)
    if r is None:
        raise HTTPException(404, "הכלל לא נמצא")
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    audit(db, user.user_id, "rule_update", "TechniqueRules", r.rule_id, request)
    db.commit()
    cache.invalidate(cache.k_rules(r.exercise_id))
    return r


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, request: Request, user: m.User = Depends(require_role("Admin")),
                db: Session = Depends(get_db)):
    r = db.get(m.TechniqueRule, rule_id)
    if r is None:
        raise HTTPException(404, "הכלל לא נמצא")
    used = db.scalar(select(m.FormErrorEvent.event_id).where(m.FormErrorEvent.rule_id == rule_id).limit(1))
    if used is not None:
        raise HTTPException(409, "הכלל כבר מופיע באימונים שנשמרו. עדכנו אותו במקום למחוק")
    ex_id = r.exercise_id
    db.delete(r)
    audit(db, user.user_id, "rule_delete", "TechniqueRules", rule_id, request)
    db.commit()
    cache.invalidate(cache.k_rules(ex_id))
