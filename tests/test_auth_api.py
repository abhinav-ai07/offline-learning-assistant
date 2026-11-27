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


def test_admin_can_delete_student_and_student_owned_data(school):
    login(school).raise_for_status()
    admin_id = server._store().get_user_by_identifier_and_role("office","admin")["id"]
    assert school.delete(f"/api/admin/accounts/{admin_id}").status_code == 404
    assert server._store().get_user_by_id(admin_id) is not None
    account_id = school.post("/api/admin/accounts",json=record()).json()["id"]
    store = server._store()
    store.save_mastery("member","fractions",attempts=1,correct=1,score=1.0)
    with store._connection() as db:
        db.execute(
            """INSERT INTO quiz_sessions
               (id,student_id,class_level,subject,topic,created_at,updated_at,state_json)
               VALUES ('student-quiz','member',10,'maths','fractions','2026-01-01','2026-01-01','{}')"""
        )
        db.execute(
            """INSERT INTO quiz_attempts
               (quiz_id,student_id,question_id,topic,difficulty,prompt,expected,correct,created_at)
               VALUES ('student-quiz','member','q1','fractions',1,'Question','Answer',1,'2026-01-01')"""
        )
        db.execute(
            "INSERT INTO sessions (id,created_at,title,user_id) VALUES ('student-session','2026-01-01','Lecture',?)",
            (account_id,),
        )
    student_token = login(school,"student","member","initial-password").json()["token"]
    login(school).raise_for_status()

    response = school.delete(f"/api/admin/accounts/{account_id}")
    assert response.status_code == 200, response.text
    assert login(school,"student","member","initial-password").status_code == 401
    assert school.get(
        "/api/auth/me",headers={"Authorization":f"Bearer {student_token}"}
    ).status_code == 401
    assert store.get_user_by_id(account_id) is None
    with store._connection() as db:
        assert db.execute("SELECT COUNT(*) FROM student_enrollments WHERE student_id=?", (account_id,)).fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM quiz_sessions WHERE id='student-quiz'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id='student-quiz'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM mastery WHERE student_id='member'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM sessions WHERE id='student-session'").fetchone()[0] == 0


def test_admin_can_delete_teacher_and_owned_lessons(school):
    login(school).raise_for_status()
    learner = record()
    learner["identifier"] = "learner-two"
    learner_id = school.post("/api/admin/accounts",json=learner).json()["id"]
    faculty = record("teacher")
    faculty.update(identifier="faculty",subject="science")
    teacher_id = school.post("/api/admin/accounts",json=faculty).json()["id"]

    teacher_token = login(school,"teacher","faculty","initial-password").json()["token"]
    lesson_response = school.post(
        "/api/teacher/lessons",
        json={
            "title":"Test lesson",
            "class_level":10,
            "section":"A",
            "subject":"science",
            "chapter_number":1,
            "chapter_title":"Chemical Reactions",
            "teaching_date":"2026-01-01",
        },
    )
    assert lesson_response.status_code == 200, lesson_response.text
    lesson_id = lesson_response.json()["lesson_id"]
    store = server._store()
    with store._connection() as db:
        db.execute(
            "INSERT INTO lesson_documents VALUES (?,?,?)",
            (lesson_id,"transcript.txt","notes.md"),
        )
        db.execute(
            """INSERT INTO lesson_activity (student_id,lesson_id,event_type,created_at)
               VALUES ('learner-two',?,'opened','2026-01-01')""",
            (lesson_id,),
        )
        db.execute(
            "INSERT INTO lesson_completions (student_id,lesson_id,updated_at) VALUES (?,?,?)",
            (learner_id,lesson_id,"2026-01-01"),
        )
        db.execute(
            """INSERT INTO assignments
               (id,lesson_id,teacher_id,class_level,section,subject,title,created_at)
               VALUES ('teacher-assignment',?,?,10,'A','science','Test assignment','2026-01-01')""",
            (lesson_id,teacher_id),
        )
        db.execute(
            """INSERT INTO quiz_sessions
               (id,student_id,class_level,subject,topic,created_at,updated_at,state_json)
               VALUES ('lesson-quiz','learner-two',10,'science','reactions','2026-01-01','2026-01-01','{}')"""
        )
        db.execute(
            "INSERT INTO lesson_quizzes VALUES ('lesson-quiz',?,?)",
            (lesson_id,learner_id),
        )
        db.execute(
            """INSERT INTO quiz_attempts
               (quiz_id,student_id,question_id,topic,difficulty,prompt,expected,correct,created_at)
               VALUES ('lesson-quiz','learner-two','q1','reactions',1,'Question','Answer',1,'2026-01-01')"""
        )
    login(school).raise_for_status()

    response = school.delete(f"/api/admin/accounts/{teacher_id}")
    assert response.status_code == 200, response.text
    assert login(school,"teacher","faculty","initial-password").status_code == 401
    assert school.get(
        "/api/auth/me",headers={"Authorization":f"Bearer {teacher_token}"}
    ).status_code == 401
    assert store.get_user_by_id(teacher_id) is None
    assert store.get_user_by_id(learner_id) is not None
    with store._connection() as db:
        assert db.execute("SELECT COUNT(*) FROM lessons WHERE id=?", (lesson_id,)).fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM lesson_documents WHERE lesson_id=?", (lesson_id,)).fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM lesson_completions WHERE lesson_id=?", (lesson_id,)).fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM assignments WHERE id='teacher-assignment'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM lesson_quizzes WHERE quiz_id='lesson-quiz'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM quiz_sessions WHERE id='lesson-quiz'").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id='lesson-quiz'").fetchone()[0] == 0
