from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import ila.server as server_module
from ila.server import app
from ila.storage import Storage

client = TestClient(app)


@pytest.fixture()
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Storage:
    storage = Storage(tmp_path / "server.db")
    monkeypatch.setattr(server_module, "_STORE", storage)
    return storage


def test_notes_dropped_when_no_syllabus_correlation(store: Storage, school_session) -> None:
    school_session(client, store, "teacher", "faculty")
    # Completely off-topic transcript (no maths or NCERT concepts)
    payload = {
        "lines": [
            {"text": "The quick brown fox jumps over the lazy dog.", "start": 0.0, "end": 2.0},
            {
                "text": "We went to the grocery store and bought apples and bread.",
                "start": 2.5,
                "end": 5.0,
            },
        ],
        "class_level": 10,
        "subject": "maths",
        "profile": "extractive",
        "use_llm": False,
        "use_syllabus": True,
    }
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "No syllabus correlation found" in detail or "Insufficient syllabus correlation" in detail


def test_notes_stored_with_mapped_topic_when_correlated(store: Storage, school_session) -> None:
    school_session(client, store, "teacher", "faculty")
    # Correlated transcript discussing Quadratic Equations
    payload = {
        "lines": [
            {
                "text": "The standard form of a quadratic equation is ax squared plus bx plus c equals zero.",
                "start": 0.0,
                "end": 3.0,
            },
            {
                "text": "We calculate the discriminant as b squared minus four ac to find the roots.",
                "start": 3.5,
                "end": 7.0,
            },
            {
                "text": "If the discriminant is positive, the quadratic equation has two real roots.",
                "start": 7.5,
                "end": 11.0,
            },
        ],
        "class_level": 10,
        "subject": "maths",
        "profile": "extractive",
        "use_llm": False,
        "use_syllabus": True,
    }
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["mapped_topic"] == "Quadratic Equations"
    assert data["chapter_number"] == 4
    assert data["correlation_score"] >= 1.5
    assert "session_id" in data

    # Draft session notes are not exposed to students until a teacher publishes the lesson.
    school_session(client, store, "student", "learner")
    retrieval = client.get("/api/lecture-notes/4?class_level=10&subject=maths")
    assert retrieval.status_code == 200
    assert retrieval.json()["found"] is False

    # Once published as a lesson, students can retrieve the chapter notes.
    school_session(client, store, "teacher", "faculty")
    created = client.post(
        "/api/teacher/lessons",
        json={
            "title": "Quadratic Equations — Standard Form",
            "class_level": 10,
            "section": "A",
            "subject": "maths",
            "chapter_number": 4,
            "chapter_title": "Quadratic Equations",
            "teaching_date": "2026-11-25",
            "transcript": " ".join(line["text"] for line in payload["lines"]),
            "notes_markdown": data["markdown"],
            "notes_json": data["notes"],
            "status": "draft",
        },
    )
    assert created.status_code == 200
    lesson_id = created.json()["lesson_id"]
    pub = client.post(f"/api/teacher/lessons/{lesson_id}/publish")
    assert pub.status_code == 200

    school_session(client, store, "student", "learner")
    published_retrieval = client.get("/api/lecture-notes/4?class_level=10&subject=maths")
    assert published_retrieval.status_code == 200
    assert published_retrieval.json()["found"] is True
    assert published_retrieval.json()["markdown"] == data["markdown"]
