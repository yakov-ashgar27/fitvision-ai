"""Reference data (4 MVP exercises with their TechniqueRules, table 4.6) and optional demo users.

Usage: python -m app.seed            reference data + admin from ADMIN_EMAIL / ADMIN_PASSWORD
       SEED_DEMO=1 python -m app.seed  also a demo trainer, trainee, plan and three weeks of history
"""
from __future__ import annotations

import os
import random
import secrets
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .config import settings
from .db import SessionLocal
from .schemas import ErrorIn, RepIn, SetIn
from .security import hash_password, verify_password
from .services.reports import generate_report, ingest_set

# BlazePose landmark indices (left side; the client mirrors to the right side when needed)
SH, EL, WR, HIP, KNEE, ANK, ANK_R = 11, 13, 15, 23, 25, 27, 28

EXERCISES = [
    {"name": "סקוואט", "camera_view": "Front", "muscle_group": "רגליים וישבן",
     "description": "עמידה ברוחב כתפיים, ירידה עד שהירכיים מקבילות לרצפה וחזרה לעמידה.",
     "rules": [
         ("עומק סקוואט", "ברך", (HIP, KNEE, ANK), "Bottom", None, 100, "Med", "רד עמוק יותר"),
         # valgus in the frontal plane: angle at the ankle between the knee and the other ankle (90° = knee over ankle),
         # checked in every phase of the rep
         ("ברכיים קורסות פנימה", "ברך מול קרסול", (KNEE, ANK, ANK_R), None, 80, None, "High", "דחוף את הברכיים החוצה"),
     ]},
    {"name": "לאנג'ים", "camera_view": "Side", "muscle_group": "רגליים",
     "description": "צעד גדול קדימה וירידה עד שהברך הקדמית בזווית ישרה.",
     "rules": [
         ("זווית ברך קדמית", "ברך קדמית", (HIP, KNEE, ANK), "Bottom", 80, 100, "Med", "שמור על זווית ישרה בברך הקדמית"),
     ]},
    {"name": "כפיפת מרפקים", "camera_view": "Side", "muscle_group": "יד קדמית",
     "description": "כפיפת המרפקים עם משקולות, כשהמרפקים צמודים לגוף.",
     "rules": [
         ("טווח כפיפה מלא", "מרפק", (SH, EL, WR), "Bottom", None, 75, "Low", "השלם את התנועה עד למעלה"),
         ("מרפק צמוד לגוף", "כתף", (EL, SH, HIP), None, None, 35, "Med", "הצמד את המרפק לגוף"),
     ]},
    {"name": "לחיצת כתפיים", "camera_view": "Front", "muscle_group": "כתפיים",
     "description": "לחיצת משקולות מעל הראש מגובה הכתפיים ועד יישור מלא.",
     "rules": [
         ("עומק הורדה", "כתף", (EL, SH, HIP), "Bottom", None, 100, "Med", "הורד את המשקולות עד גובה הכתפיים"),
         ("יישור מלא", "מרפק", (SH, EL, WR), "Up", 160, None, "Low", "יישר את הידיים עד הסוף"),
     ]},
]


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


DEFAULT_ADMIN_PASSWORD = "Admin1234!"


def _secure_admin_password(admin: m.User) -> None:
    """The repository is public, so the default admin password must never stay on a public deployment.

    * ADMIN_PASSWORD set: the admin account always uses it (rotate it from the hosting dashboard).
    * On Render (the RENDER variable is set) without ADMIN_PASSWORD: a default password is replaced
      with a random one, printed once to the service log, which only the owner can read.
    Local runs and tests keep the documented default.
    """
    wanted = os.getenv("ADMIN_PASSWORD")
    if wanted:
        if not verify_password(wanted, admin.password_hash):
            admin.password_hash = hash_password(wanted)
        return
    if os.getenv("RENDER") and verify_password(DEFAULT_ADMIN_PASSWORD, admin.password_hash):
        new = secrets.token_urlsafe(12)
        admin.password_hash = hash_password(new)
        print(f"[security] default admin password replaced. Admin login: {admin.email} / {new}"
              " (set ADMIN_PASSWORD in Render to choose your own)", flush=True)


def seed_reference(db: Session) -> None:
    admin = db.scalar(select(m.User).where(m.User.role == "Admin"))
    if admin is None:
        admin = m.User(email=os.getenv("ADMIN_EMAIL", "admin@fitvision.app").lower(),
                       password_hash=hash_password(os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)),
                       first_name="מנהל", last_name="מערכת", role="Admin", is_active=True, created_at=_now())
        db.add(admin)
        db.flush()
    _secure_admin_password(admin)
    if db.scalar(select(m.Exercise.exercise_id).limit(1)) is None:
        for ex in EXERCISES:
            e = m.Exercise(created_by=admin.user_id, name=ex["name"], camera_view=ex["camera_view"],
                           muscle_group=ex["muscle_group"], description=ex["description"], is_active=True)
            db.add(e)
            db.flush()
            for name, joint, (a, b, c), phase, lo, hi, sev, msg in ex["rules"]:
                db.add(m.TechniqueRule(exercise_id=e.exercise_id, rule_name=name, joint=joint, landmark_a=a,
                                       landmark_b=b, landmark_c=c, phase=phase, min_angle=lo, max_angle=hi,
                                       severity=sev, error_message=msg))
    db.commit()


