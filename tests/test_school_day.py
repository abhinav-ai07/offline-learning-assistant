from fastapi.testclient import TestClient
from ila import server
from ila.auth import hash_password
from ila.storage import Storage


def test_school_catalogue_migration_keeps_classes_used_by_existing_accounts(tmp_path):
    database = tmp_path / "ila.sqlite3"
    store = Storage(database)
    store.create_user(
        full_name="Existing Class 9 Student",
        role="student",
        class_level=9,
        student_identifier="S9",
        password_hash=hash_password("school-secret"),
    )
    with store._connection() as db:
        db.execute("UPDATE academic_classes SET is_active=0")
        db.execute("UPDATE sections SET is_active=0")
        db.execute("PRAGMA user_version=3")

    migrated = Storage(database)
    with migrated._connection() as db:
        classes = {
            row["class_level"]
            for row in db.execute("SELECT class_level FROM academic_classes WHERE is_active=1")
        }
        sections = {
            (row["class_level"], row["name"])
            for row in db.execute("SELECT class_level,name FROM sections WHERE is_active=1")
        }
    assert classes == {9, 10}
    assert sections == {(9, "A"), (10, "A")}


def test_school_day(tmp_path, monkeypatch):
    store = Storage(tmp_path / "ila.sqlite3")
    monkeypatch.setattr(server, "_STORE", store)
    client = TestClient(server.app)
    password = "school-secret"
    store.create_user(full_name="Administrator", role="admin", student_identifier="ADM",
                      password_hash=hash_password(password))

    def call(method, path, data=None, status=200):
        response = client.request(method, "/api/" + path, json=data)
        assert response.status_code == status, response.text
        return response.json()

    def login(identifier, role):
        return call("POST", "auth/login", {"identifier": identifier, "role_hint": role,"password": password})

    login("ADM","admin")
    initial_school = call("GET","admin/school")
    assert initial_school["classes"] == [
        {"class_level": 10, "name": "Class 10", "academic_year": "2026-2027"}
    ]
    assert initial_school["sections"] == [{"class_level": 10, "name": "A"}]
    curriculum = call("GET", "classes")
    assert {course["class_level"] for course in curriculum} >= {9, 10, 11, 12}
    assert any(chapter["class_level"] == 10 for chapter in call(
        "GET", "classes/10/subjects/science/chapters"
    ))

    call("POST","admin/classes",{"class_level":12,"name":"Class 12","academic_year":"2026-2027"})
    assert {"class_level": 12, "name": "A"} in call("GET", "admin/school")["sections"]
    call("POST","admin/sections",{"class_level":12,"name":"C"})
    call("POST","admin/classes",{"class_level":9,"name":"Class 9","academic_year":"2026-2027"})
    assert {"class_level": 9, "name": "A"} in call("GET", "admin/school")["sections"]
    for i in range(21):
        call("POST","admin/accounts",{"full_name":f"Learner {i}","identifier":f"S{i}","role":"student",
             "class_level":12 if i<20 else 9,"section":"C" if i<20 else "A","password":password})
    call("POST","admin/accounts",{"full_name":"Science Teacher","identifier":"T12","role":"teacher",
         "class_level":12,"section":"C","subject":"science","password":password})
    directory = call("GET", "admin/school")
    active_students = [
        user for user in directory["users"] if user["role"] == "student" and user["active"]
    ]
    students_by_class = {
        class_info["class_level"]: sum(
            user["class_level"] == class_info["class_level"] for user in active_students
        )
        for class_info in directory["classes"]
    }
    assert sum(students_by_class.values()) == len(active_students) == 21
    assert students_by_class == {9: 1, 10: 0, 12: 20}
    login("T12","teacher")
    call("GET","admin/school",status=403)
    assert call("GET","teacher/classes")[0]["students_count"] == 20
    call("GET","teacher/students/S20",status=404)
    text = "Electric charge is a property of matter that produces an electric force. Like charges repel each other. Unlike charges attract each other."
    import os
    from pathlib import Path
    audio_path = None
    if audio := os.getenv("ILA_VERIFY_AUDIO"):
        with Path(audio).open("rb") as stream:
            response = client.post("/api/transcribe",files={"file":("classroom.wav",stream,"audio/wav")},
                                   data={"class_level":12,"subject":"science","use_llm":"false"})
        assert response.status_code == 200, response.text
        text = response.json()["transcript"]
        audio_path = response.json()["audio_path"]
        assert text.strip() and (tmp_path / audio_path).is_file()
    notes = call("POST","notes",{"class_level":12,"subject":"science","text":text,"use_llm":bool(os.getenv("ILA_VERIFY_LLM")),"profile":"auto"})
    if os.getenv("ILA_VERIFY_LLM"):
        assert notes["notes"]["used_llm"], notes["notes"].get("fallback_reason")
    lesson = call("POST","teacher/lessons",{"class_level":12,"section":"C","subject":"science",
         "title":"Electric charge","chapter_number":1,"chapter_title":"Electricity","teaching_date":"2026-11-25",
         "audio_path":audio_path,"transcript":text,"notes_markdown":notes["markdown"]})["lesson_id"]
    login("S0","student")
    call("GET",f"student/lessons/{lesson}",status=404)
    login("T12","teacher")
    call("POST",f"teacher/lessons/{lesson}/publish")
    login("S0","student")
    assert call("GET","student/notifications")
    assert call("GET",f"student/lessons/{lesson}")["lesson"]["notes_markdown"] == notes["markdown"]
    quiz = call("POST","quiz/start",{"lesson_id":lesson,"length":1})
    call("POST","quiz/answer",{"quiz_id":quiz["quiz_id"],"question_id":quiz["question"]["id"],"answer_index":0})
    assert call("GET",f"student/lessons/{lesson}")["completion"]["quiz_completed"]
    login("T12","teacher")
    assert call("GET","teacher/overview")["total_students"] == 20
    assert call("GET","teacher/activity")
