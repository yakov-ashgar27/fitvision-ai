from __future__ import annotations

import os
import tempfile
from datetime import UTC, datetime, timedelta

_tmp = tempfile.mkdtemp(prefix="fitvision-test-")
os.environ.setdefault("DATABASE_URL", os.getenv("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db"))
os.environ.setdefault("REPORTS_DIR", f"{_tmp}/reports")
os.environ.setdefault("PDF_ENGINE", os.getenv("TEST_PDF_ENGINE", "none"))
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import cache  # noqa: E402
from app import models as m  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_reference  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    cache.client.flushall()
    db = SessionLocal()
    seed_reference(db)
    db.close()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def iso(dt: datetime) -> str:
    return dt.isoformat()


class Api:
    def __init__(self, client: TestClient):
        self.c = client

    def register(self, email: str, role: str = "Trainee", password: str = "Passw0rd!") -> dict:
        r = self.c.post("/api/auth/register", json={"email": email, "password": password, "first_name": "בדיקה",
                                                    "last_name": email.split("@")[0], "role": role})
        assert r.status_code == 201, r.text
        return r.json()

    def login(self, email: str, password: str = "Passw0rd!") -> str:
        r = self.c.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    @staticmethod
    def h(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def admin_token(self) -> str:
        return self.login("admin@fitvision.app", "Admin1234!")

    def pair(self, trainee="dana@test.io", trainer="yossi@test.io"):
        """Trainee + trainer with an Active assignment. Returns (trainee_token, trainer_token, ids)."""
        te = self.register(trainee)
        tr = self.register(trainer, role="Trainer")
        tt, rt = te["access_token"], tr["access_token"]
        code = self.c.get("/api/me", headers=self.h(rt)).json()["trainer"]["invite_code"]
        a = self.c.post("/api/assignments", json={"invite_code": code}, headers=self.h(tt))
        assert a.status_code == 201, a.text
        ap = self.c.patch(f"/api/assignments/{a.json()['assignment_id']}", json={"action": "approve"}, headers=self.h(rt))
        assert ap.status_code == 200, ap.text
        return tt, rt, {"trainee_id": te["user"]["user_id"], "trainer_id": tr["user"]["user_id"],
                        "assignment_id": a.json()["assignment_id"]}

    def exercises(self, token: str) -> list[dict]:
        return self.c.get("/api/exercises", headers=self.h(token)).json()

    def workout(self, token: str, exercise: dict, reps: list[dict], status: str = "Done",
                started: datetime | None = None, sets: int = 1) -> dict:
        started = started or now()
        self.c.post("/api/me/consent", headers=self.h(token))
        s = self.c.post("/api/sessions", json={"started_at": iso(started)}, headers=self.h(token))
        assert s.status_code == 201, s.text
        sid = s.json()["session_id"]
        for n in range(1, sets + 1):
            body = {"exercise_id": exercise["exercise_id"], "set_number": n, "started_at": iso(started),
                    "ended_at": iso(started + timedelta(minutes=1)), "reps": reps}
            r = self.c.post(f"/api/sessions/{sid}/sets", json=body, headers=self.h(token))
            assert r.status_code == 201, r.text
        f = self.c.post(f"/api/sessions/{sid}/finish",
                        json={"status": status, "ended_at": iso(started + timedelta(minutes=5))}, headers=self.h(token))
        assert f.status_code == 200, f.text
        return f.json()


def rep(n: int, depth: bool = True, errors: list[tuple[int, float]] | None = None, at: datetime | None = None) -> dict:
    at = at or now()
    return {"rep_number": n, "duration_ms": 2000, "min_angle_deg": 92.0 if depth else 118.0, "max_angle_deg": 172.0,
            "reached_depth": depth,
            "errors": [{"rule_id": rid, "measured_value": v, "occurred_at": iso(at)} for rid, v in (errors or [])]}


@pytest.fixture
def api(client) -> Api:
    return Api(client)


__all__ = ["Api", "rep", "now", "iso", "m"]
