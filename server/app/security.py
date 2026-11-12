"""Authentication (Argon2 + JWT) and authorization (RBAC + active assignment, section 4.5)."""
from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import audit
from .config import settings
from .db import get_db
from .models import TrainerTraineeAssignment, User, WorkoutSession

_hasher = PasswordHasher()  # NFR-05: Argon2id with a random salt per hash
_bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_token(user: User) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(user.user_id), "role": user.role, "iat": now,
               "exp": now + timedelta(minutes=settings.jwt_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def new_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def utcnow() -> datetime:
    """Naive UTC timestamp, the form stored in DATETIME columns."""
    return datetime.now(UTC).replace(tzinfo=None)


def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "נדרשת התחברות")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "אסימון לא תקף או שפג תוקפו") from None
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:  # a disabled user is locked out immediately (US-18)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "המשתמש אינו פעיל")
    request.state.user_id = user.user_id
    return user


def optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> User | None:
    if creds is None:
        return None
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    return db.get(User, int(payload["sub"]))


def require_role(*roles: str):
    def dep(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
        if user.role not in roles:
            audit(db, user.user_id, "access_denied", request.url.path[:50], None, request)
            db.commit()
            raise HTTPException(status.HTTP_403_FORBIDDEN, "אין הרשאה לפעולה זו")
        return user
    return dep


def active_assignment(db: Session, trainer_id: int, trainee_id: int) -> TrainerTraineeAssignment | None:
    return db.scalar(
        select(TrainerTraineeAssignment).where(
            TrainerTraineeAssignment.trainer_id == trainer_id,
            TrainerTraineeAssignment.trainee_id == trainee_id,
            TrainerTraineeAssignment.status == "Active",
        )
    )


def assert_can_view_trainee(db: Session, user: User, trainee_id: int, request: Request) -> TrainerTraineeAssignment | None:
    """Trainee: own data only. Trainer: assigned trainees only (BR-09). Admin: no performance data (4.5)."""
    if user.role == "Trainee" and user.user_id == trainee_id:
        return None
    if user.role == "Trainer":
        a = active_assignment(db, user.user_id, trainee_id)
        if a is not None:
            return a
    audit(db, user.user_id, "access_denied", "Users", trainee_id, request)
    db.commit()
    raise HTTPException(status.HTTP_403_FORBIDDEN, "אין הרשאה לנתוני מתאמן זה")


def assert_can_view_session(db: Session, user: User, session: WorkoutSession, request: Request) -> None:
    a = assert_can_view_trainee(db, user, session.trainee_id, request)
    if a is not None and a.start_date and session.started_at < a.start_date:  # BR-09: only since assignment
        audit(db, user.user_id, "access_denied", "WorkoutSessions", session.session_id, request)
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "האימון בוצע לפני תחילת השיוך")
