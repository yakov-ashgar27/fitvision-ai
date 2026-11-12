"""Dashboard (US-10), alerts (US-16, TC-09), trends (US-17), admin (US-18 to US-20, TC-10)."""
from datetime import timedelta

from conftest import now, rep


def test_dashboard_one_request_and_cache(api, client):
    tt, rt, ids = api.pair()
    sq = api.exercises(tt)[0]
    api.workout(tt, sq, [rep(1), rep(2)])
    d1 = client.get("/api/dashboard", headers=api.h(rt)).json()
    assert set(d1) >= {"kpis", "trainees", "alerts", "requests"}
    assert d1["kpis"]["active_trainees"] == 1 and d1["kpis"]["reports_to_review"] == 1
    assert d1["trainees"][0]["name"]
    assert d1["cached"] is False
    assert client.get("/api/dashboard", headers=api.h(rt)).json()["cached"] is True


def test_alerts_tc09(api, client, db):
    from app.models import TrainerTraineeAssignment
    from app.services.alerts import compute_for_trainer

    tt, rt, ids = api.pair()
    a = db.get(TrainerTraineeAssignment, ids["assignment_id"])
    a.start_date = now() - timedelta(days=30)  # assignment that started a month ago
    db.commit()
    sq = api.exercises(tt)[0]
    rule = sq["rules"][0]
    plan = {"trainee_id": ids["trainee_id"], "name": "p", "start_date": (now() - timedelta(days=30)).date().isoformat(),
            "exercises": [{"exercise_id": sq["exercise_id"], "target_sets": 3, "target_reps": 10}]}
    assert client.post("/api/plans", json=plan, headers=api.h(rt)).status_code == 201
    # same failure point in 3 consecutive sessions, 6+ days ago, and a weekly drop
    for d in (13, 12, 6):
        bad = [rep(i, errors=[(rule["rule_id"], 110)]) for i in range(1, 6)]
        mixed = [rep(1), rep(2), rep(3)] + [rep(i, errors=[(rule["rule_id"], 110)]) for i in (4, 5)]
        api.workout(tt, sq, bad if d == 6 else mixed, started=now() - timedelta(days=d))
    alerts = compute_for_trainer(db, ids["trainer_id"])
    kinds = {a["kind"] for a in alerts}
    assert {"repeat_error", "score_drop", "inactivity"} <= kinds
    assert [a["severity"] for a in alerts] == sorted([a["severity"] for a in alerts], key=["High", "Med", "Low"].index)


def test_trends_us17(api, client):
    tt, rt, ids = api.pair()
    sq = api.exercises(tt)[0]
    api.workout(tt, sq, [rep(1), rep(2)])
    tr = client.get(f"/api/trainees/{ids['trainee_id']}/trends?weeks=4", headers=api.h(rt)).json()
    assert tr["exercises"][0]["points"][0]["score"] == 100
    assert client.get("/api/me/trends?weeks=12", headers=api.h(tt)).status_code == 200


def test_rule_change_applies_without_code_change_nfr13_tc10(api, client):
    admin = api.admin_token()
    tt = api.register("x@test.io")["access_token"]
    ex = api.exercises(tt)[0]
    before = client.get(f"/api/exercises/{ex['exercise_id']}", headers=api.h(tt)).json()  # now cached
    rule = before["rules"][0]
    body = {k: rule[k] for k in ("rule_name", "joint", "landmark_a", "landmark_b", "landmark_c", "phase",
                                 "min_angle", "severity", "error_message")}
    body["max_angle"] = 95
    assert client.put(f"/api/rules/{rule['rule_id']}", json=body, headers=api.h(admin)).status_code == 200
    after = client.get(f"/api/exercises/{ex['exercise_id']}", headers=api.h(tt)).json()
    assert next(r for r in after["rules"] if r["rule_id"] == rule["rule_id"])["max_angle"] == 95
    bad = dict(body, min_angle=120, max_angle=90)
    assert client.put(f"/api/rules/{rule['rule_id']}", json=bad, headers=api.h(admin)).status_code == 422


def test_admin_users_and_audit_log_us18_us20(api, client):
    admin = api.admin_token()
    u = api.register("y@test.io")["user"]
    r = client.patch(f"/api/admin/users/{u['user_id']}", json={"role": "Trainer"}, headers=api.h(admin))
    assert r.status_code == 200 and r.json()["role"] == "Trainer"
    log = client.get("/api/admin/audit-log?action=role_change", headers=api.h(admin)).json()
    assert log and log[0]["entity_id"] == u["user_id"]
    me = client.get("/api/me", headers=api.h(admin)).json()["user"]["user_id"]
    assert client.patch(f"/api/admin/users/{me}", json={"is_active": False}, headers=api.h(admin)).status_code == 409


def test_delete_account_nfr08(api, client):
    tt, rt, ids = api.pair()
    api.workout(tt, api.exercises(tt)[0], [rep(1)])
    r = client.delete("/api/me", headers=api.h(tt))
    assert r.status_code == 202
    assert client.post("/api/auth/login", json={"email": "dana@test.io", "password": "Passw0rd!"}).status_code == 401
    d = client.get("/api/dashboard", headers=api.h(rt)).json()
    assert d["kpis"]["active_trainees"] == 0


def test_rum_and_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.post("/api/metrics/rum", json=[{"name": "LCP", "value": 1800, "page": "/"}]).status_code == 204


def test_seventeen_tables_with_indexes(db):
    from sqlalchemy import inspect, text

    from app import models as m
    from app.db import engine
    from app.models import ALL_TABLES

    insp = inspect(engine)
    assert set(ALL_TABLES) <= set(insp.get_table_names())
    declared = {i.name for i in m.WorkoutSession.__table__.indexes}
    assert "IX_Sessions_trainee_started" in declared
    if engine.dialect.name == "sqlite":
        with engine.connect() as c:
            idx = set(c.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='WorkoutSessions'"))
                      .scalars())
    else:
        idx = {i["name"] for i in insp.get_indexes("WorkoutSessions")}
    assert "IX_Sessions_trainee_started" in idx, (idx, engine.url.render_as_string(hide_password=True))
    try:
        uq = insp.get_unique_constraints("ExerciseSets")
    except NotImplementedError:  # SQL Server reflects unique constraints as unique indexes
        uq = []
    uq += [i for i in insp.get_indexes("ExerciseSets") if i.get("unique")]
    assert any(set(u["column_names"]) == {"session_id", "set_number"} for u in uq), uq


def test_demo_seed_runs(db):
    from app.seed import seed_demo

    seed_demo(db)
    seed_demo(db)  # idempotent
