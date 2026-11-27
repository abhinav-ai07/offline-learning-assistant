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

@pytest.mark.parametrize("action", ["reply", "publish", "both"])
def test_doubt_workflow(clean_store, school_session, action):
    student, peer, teacher, other_teacher, outside = [TestClient(app) for _ in range(5)]
    for session, role, identifier in [
        (student, "student", "Student1"), (peer, "student", "Student2"),
        (teacher, "teacher", "Teacher1"), (other_teacher, "teacher", "Teacher2"),
        (outside, "student", "Student9"),
    ]:
        if session is outside:
            clean_store.create_user(full_name=identifier, role=role, student_identifier=identifier,
                                    password_hash="unused", class_level=9)
        school_session(session, clean_store, role, identifier)
    recipient = next(t for t in student.get("/api/student/doubt-teachers").json()
                     if t["full_name"] == "Teacher1" and t["subject"] == "science")
    payload = {"teacher_id": recipient["id"], "subject": "science", "chapter_number": 1,
               "question": "Original doubt"}
    assert outside.post("/api/student/doubts", json=payload).status_code == 422
    sent = student.post("/api/student/doubts", json=payload)
    assert sent.status_code == 200, sent.text
    doubt_id = sent.json()["id"]
    path = f"/api/teacher/doubts/{doubt_id}/response"
    response = {"action": action, "question": "Public question", "answer": "Public answer",
                "reply": "For the student only"}
    assert teacher.get("/api/teacher/doubts?status=Pending").json()[0]["id"] == doubt_id
    assert peer.get("/api/student/doubts").json() == []
    assert other_teacher.get("/api/teacher/doubts").json() == []
    assert other_teacher.post(path, json=response).status_code == 404
    assert student.post(path, json=response).status_code == 403
    result = teacher.post(path, json=response)
    assert result.status_code == 200, result.text
    received = student.get("/api/student/doubts").json()[0]
    replied = action in ("reply", "both")
    assert received["reply"] == (response["reply"] if replied else None)
    assert bool(student.get("/api/student/notifications").json()) == replied
    public = peer.get("/api/student/faqs?subject=science").json()
    assert outside.get("/api/student/faqs").json() == []
    assert peer.get("/api/student/faqs?subject=maths").json() == []
    def subject_card():
        return next(s for s in peer.get("/api/student/subjects").json() if s["subject_code"] == "science")

    card = subject_card()
    assert card["faq_count"] == len(public) == len(card["faqs"])
    assert card["published_lecture_count"] == 0
    if action == "reply":
        assert public == []
        return
    assert len(public) == 1 and public[0]["doubt_id"] == doubt_id
    assert public[0]["answer"] == "Public answer"
    assert "reply" not in public[0] and "student_id" not in public[0]
    assert teacher.post(path, json={**response, "reply": "retry"}).status_code == 409
    assert student.get("/api/student/doubts").json()[0]["reply"] == received["reply"]
    assert teacher.post(path, json={**response, "action": "edit", "answer": "Updated"}).is_success
    assert student.get("/api/student/faqs").json()[0]["answer"] == "Updated"
    assert teacher.post(path, json={"action": "unpublish"}).is_success
    assert peer.get("/api/student/faqs").json() == []
    assert subject_card()["faq_count"] == 0

@pytest.mark.parametrize("action", ["reply", "both"])
def test_doubt_inbox_and_locked_answer(clean_store, school_session, action):
    student, teacher, other = [TestClient(app) for _ in range(3)]
    school_session(student, clean_store, "student", "Pupil")
    school_session(teacher, clean_store, "teacher", "Faculty")
    school_session(other, clean_store, "teacher", "Other")
    teacher_id = clean_store.get_user_by_identifier_and_role("Faculty", "teacher")["id"]
    sent = student.post("/api/student/doubts", json={
        "teacher_id": teacher_id, "subject": "science", "chapter_number": 1, "question": "Why?"})
    assert sent.is_success
    doubt_id = sent.json()["id"]
    inbox = "/api/teacher/doubt-notifications"
    path = "/api/teacher/doubts/" + doubt_id
    notices = teacher.get(inbox).json()
    assert [(n["id"], n["is_read"]) for n in notices] == [(doubt_id, 0)]
    assert notices[0]["link"] == "/teacher/doubts/" + doubt_id
    assert other.get(inbox).json() == []
    assert other.post(path + "/view").status_code == 404
    for _ in range(2):
        assert teacher.post(path + "/view").is_success
    assert [n["is_read"] for n in teacher.get(inbox).json()] == [1]
    assert teacher.post(path + "/response", json={"action": action, "reply": "Because."}).is_success
    for duplicate in ("reply", "both"):
        assert teacher.post(path + "/response", json={"action": duplicate, "reply": "Changed"}).status_code == 409
    doubt = student.get("/api/student/doubts").json()[0]
    assert doubt["reply"] == "Because."
    assert doubt["status"] == ("Replied" if action == "reply" else "Replied & Published")
    assert len(student.get("/api/student/notifications").json()) == 1
    card = next(s for s in student.get("/api/student/subjects").json() if s["subject_code"] == "science")
    assert card["faq_count"] == (1 if action == "both" else 0)
    if action == "both":
        assert [(f["question"], f["answer"]) for f in card["faqs"]] == [("Why?", "Because.")]
