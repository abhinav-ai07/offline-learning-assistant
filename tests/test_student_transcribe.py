"""Tests for student audio transcription, syllabus correlation rejection, and auto-chapter sorting."""

from __future__ import annotations

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

import ila.server as server_module
from ila.notes import TranscriptLine
from ila.server import app
from ila.storage import Storage

client = TestClient(app)


@pytest.fixture()
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Storage:
    storage = Storage(tmp_path / "student_transcribe.db")
    monkeypatch.setattr(server_module, "_STORE", storage)
    return storage


def test_student_transcribe_rejects_off_topic_audio(
    store: Storage, school_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = school_session(client, store, "student", "STU-REJECT")
    client.headers.pop("Authorization", None)

    monkeypatch.setattr(
        server_module,
        "_transcribe_audio_lines",
        lambda settings, path: (
            [TranscriptLine(text="Today we cooked pasta and talked about weekend football.", start=0.0, end=4.0)],
            4.0,
            {"model": "stub"},
        ),
    )

    res = client.post(
        "/api/student/transcribe",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("offtopic.wav", b"RIFF0000WAVEfmt ", "audio/wav")},
        data={"subject": "auto", "use_llm": "false"},
    )
    assert res.status_code == 400
    assert "Rejected" in res.json()["detail"]

    # Nothing saved in student's subjects tree or recordings
    tree = client.get(
        "/api/student/subjects",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert all(ch["lessons_count"] == 0 for subj in tree for ch in subj["chapters"])


def test_student_transcribe_accepts_correlated_audio_and_sorts_chapter(
    store: Storage, school_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = school_session(client, store, "student", "STU-MATH")
    other_token = school_session(client, store, "student", "STU-OTHER")
    client.headers.pop("Authorization", None)

    monkeypatch.setattr(
        server_module,
        "_transcribe_audio_lines",
        lambda settings, path: (
            [
                TranscriptLine(
                    text="Quadratic equations have standard form ax squared plus bx plus c equals zero, and the discriminant decides real roots.",
                    start=0.0,
                    end=6.0,
                )
            ],
            6.0,
            {"model": "stub"},
        ),
    )

    res = client.post(
        "/api/student/transcribe",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("quadratic.wav", b"RIFF0000WAVEfmt ", "audio/wav")},
        data={"subject": "auto", "use_llm": "false"},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["subject"] == "maths"
    assert payload["chapter_number"] == 4
    assert payload["chapter_title"] == "Quadratic Equations"
    assert payload["correlation_score"] >= 1.5
    lesson_id = payload["lesson_id"]

    # Automatically sorted into Maths -> Chapter 4 for this student
    tree = client.get(
        "/api/student/subjects",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    maths = next(s for s in tree if s["subject_code"] == "maths")
    ch4 = next(c for c in maths["chapters"] if c["chapter_number"] == 4)
    assert any(l["id"] == lesson_id and l["is_student_generated"] for l in ch4["lessons"])

    # Accessible in student lesson viewer, but private to the uploading student
    detail = client.get(
        f"/api/student/lessons/{lesson_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail.status_code == 200
    assert detail.json()["lesson"]["chapter_number"] == 4

    other_detail = client.get(
        f"/api/student/lessons/{lesson_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert other_detail.status_code == 404
