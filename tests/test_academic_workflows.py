"""Tests for academic hierarchy, lesson studio, publishing, student experience and role protection."""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

import ila.server as server_module
from ila.server import app
from ila.storage import Storage

client = TestClient(app)


@pytest.fixture()
def clean_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Storage:
    storage = Storage(tmp_path / "academic_test.db")
    monkeypatch.setattr(server_module, "_STORE", storage)
    return storage


def test_classes_and_curriculum_hierarchy(clean_store: Storage) -> None:
    # 1. Fetch academic classes
    res = client.get("/api/classes")
    assert res.status_code == 200
    classes = res.json()
    assert len(classes) >= 4  # Class 9, 10, 11, 12
    c10 = next(c for c in classes if c["class_level"] == 10)
    assert "A" in c10["sections"]
    assert any(s["code"] == "science" for s in c10["subjects"])

    # 2. Fetch class subjects
    subj_res = client.get("/api/classes/10/subjects")
    assert subj_res.status_code == 200
    subjects = subj_res.json()
    assert any(s["code"] == "science" for s in subjects)

    # 3. Fetch chapters for Class 10 Science
    chap_res = client.get("/api/classes/10/subjects/science/chapters")
    assert chap_res.status_code == 200
    chapters = chap_res.json()
    assert len(chapters) > 0
    assert any("chemical" in ch["title"].lower() for ch in chapters)

    # 4. Fetch timetable
    tt_res = client.get("/api/classes/10/timetable?section=A")
    assert tt_res.status_code == 200
    tt = tt_res.json()
    assert tt == []


def test_student_and_teacher_lesson_publishing_workflow(clean_store: Storage,school_session) -> None:
    teacher_token = school_session(client,clean_store,"teacher","T10")
    student_token = school_session(client,clean_store,"student","AARAV-10A")
    client.headers.pop("Authorization")

    # 3. Student cannot access teacher lesson studio
    unauth_studio = client.get(
        "/api/teacher/classes",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert unauth_studio.status_code == 403

    # 4. Teacher creates a lesson in Lesson Studio (Draft)
    create_res = client.post(
        "/api/teacher/lessons",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={
            "title": "Acids, Bases and Salts — Introduction and Indicators",
            "class_level": 10,
            "section": "A",
            "subject": "science",
            "chapter_number": 2,
            "chapter_title": "Acids, Bases and Salts",
            "teaching_date": "2026-11-24",
            "transcript": "Today we will study acids and bases. Acids taste sour and turn blue litmus red. Bases taste bitter and turn red litmus blue.",
            "notes_markdown": "# Acids and Bases\n\n- **Acids**: Sour taste, turns blue litmus red.\n- **Bases**: Bitter taste, turns red litmus blue.",
            "key_concepts": [{"title": "Acid", "definition": "Substance that produces H+ ions in aqueous solution."}],
            "status": "draft",
        },
    )
    assert create_res.status_code == 200
    lesson_id = create_res.json()["lesson_id"]

    # 5. Teacher updates the lesson
    update_res = client.put(
        f"/api/teacher/lessons/{lesson_id}",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={
            "notes_markdown": "# Acids, Bases and Salts\n\n## 1. Key Properties\n- Acids: pH < 7\n- Bases: pH > 7",
            "status": "ready_for_review",
        },
    )
    assert update_res.status_code == 200

    # 6. Draft/Review lesson is NOT visible to student yet
    student_check = client.get(
        f"/api/student/lessons/{lesson_id}",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert student_check.status_code == 404

    # 7. Teacher publishes the lesson
    pub_res = client.post(
        f"/api/teacher/lessons/{lesson_id}/publish",
        headers={"Authorization": f"Bearer {teacher_token}"},
    )
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "published"

    # 8. Student now has an in-app notification
    notif_res = client.get(
        "/api/student/notifications",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert notif_res.status_code == 200
    notifs = notif_res.json()
    assert any(lesson_id in n.get("link", "") or "Acids" in n.get("title", "") for n in notifs)

    # 9. Student opens published lesson
    open_res = client.get(
        f"/api/student/lessons/{lesson_id}",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert open_res.status_code == 200
    lesson_data = open_res.json()["lesson"]
    assert lesson_data["title"] == "Acids, Bases and Salts — Introduction and Indicators"
    assert "transcript" in lesson_data
    assert "notes_markdown" in lesson_data

    # 10. Student records notes read activity and marks lesson complete
    act_res = client.post(
        f"/api/student/lessons/{lesson_id}/activity",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"event_type": "notes_read", "metadata": {"duration_seconds": 120}},
    )
    assert act_res.status_code == 200

    comp_res = client.post(
        f"/api/student/lessons/{lesson_id}/complete",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"completed": True},
    )
    assert comp_res.status_code == 200
    assert comp_res.json()["completed"] == 1

    # 11. Student subjects tree shows completed status
    tree_res = client.get(
        "/api/student/subjects",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert tree_res.status_code == 200
    tree = tree_res.json()
    sci = next(s for s in tree if s["subject_code"] == "science")
    assert sci["completed_lessons"] >= 1

    # 12. Teacher monitors student activity
    t_act = client.get(
        "/api/teacher/activity",
        headers={"Authorization": f"Bearer {teacher_token}"},
    )
    assert t_act.status_code == 200
    events = t_act.json()
    assert any(e["event_type"] == "notes_read" or e["event_type"] == "marked_complete" for e in events)


def test_teacher_class_authorization_boundary(clean_store: Storage,school_session) -> None:
    clean_store.create_user(full_name="Teacher Nine", role="teacher",class_level=9,
                            password_hash="test",student_identifier="T9")
    token = school_session(client,clean_store,"teacher","T9")
    forbidden_res = client.post(
        "/api/teacher/lessons",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Class 12 Physics Lecture",
            "class_level": 12,
            "section": "A",
            "subject": "physics",
            "chapter_number": 1,
            "chapter_title": "Electrostatics",
            "teaching_date": "2026-11-24",
            "transcript": "Electric charge is conserved.",
        },
    )
    assert forbidden_res.status_code == 403
    assert "Forbidden" in forbidden_res.json()["detail"]


def test_student_password_change_workflow(clean_store: Storage,school_session) -> None:
    from ila.auth import hash_password
    clean_store.create_user(full_name="Meera Nair",email="meera@school.edu",student_identifier="MEERA-10B",
                            password_hash=hash_password("initialpassword"))
    school_session(client,clean_store,"student","MEERA-10B")
    # 2. Reset password
    reset_res = client.post(
        "/api/auth/password",
        json={
            "email": "meera@school.edu",
            "current_password":"initialpassword",
            "new_password": "newsecurepassword",
            "confirm_password": "newsecurepassword",
            "student_identifier": "MEERA-10B",
        },
    )
    assert reset_res.status_code == 200
    assert reset_res.json()["status"] == "ok"

    # 3. Old password fails
    old_login = client.post(
        "/api/auth/login",
        json={"email_or_username": "meera@school.edu", "password": "initialpassword"},
    )
    assert old_login.status_code == 401

    # 4. New password succeeds
    new_login = client.post(
        "/api/auth/login",
        json={"email_or_username": "meera@school.edu", "password": "newsecurepassword"},
    )
    assert new_login.status_code == 200
    assert "token" in new_login.json()