def _user(db: Session, email: str, first: str, last: str, role: str, password: str) -> m.User:
    u = db.scalar(select(m.User).where(m.User.email == email))
    if u is not None:
        return u
    u = m.User(email=email, password_hash=hash_password(password), first_name=first, last_name=last, role=role,
               is_active=True, created_at=_now(), consent_at=_now() if role == "Trainee" else None)
    db.add(u)
    db.flush()
    if role == "Trainer":
        db.add(m.TrainerProfile(user_id=u.user_id, invite_code="DEMO2028", certification="מאמן כושר מוסמך"))
    else:
        db.add(m.TraineeProfile(user_id=u.user_id, height_cm=176, weight_kg=74, fitness_level="Intermediate"))
    db.flush()
    return u


def seed_demo(db: Session) -> None:
    pw = os.getenv("DEMO_PASSWORD", "Demo1234!")
    trainer = _user(db, "trainer@fitvision.app", "יוסי", "כהן", "Trainer", pw)
    trainees = [_user(db, "trainee@fitvision.app", "דנה", "לוי", "Trainee", pw),
                _user(db, "avi@fitvision.app", "אבי", "מזרחי", "Trainee", pw)]
    exercises = db.scalars(select(m.Exercise).order_by(m.Exercise.exercise_id)).all()
    rnd = random.Random(2028)
    start = _now() - timedelta(days=21)
    for t in trainees:
        if db.scalar(select(m.TrainerTraineeAssignment).where(m.TrainerTraineeAssignment.trainee_id == t.user_id)):
            continue
        db.add(m.TrainerTraineeAssignment(trainer_id=trainer.user_id, trainee_id=t.user_id, status="Active",
                                          start_date=start - timedelta(days=1)))
        plan = m.WorkoutPlan(trainer_id=trainer.user_id, trainee_id=t.user_id, name="תוכנית בסיס – 4 תרגילים",
                             start_date=date.today() - timedelta(days=22))
        for i, e in enumerate(exercises):
            plan.exercises.append(m.PlanExercise(exercise_id=e.exercise_id, order_index=i, target_sets=3,
                                                 target_reps=10, rest_seconds=60))
        db.add(plan)
        db.add(m.Goal(trainee_id=t.user_id, set_by_id=trainer.user_id, goal_type="ציון טכניקה ממוצע",
                      target_value=85, target_date=date.today() + timedelta(days=60)))
        db.flush()
        # three weeks of history so the dashboard, trends and alerts have data
        decline = t.email.startswith("avi")
        for day in range(0, 21, 2):
            when = start + timedelta(days=day, hours=18)
            s = m.WorkoutSession(trainee_id=t.user_id, plan_id=plan.plan_id, started_at=when, status="InProgress",
                                 device_info="seed")
            db.add(s)
            db.flush()
            for set_no, ex in enumerate(exercises[:2], start=1):
                rules = ex.rules
                reps = []
                for r_no in range(1, 9):
                    errs = []
                    p_err = (0.12 + day * 0.02) if decline else max(0.35 - day * 0.015, 0.05)
                    if rnd.random() < p_err:
                        rule = rules[0]
                        errs.append(ErrorIn(rule_id=rule.rule_id, measured_value=rnd.uniform(100, 120),
                                            occurred_at=when + timedelta(seconds=r_no * 4)))
                    reps.append(RepIn(rep_number=r_no, duration_ms=2200, min_angle_deg=rnd.uniform(85, 100),
                                      max_angle_deg=rnd.uniform(165, 175), reached_depth=not errs, errors=errs))
                ingest_set(db, s, SetIn(exercise_id=ex.exercise_id, set_number=set_no,
                                        started_at=when + timedelta(minutes=set_no * 3),
                                        ended_at=when + timedelta(minutes=set_no * 3 + 1), reps=reps))
            s.status, s.ended_at = "Done", when + timedelta(minutes=12)
            db.commit()
            generate_report(db, s.session_id)
    db.commit()


def main() -> None:
    db = SessionLocal()
    try:
        seed_reference(db)
        if settings.seed_demo:
            seed_demo(db)
    finally:
        db.close()
    print("seed done")


if __name__ == "__main__":
    main()
