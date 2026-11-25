"""HTTP contracts for school-managed identities and role-scoped sessions."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ila import server
from ila.auth import hash_password
from ila.storage import Storage


@pytest.fixture()
def school(tmp_path: Path,monkeypatch):
    store = Storage(tmp_path / "school.db")
    monkeypatch.setattr(server,"_STORE",store)
    store.create_user(full_name="School Administrator",role="admin",student_identifier="office",
                      password_hash=hash_password("office-password"))
    with TestClient(server.app) as client:
        yield client


def login(client, role="admin", identifier="office", password="office-password"):
    return client.post("/api/auth/login",json={"role_hint":role,"identifier":identifier,"password":password})


def record(role="student"):
    return {"role":role,"full_name":"School Member","identifier":"member","class_level":10,"section":"A",
            "subject":"maths","password":"initial-password"}


def test_public_registration_and_reset_are_closed(school):
    for path in ("register","forgot-password","bootstrap-teacher","teacher/register","teacher/create"):
        assert school.post("/api/auth/"+path,json={}).status_code == 404
    assert school.get("/api/admin/school").status_code == 401


def test_managed_account_and_roles(school):
    login(school).raise_for_status()
    school.post("/api/admin/accounts",json=record()).raise_for_status()
    assert school.post("/api/admin/accounts",json=record()).status_code == 409
    assert login(school,"teacher","member","initial-password").status_code == 401
    response = login(school,"student","member","initial-password")
    response.raise_for_status()
    assert response.json()["user"]["full_name"] == "School Member"
    assert school.get("/api/auth/me").json()["user"]["section"] == "A"
    assert school.get("/api/admin/school").status_code == 403
    assert school.get("/api/teacher/overview").status_code == 403
    assert school.get("/api/student/progress").status_code == 200
    assert school.get("/api/students/member/gaps").status_code == 200
    assert school.get("/api/students/other/gaps").status_code == 403


def test_password_reset_and_deactivation_revoke_sessions(school):
    login(school).raise_for_status()
    account = record("teacher")
    key = school.post("/api/admin/accounts",json=account).json()["id"]
    token = login(school,"teacher","member","initial-password").json()["token"]
    login(school).raise_for_status()
    account["password"]="changed-password"
    school.put(f"/api/admin/accounts/{key}",json=account).raise_for_status()
    assert school.get("/api/auth/me",headers={"Authorization":"Bearer "+token}).status_code == 401
    assert login(school,"teacher","member","initial-password").status_code == 401
    login(school,"teacher","member","changed-password").raise_for_status()
    login(school).raise_for_status()
    account.update(password=None,active=False)
    school.put(f"/api/admin/accounts/{key}",json=account).raise_for_status()
    assert login(school,"teacher","member","changed-password").status_code == 403
