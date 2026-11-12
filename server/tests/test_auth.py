def test_register_login_and_me(api, client):
    out = api.register("a@test.io")
    assert out["user"]["role"] == "Trainee"
    tok = api.login("a@test.io")
    me = client.get("/api/me", headers=api.h(tok)).json()
    assert me["user"]["email"] == "a@test.io" and me["trainee"] is not None


def test_register_rules_us01(client):
    weak = client.post("/api/auth/register", json={"email": "b@test.io", "password": "short", "first_name": "x",
                                                   "last_name": "y"})
    assert weak.status_code == 422
    ok = {"email": "c@test.io", "password": "Passw0rd!", "first_name": "x", "last_name": "y"}
    assert client.post("/api/auth/register", json=ok).status_code == 201
    assert client.post("/api/auth/register", json=ok).status_code == 409  # unique email


def test_password_is_argon2_nfr05(api, db):
    from sqlalchemy import select

    from app.models import User

    api.register("d@test.io")
    u = db.scalar(select(User).where(User.email == "d@test.io"))
    assert u.password_hash.startswith("$argon2")


def test_disabled_user_is_locked_immediately_us18(api, client):
    tok = api.register("e@test.io")["access_token"]
    uid = client.get("/api/me", headers=api.h(tok)).json()["user"]["user_id"]
    admin = api.admin_token()
    assert client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=api.h(admin)).status_code == 200
    assert client.get("/api/me", headers=api.h(tok)).status_code == 401  # existing token stops working
    assert client.post("/api/auth/login", json={"email": "e@test.io", "password": "Passw0rd!"}).status_code == 403


def test_no_token_is_401(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/dashboard").status_code == 401


def test_profile_ranges_us02(api, client):
    tok = api.register("f@test.io")["access_token"]
    bad = client.put("/api/me/profile", json={"trainee": {"height_cm": 20}}, headers=api.h(tok))
    assert bad.status_code == 422
    ok = client.put("/api/me/profile", json={"trainee": {"height_cm": 180, "weight_kg": 80,
                                                         "fitness_level": "Beginner"}}, headers=api.h(tok))
    assert ok.status_code == 200 and ok.json()["trainee"]["height_cm"] == 180
