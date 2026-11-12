"""End-to-end API flow: UC-1 (workout), UC-2 (report), UC-3 (assignment) and TC-01 to TC-06."""
from datetime import timedelta

from conftest import iso, now, rep


def _squat(api, tok):
    return next(e for e in api.exercises(tok) if e["name"] == "סקוואט")


def test_consent_required_before_camera_nfr08(api, client):
    tok = api.register("nc@test.io")["access_token"]
    r = client.post("/api/sessions", json={"started_at": iso(now())}, headers=api.h(tok))
    assert r.status_code == 409
    assert client.post("/api/me/consent", headers=api.h(tok)).json()["consent_at"]
    assert client.post("/api/sessions", json={"started_at": iso(now())}, headers=api.h(tok)).status_code == 201


def test_workout_scores_and_report_tc01_tc05(api, client):
    tt, rt, ids = api.pair()
    sq = _squat(api, tt)
    depth_rule = next(r for r in sq["rules"] if r["rule_name"] == "עומק סקוואט")  # Med
    valgus = next(r for r in sq["rules"] if r["severity"] == "High")
    reps = [rep(i) for i in range(1, 9)]  # 8 clean reps
    reps.append(rep(9, depth=False, errors=[(depth_rule["rule_id"], 118)]))  # partial: counted, invalid, 85
    reps.append(rep(10, errors=[(valgus["rule_id"], 150), (depth_rule["rule_id"], 105)]))  # 100-30-15 = 55, invalid
    out = api.workout(tt, sq, reps)
    assert out["report_id"] is not None
    rep_json = client.get(f"/api/reports/{out['report_id']}", headers=api.h(rt)).json()
    assert rep_json["total_reps"] == 10
    assert rep_json["valid_reps"] == 8
    assert rep_json["avg_score"] == round((8 * 100 + 85 + 55) / 10, 2)  # BR-03
    ex = rep_json["summary"]["exercises"][0]
    fps = {f["rule_id"]: f["pct"] for f in ex["failure_points"]}
    assert fps == {depth_rule["rule_id"]: 20.0}  # 2 of 10 reps; valgus at 10% is below BR-05
    assert ex["trend"]["enough_data"] is False  # BR-04: fewer than 3 previous sessions
    assert len(rep_json["summary"]["top_errors"]) <= 2  # US-07


def test_offline_replay_is_idempotent_tc03_nfr12(api, client):
    tt, _, _ = api.pair()
    sq = _squat(api, tt)
    client.post("/api/me/consent", headers=api.h(tt))
    sid = client.post("/api/sessions", json={"started_at": iso(now())}, headers=api.h(tt)).json()["session_id"]
    body = {"exercise_id": sq["exercise_id"], "set_number": 1, "started_at": iso(now()),
            "ended_at": iso(now() + timedelta(minutes=1)), "reps": [rep(1), rep(2), rep(3)]}
    first = client.post(f"/api/sessions/{sid}/sets", json=body, headers=api.h(tt))
    again = client.post(f"/api/sessions/{sid}/sets", json=body, headers=api.h(tt))  # replay after reconnect
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["set_id"] == again.json()["set_id"]
    s = client.get(f"/api/sessions/{sid}", headers=api.h(tt)).json()
    assert s["total_reps"] == 3


def test_aborted_session_br12_tc04(api, client):
    tt, _, _ = api.pair()
    sq = _squat(api, tt)
    client.post("/api/me/consent", headers=api.h(tt))
    sid = client.post("/api/sessions", json={"started_at": iso(now())}, headers=api.h(tt)).json()["session_id"]
    f = client.post(f"/api/sessions/{sid}/finish", json={"status": "Aborted", "ended_at": iso(now())},
                    headers=api.h(tt)).json()
    assert f["session"]["status"] == "Aborted" and f["report_id"] is None
    out = api.workout(tt, sq, [rep(1), rep(2)], status="Aborted")
    assert out["report_id"] is not None  # at least one completed set


def test_report_lifecycle_br10_tc06(api, client):
    tt, rt, ids = api.pair()
    out = api.workout(tt, _squat(api, tt), [rep(1), rep(2)])
    rid = out["report_id"]
    n = client.post(f"/api/reports/{rid}/notes", json={"note_text": "עבודה טובה, להעמיק בסט השני"}, headers=api.h(rt))
    assert n.status_code == 201
    assert client.get(f"/api/reports/{rid}", headers=api.h(rt)).json()["status"] == "Reviewed"
    for fmt in ("pdf", "xlsx", "json"):
        job = client.post(f"/api/reports/{rid}/export/{fmt}", headers=api.h(rt))
        assert job.status_code == 200 and job.json()["status"] == "finished", job.text
        f = client.get(f"/api/reports/{rid}/files/{fmt}", headers=api.h(rt))
        assert f.status_code == 200 and len(f.content) > 20
    s = client.post(f"/api/reports/{rid}/send", json={"channel": "InApp", "file_format": "PDF"}, headers=api.h(rt))
    assert s.status_code == 200
    assert client.get(f"/api/reports/{rid}", headers=api.h(rt)).json()["status"] == "Sent"
    mine = client.get("/api/me/reports", headers=api.h(tt)).json()
    assert mine[0]["sent_at"] is not None and mine[0]["opened_at"] is None
    assert mine[0]["exercises"] == ["סקוואט"]  # the list says which workout it was
    client.get(f"/api/reports/{rid}", headers=api.h(tt))  # trainee opens it
    assert client.get("/api/me/reports", headers=api.h(tt)).json()[0]["opened_at"] is not None


