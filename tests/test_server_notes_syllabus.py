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


def test_notes_dropped_when_no_syllabus_correlation(store: Storage,school_session):
    school_session(client,store,"teacher","faculty")
    # Completely off-topic transcript (no maths or NCERT concepts)
    payload = {
        "lines": [
            {"text": "The quick brown fox jumps over the lazy dog.", "start": 0.0, "end": 2.0},
            {"text": "We went to the grocery store and bought apples and bread.", "start": 2.5, "end": 5.0},
        ],
        "class_level": 10,
        "subject": "maths",
        "profile": "extractive",
        "use_llm": False,
        "use_syllabus": True,
    }
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 200
    assert response.json()["mapped_topic"] is None


def test_notes_stored_with_mapped_topic_when_correlated(store: Storage,school_session):
    school_session(client,store,"teacher","faculty")
    # Correlated transcript discussing Quadratic Equations
    payload = {
        "lines": [
            {"text": "The standard form of a quadratic equation is ax squared plus bx plus c equals zero.", "start": 0.0, "end": 3.0},
            {"text": "We calculate the discriminant as b squared minus four ac to find the roots.", "start": 3.5, "end": 7.0},
            {"text": "If the discriminant is positive, the quadratic equation has two real roots.", "start": 7.5, "end": 11.0},
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

    school_session(client,store,"student","learner")
    retrieval = client.get("/api/lecture-notes/4?class_level=10&subject=maths")
    assert retrieval.status_code == 200
    assert retrieval.json()["found"] is False
