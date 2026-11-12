"""Permission matrix (table 4.5), BR-09 and the audit of denied access (TC-08)."""
from datetime import timedelta

from conftest import now, rep
from sqlalchemy import select

from app.models import AuditLog


def test_role_matrix(api, client):
    tt, rt, ids = api.pair()
    admin = api.admin_token()
    h = api.h
    assert client.get("/api/dashboard", headers=h(tt)).status_code == 403  # trainee: no dashboard
    assert client.get("/api/admin/users", headers=h(rt)).status_code == 403  # trainer: no user admin
    assert client.get("/api/admin/audit-log", headers=h(tt)).status_code == 403
    assert client.get("/api/dashboard", headers=h(admin)).status_code == 403  # admin: no performance data
    assert client.get(f"/api/sessions?trainee_id={ids['trainee_id']}", headers=h(admin)).status_code == 403
    ex = api.exercises(admin)[0]
    rule = {"rule_name": "x", "joint": "y", "landmark_a": 1, "landmark_b": 2, "landmark_c": 3, "max_angle": 90,
            "severity": "Low", "error_message": "z"}
    assert client.post(f"/api/exercises/{ex['exercise_id']}/rules", json=rule, headers=h(rt)).status_code == 403
    assert client.post("/api/sessions", json={"started_at": now().isoformat()}, headers=h(rt)).status_code == 403


def test_unassigned_trainer_gets_403_and_is_logged_tc08(api, client, db):
    tt, rt, ids = api.pair()
    other = api.register("other@test.io", role="Trainer")["access_token"]
    ex = api.exercises(tt)[0]
    res = api.workout(tt, ex, [rep(1), rep(2)])
    rid = res["report_id"]
    assert client.get(f"/api/reports/{rid}", headers=api.h(rt)).status_code == 200
    assert client.get(f"/api/reports/{rid}", headers=api.h(other)).status_code == 403
    denied = db.scalars(select(AuditLog).where(AuditLog.action == "access_denied")).all()
    assert denied, "the refused request must be in the audit log"


def test_trainer_sees_only_sessions_since_assignment_br09(api, client):
    te = api.register("t2@test.io")
    tt = te["access_token"]
    ex = api.exercises(tt)[0]
    old = api.workout(tt, ex, [rep(1)], started=now() - timedelta(days=3))
    rt = api.register("r2@test.io", role="Trainer")["access_token"]
    code = client.get("/api/me", headers=api.h(rt)).json()["trainer"]["invite_code"]
    a = client.post("/api/assignments", json={"invite_code": code}, headers=api.h(tt)).json()
    client.patch(f"/api/assignments/{a['assignment_id']}", json={"action": "approve"}, headers=api.h(rt))
    new = api.workout(tt, ex, [rep(1)])
    lst = client.get(f"/api/sessions?trainee_id={te['user']['user_id']}", headers=api.h(rt)).json()
    assert [s["session_id"] for s in lst] == [new["session"]["session_id"]]
    assert client.get(f"/api/reports/{old['report_id']}", headers=api.h(rt)).status_code == 403
    # ending the assignment closes access immediately
    client.patch(f"/api/assignments/{a['assignment_id']}", json={"action": "end"}, headers=api.h(tt))
    assert client.get(f"/api/reports/{new['report_id']}", headers=api.h(rt)).status_code == 403


def test_one_active_assignment_br09_and_invite_lock_tc07(api, client):
    tt, rt, ids = api.pair()
    rt2 = api.register("r3@test.io", role="Trainer")["access_token"]
    code2 = client.get("/api/me", headers=api.h(rt2)).json()["trainer"]["invite_code"]
    assert client.post("/api/assignments", json={"invite_code": code2}, headers=api.h(tt)).status_code == 409
    lone = api.register("lone@test.io")["access_token"]
    for _ in range(5):
        assert client.post("/api/assignments", json={"invite_code": "WRONG123"}, headers=api.h(lone)).status_code == 404
    assert client.post("/api/assignments", json={"invite_code": code2}, headers=api.h(lone)).status_code == 429