def test_xlsx_is_right_to_left(api, client, tmp_path):
    from openpyxl import load_workbook

    tt, rt, _ = api.pair()
    rid = api.workout(tt, _squat(api, tt), [rep(1)])["report_id"]
    client.post(f"/api/reports/{rid}/export/xlsx", headers=api.h(rt))
    data = client.get(f"/api/reports/{rid}/files/xlsx", headers=api.h(rt)).content
    p = tmp_path / "r.xlsx"
    p.write_bytes(data)
    wb = load_workbook(p)
    assert all(ws.sheet_view.rightToLeft for ws in wb.worksheets)
    assert wb["סיכום"]["A1"].value == "דוח סיכום אימון"


def test_trend_after_three_sessions_br04(api, client):
    tt, rt, _ = api.pair()
    sq = _squat(api, tt)
    rule = sq["rules"][0]
    for d in (4, 3, 2):  # three earlier sessions with score 85
        api.workout(tt, sq, [rep(1, errors=[(rule["rule_id"], 110)])], started=now() - timedelta(days=d))
    out = api.workout(tt, sq, [rep(1)])  # 100 now
    ex = client.get(f"/api/reports/{out['report_id']}", headers=api.h(rt)).json()["summary"]["exercises"][0]
    assert ex["trend"]["enough_data"] is True
    assert ex["trend"]["improvement_pct"] == round(100 * (100 - 85) / 85, 2)


def test_plan_visible_to_trainee_immediately_us11(api, client):
    tt, rt, ids = api.pair()
    exs = api.exercises(rt)
    body = {"trainee_id": ids["trainee_id"], "name": "תוכנית א", "start_date": now().date().isoformat(),
            "exercises": [{"exercise_id": e["exercise_id"], "target_sets": 3, "target_reps": 10} for e in exs[:2]],
            "goals": [{"goal_type": "ציון ממוצע", "target_value": 85}]}
    r = client.post("/api/plans", json=body, headers=api.h(rt))
    assert r.status_code == 201, r.text
    active = client.get("/api/plans/active", headers=api.h(tt)).json()
    assert active["name"] == "תוכנית א" and len(active["exercises"]) == 2
    assert active["exercises"][0]["exercise"]["rules"], "rules ship with the plan for the on-device engine"
    stranger = api.register("st@test.io")
    body["trainee_id"] = stranger["user"]["user_id"]
    assert client.post("/api/plans", json=body, headers=api.h(rt)).status_code == 403


def test_stale_sessions_are_closed(api, client):
    """Workouts left open (app closed mid-workout) are closed by the hourly job: empty ones removed, others Aborted."""
    from app import models as m
    from app.db import SessionLocal
    from app.tasks import job_close_stale_sessions

    tt, _rt, _ids = api.pair()
    old = iso(now() - timedelta(days=1))
    client.post("/api/me/consent", headers=api.h(tt))
    empty = client.post("/api/sessions", json={"started_at": old}, headers=api.h(tt)).json()["session_id"]
    with_set = client.post("/api/sessions", json={"started_at": old}, headers=api.h(tt)).json()["session_id"]
    sq = _squat(api, tt)
    r = client.post(f"/api/sessions/{with_set}/sets", headers=api.h(tt), json={
        "exercise_id": sq["exercise_id"], "set_number": 1, "started_at": old, "ended_at": old, "reps": [rep(1), rep(2)]})
    assert r.status_code in (200, 201)
    assert job_close_stale_sessions() == {"closed": 1, "deleted": 1}
    with SessionLocal() as db:
        assert db.get(m.WorkoutSession, empty) is None
        s = db.get(m.WorkoutSession, with_set)
        assert s.status == "Aborted" and s.report is not None


def test_trainee_exports_own_report_and_history(api, client):
    tt, _rt, _ids = api.pair()
    out = api.workout(tt, _squat(api, tt), [rep(1), rep(2)])
    job = client.post(f"/api/reports/{out['report_id']}/export/xlsx", headers=api.h(tt))
    assert job.status_code in (200, 202), job.text
    h = client.get("/api/me/sessions/export.xlsx", headers=api.h(tt))
    assert h.status_code == 200 and h.content[:2] == b"PK"  # an .xlsx is a zip file
    other = api.register("someone@test.io")["access_token"]
    assert client.post(f"/api/reports/{out['report_id']}/export/pdf", headers=api.h(other)).status_code in (403, 404)
