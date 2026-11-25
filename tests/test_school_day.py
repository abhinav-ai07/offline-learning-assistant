from fastapi.testclient import TestClient
from ila import server
from ila.auth import hash_password
from ila.storage import Storage


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
    call("POST","admin/sections",{"class_level":12,"name":"C"})
    for i in range(21):
        call("POST","admin/accounts",{"full_name":f"Learner {i}","identifier":f"S{i}","role":"student",
             "class_level":12 if i<20 else 9,"section":"C" if i<20 else "A","password":password})
    call("POST","admin/accounts",{"full_name":"Science Teacher","identifier":"T12","role":"teacher",
         "class_level":12,"section":"C","subject":"science","password":password})
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
