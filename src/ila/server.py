"""Local HTTP/WebSocket API for the captioning and notes pipelines.

The server is the only thing the React dashboard talks to. Everything binds to
loopback, nothing calls the network, and the same process can serve the built
dashboard from ``dashboard/dist``.

WebSocket protocol (``/ws/captions``)
-------------------------------------
Client sends one JSON config message::

    {"source": "mic", "device": null, "model": "base.en",
     "language": "en", "partials": true}

or for offline files::

    {"source": "file", "path": "C:/lectures/week3.wav", "realtime": true}

Server then emits newline-delimited JSON messages:

* ``{"type": "status", "stage": "loading_model", ...}``
* ``{"type": "ready", "schema": 1, "asr": {...}}``
* ``{"type": "caption", "kind": "partial" | "final", ...}``
* ``{"type": "error", "message": "..."}``
* ``{"type": "done"}``

The client may send ``{"action": "stop"}`` at any time to end the session.
Closing the socket also stops the capture thread.

REST endpoints
--------------
``GET  /api/health``       liveness + loaded ASR models
``GET  /api/config``       ASR, notes profile, hardware and NCERT catalogue
``GET  /api/devices``      microphone list
``GET  /api/demo``         built-in NCERT demo lecture for a class/subject
``POST /api/notes``        transcript lines -> grounded notes + Markdown
``POST /api/transcribe``   uploaded audio -> transcript + optional notes
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import threading
from datetime import date
from pathlib import Path
import shutil
from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ila import __version__, hardware
from ila.asr import AsrProvider, create_asr
from ila.audio import FileSource, QueueAudioSource, build_source, list_input_devices
from ila.auth import (
    compute_expiration,
    extract_token,
    generate_session_token,
    hash_password,
    verify_password,
)
from ila.config import Settings, load_settings
from ila.curriculum import (
    CLASS_LEVELS,
    SUBJECT_LABELS,
    SUBJECTS,
    Chapter,
    Course,
    SyllabusContext,
    build_syllabus_context,
    course_catalogue,
    get_course,
    match_chapters,
)
from ila.demo import demo_summaries, find_demo
from ila.events import SCHEMA_VERSION, CaptionEvent
from ila.llm import (
    PROFILE_MODELS,
    LlmProvider,
    create_llm,
    resolve_profile,
)
from ila.notes import (
    NoteResult,
    NotesGenerator,
    TranscriptLine,
    lines_from_events,
    lines_from_text,
)
from ila.pipeline import CaptionPipeline
from ila.quiz import QuizEngine, build_question_bank
from ila.retrieval import EMBEDDING_DIM, AnswerEngine, KnowledgeBase
from ila.storage import Storage
from ila.text import normalize_transcript

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DASHBOARD_DIST = PROJECT_ROOT / "dashboard" / "dist"
NOTES_DIR = PROJECT_ROOT / "notes"
MAX_UPLOAD_BYTES = 250 * 1024 * 1024

app = FastAPI(title="Offline Intelligent Lecture Assistant", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8765",
        "http://127.0.0.1:8765",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



class AsrRegistry:
    """Loads each (model, device, compute_type) combination at most once."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: dict[tuple[str, str, str], AsrProvider] = {}

    def get(self, settings: Settings) -> AsrProvider:
        key = (settings.asr.model, settings.asr.device, settings.asr.compute_type)
        with self._lock:
            provider = self._cache.get(key)
            if provider is None:
                provider = create_asr(settings.asr)
                self._cache[key] = provider
            return provider

    def loaded(self) -> list[dict[str, str]]:
        with self._lock:
            return [provider.info.to_dict() for provider in self._cache.values()]


class LlmRegistry:
    """Keeps one local notes model in memory, replacing it when the profile changes."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._key: tuple[Any, ...] | None = None
        self._provider: LlmProvider | None = None

    def get(self, settings: Settings, *, profile: str | None) -> LlmProvider:
        key = (
            settings.llm.enabled,
            profile,
            str(settings.llm.model_path or ""),
            str(settings.llm.model_dir),
            settings.llm.n_ctx,
            settings.llm.n_threads,
        )
        with self._lock:
            if key != self._key or self._provider is None:
                self._close_locked()
                self._provider = create_llm(settings.llm, profile=profile)
                self._key = key
            return self._provider

    def _close_locked(self) -> None:
        close = getattr(self._provider, "close", None)
        if callable(close):
            with contextlib.suppress(Exception):
                close()
        self._provider = None
        self._key = None


REGISTRY = AsrRegistry()
LLM_REGISTRY = LlmRegistry()
SETTINGS = load_settings()

#: Serialise note generation: one local model, one lecture at a time.
NOTES_LOCK = threading.Lock()
#: Serialise batch transcription; the WS capture thread owns the model otherwise.
TRANSCRIBE_LOCK = threading.Lock()


class _RealtimeHub:
    """Thread-safe WebSocket pub/sub hub for instant portal updates."""

    def __init__(self) -> None:
        self._clients: dict[WebSocket, dict[str, Any]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def register(self, ws: WebSocket, user: dict[str, Any]) -> None:
        with self._lock:
            self._clients[ws] = {
                "user_id": user.get("id"),
                "role": user.get("role"),
                "class_level": user.get("class_level"),
            }

    def unregister(self, ws: WebSocket) -> None:
        with self._lock:
            self._clients.pop(ws, None)

    async def broadcast(
        self,
        event_type: str,
        *,
        class_level: int | None = None,
        target_user_id: str | None = None,
        roles: tuple[str, ...] | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        payload = {"type": event_type, "class_level": class_level, **(data or {})}
        with self._lock:
            snapshot = list(self._clients.items())

        stale: list[WebSocket] = []
        for ws, meta in snapshot:
            if roles and meta.get("role") not in roles and meta.get("user_id") != target_user_id:
                continue
            if (
                class_level is not None
                and meta.get("role") == "student"
                and meta.get("class_level") != class_level
                and meta.get("user_id") != target_user_id
            ):
                continue
            if target_user_id and roles is None and meta.get("user_id") != target_user_id:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.unregister(ws)


REALTIME_HUB = _RealtimeHub()


def _emit_realtime_event(
    event_type: str,
    *,
    class_level: int | None = None,
    target_user_id: str | None = None,
    roles: tuple[str, ...] | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """Safely push a real-time event from either sync or async route handlers."""
    loop = REALTIME_HUB._loop
    if loop is None or loop.is_closed():
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
    coro = REALTIME_HUB.broadcast(
        event_type,
        class_level=class_level,
        target_user_id=target_user_id,
        roles=roles,
        data=data,
    )
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is loop:
        loop.create_task(coro)
    else:
        asyncio.run_coroutine_threadsafe(coro, loop)


# ------------------------------------------------------------------ REST models
class NoteLine(BaseModel):
    text: str
    start: float | None = None
    end: float | None = None


class NotesRequest(BaseModel):
    lines: list[NoteLine] = Field(default_factory=list)
    text: str | None = None
    title: str = "Lecture notes"
    class_level: int | None = None
    subject: str | None = None
    profile: str = "auto"
    use_llm: bool = True
    use_syllabus: bool = True
    budget_s: float | None = Field(default=None, gt=0, le=900)


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    lines: list[NoteLine] = Field(default_factory=list)
    text: str | None = None
    session_id: str | None = None
    class_level: int | None = None
    subject: str | None = None
    chapter: int | None = None
    top_k: int = Field(default=5, ge=1, le=10)
    min_score: float | None = Field(default=None, gt=0, le=2)
    use_llm: bool = True
    profile: str | None = Field(default=None)


class QuizStartRequest(BaseModel):
    lesson_id: str | None = None
    chapter_number: int | None = None
    student_id: str = Field(default="demo-student", min_length=1, max_length=120)
    class_level: int | None = None
    subject: str | None = None
    topic: str | None = None
    length: int = Field(default=5, ge=1, le=20)
    difficulty: int | None = Field(default=None, ge=1, le=3)
    lines: list[NoteLine] = Field(default_factory=list)
    text: str | None = None
    session_id: str | None = None


class QuizAnswerRequest(BaseModel):
    quiz_id: str = Field(min_length=1)
    question_id: str = Field(min_length=1)
    answer: str = ""
    answer_index: int | None = Field(default=None, ge=0, le=8)
    response_ms: int | None = Field(default=None, ge=0, le=3_600_000)


class RemediationGenerateRequest(BaseModel):
    student_id: str = Field(default="demo-student", min_length=1, max_length=120)
    topic: str | None = None
    class_level: int | None = None
    subject: str | None = None
    count: int = Field(default=3, ge=1, le=10)
    lines: list[NoteLine] = Field(default_factory=list)
    text: str | None = None
    session_id: str | None = None


class RemediationAnswerRequest(BaseModel):
    pack_id: str = Field(min_length=1)
    student_id: str = Field(min_length=1)
    item_id: str = Field(min_length=1)
    answer: str = ""
    selected_index: int | None = None
    response_ms: int = Field(default=4000, ge=0, le=3_600_000)


class SessionRequest(BaseModel):
    title: str = "Lecture"
    lines: list[NoteLine] = Field(default_factory=list)
    text: str | None = None
    class_level: int | None = None
    subject: str | None = None
    duration_s: float | None = Field(default=None, ge=0)
    notes: dict[str, Any] | None = None
    markdown: str | None = None


class RegisterRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, min_length=3, max_length=150)
    password: str = Field(min_length=6, max_length=100)
    confirm_password: str | None = Field(default=None, min_length=6, max_length=100)
    class_level: int = Field(default=10, ge=1, le=12)
    section: str = Field(default="A", max_length=10)
    student_identifier: str = Field(min_length=1, max_length=50)


class ForgotPasswordRequest(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=150)
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    identifier: str | None = Field(default=None, min_length=1, max_length=50)
    role_hint: Literal["student", "teacher", "admin"] | None = None
    new_password: str = Field(min_length=6, max_length=100)
    confirm_password: str | None = Field(default=None, min_length=6, max_length=100)
    student_identifier: str | None = Field(default=None, max_length=50)


class LessonCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    class_level: int = Field(ge=1, le=12)
    section: str = Field(default="A", max_length=10)
    subject: str = Field(min_length=1, max_length=100)
    chapter_number: int = Field(ge=1)
    chapter_title: str = Field(min_length=1, max_length=200)
    teaching_date: str = Field(min_length=8, max_length=30)
    transcript: str = ""
    notes_markdown: str = ""
    notes_json: dict[str, Any] | None = None
    key_concepts: list[dict[str, Any]] | None = None
    examples: list[dict[str, Any]] | None = None
    duration_s: float = 0.0
    audio_filename: str | None = None
    audio_path: str | None = None
    status: str = "draft"


class LessonUpdateRequest(BaseModel):
    title: str | None = None
    transcript: str | None = None
    notes_markdown: str | None = None
    notes_json: dict[str, Any] | None = None
    key_concepts: list[dict[str, Any]] | None = None
    examples: list[dict[str, Any]] | None = None
    status: str | None = None
    duration_s: float | None = None
    audio_filename: str | None = None
    audio_path: str | None = None


class LessonActivityRequest(BaseModel):
    event_type: Literal["opened","transcript_read","notes_read","quiz_started","ask_question","asked_question","concepts_viewed"]
    metadata: dict[str, Any] | None = None


class LessonCompleteRequest(BaseModel):
    completed: bool = True


class LoginRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    identifier: str | None = Field(default=None, min_length=1, max_length=50)
    email_or_username: str | None = Field(default=None, min_length=2, max_length=150)
    password: str = Field(min_length=1, max_length=100)
    remember_me: bool = False
    role_hint: Literal["student", "teacher", "admin"] | None = None


class TeacherCreateRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    teacher_id: str | None = Field(default=None, min_length=1, max_length=50)
    email: str | None = Field(default=None, min_length=3, max_length=150)
    password: str = Field(min_length=6, max_length=100)
    confirm_password: str | None = Field(default=None, min_length=6, max_length=100)
    class_level: int = Field(default=10, ge=1, le=12)


# ------------------------------------------------------------------ helpers
#: Lazy so importing the app (e.g. in tests) does not create a database.
_STORE: Storage | None = None


def _store() -> Storage:
    global _STORE
    if _STORE is None:
        _STORE = Storage(SETTINGS.data_dir / "ila.sqlite3")
    return _STORE


def get_current_user_optional(request: Request) -> dict[str, Any] | None:
    token = extract_token(
        ila_session=request.cookies.get("ila_session"),
        authorization=request.headers.get("authorization"),
    )
    if not token:
        return None
    return _store().get_auth_session(token)


def get_current_user(
    user: Annotated[dict[str, Any] | None, Depends(get_current_user_optional)],
) -> dict[str, Any]:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_student(
    user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> dict[str, Any]:
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Forbidden: Student access required")
    return user


async def require_teacher(
    request: Request,
    user: Annotated[dict[str, Any] | None, Depends(get_current_user_optional)],
) -> dict[str, Any]:
    if not user:
        raise HTTPException(401, "Authentication required")
    if user["role"] != "teacher":
        raise HTTPException(403, "Teacher access required")
    from ila.storage import report_teacher
    token = report_teacher.set(user["id"] if request.method == "GET" else None)
    try:
        yield user
    finally:
        report_teacher.reset(token)


def require_admin(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(403, "Administration access required")
    return user


def _resolved_profile(settings: Settings) -> str:
    try:
        from ila.llm import LlamaCppProvider
        return LlamaCppProvider(settings.llm).profile
    except ValueError:
        return "balanced"


def _notes_provider_info(settings: Settings, profile: str) -> dict[str, Any]:
    from ila.llm import LlamaCppProvider

    provider = LlamaCppProvider(settings.llm, profile=profile)
    path = provider.path
    expected = provider.expected_bytes
    size_bytes = path.stat().st_size if path.is_file() else 0
    available = (
        settings.llm.enabled
        and provider.available
        and path.is_file()
        and (size_bytes == expected if expected is not None else size_bytes > 0)
    )
    spec = PROFILE_MODELS[profile]
    return {
        "enabled": settings.llm.enabled,
        "profile": profile,
        "profile_requested": settings.llm.profile,
        "available": available,
        "model": path.name,
        "path": str(path),
        "size_mb": round(size_bytes / (1024**2), 1),
        "download_gb": spec.download_gb,
        "ram_gb": spec.ram_gb,
        "note": spec.note,
        "budget_s": settings.llm.budget_s,
        "threads": provider.info.n_threads,
        "selectable": ["auto", *PROFILE_MODELS],
    }


def _selection(class_level: int | None, subject: str | None) -> tuple[int, str]:
    level = SETTINGS.curriculum.class_level if class_level is None else class_level
    name = (subject or SETTINGS.curriculum.subject).strip().lower()
    try:
        get_course(level, name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return level, name


def _request_settings(request: NotesRequest) -> Settings:
    settings = SETTINGS.model_copy(deep=True)
    settings.llm.enabled = request.use_llm and request.profile != "extractive"
    if request.budget_s is not None:
        settings.llm.budget_s = request.budget_s
    return settings


def _request_lines(request: NotesRequest) -> list[TranscriptLine]:
    if request.lines:
        lines = [
            TranscriptLine(
                text=normalize_transcript(line.text),
                start=line.start,
                end=line.end,
            )
            for line in request.lines
        ]
    elif request.text and request.text.strip():
        lines = lines_from_text(request.text)
    else:
        raise HTTPException(status_code=400, detail="Provide transcript lines or text")

    lines = [line for line in lines if line.text]
    if not lines:
        raise HTTPException(status_code=400, detail="No transcript text to summarise")
    return lines


def _syllabus_for(
    lines: list[TranscriptLine], class_level: int, subject: str
) -> Any:
    if not SETTINGS.curriculum.auto_match:
        return None
    text = " ".join(line.text for line in lines)
    return build_syllabus_context(text, class_level, subject)


def _demo_lines(class_level: int, subject: str) -> tuple[list[TranscriptLine], Any, bool]:
    lecture, exact = find_demo(class_level, subject)
    lines = [
        TranscriptLine(text=line.text, start=line.start, end=line.end)
        for line in lecture.lines
    ]
    return lines, lecture, exact


def _lines_from_payload(
    *,
    lines: list[NoteLine],
    text: str | None,
    session_id: str | None,
) -> tuple[list[TranscriptLine], str, dict[str, Any]]:
    """Resolve explicit lines, a saved session, or the built-in demo."""
    if session_id:
        session = _store().get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        resolved = [
            TranscriptLine(
                text=normalize_transcript(str(item.get("text", ""))),
                start=item.get("start"),
                end=item.get("end"),
            )
            for item in session["lines"]
        ]
        resolved = [line for line in resolved if line.text]
        if not resolved:
            raise HTTPException(status_code=400, detail="Saved session has no transcript")
        return resolved, "session", {
            "kind": "session",
            "session_id": session_id,
            "title": session["title"],
            "text": session.get("transcript", ""),
        }

    if lines or (text and text.strip()):
        resolved = _request_lines(NotesRequest(lines=lines, text=text))
        return resolved, "transcript", {
            "kind": "transcript",
            "session_id": None,
            "title": "Current transcript",
            "text": " ".join(line.text for line in resolved),
        }

    return [], "demo", {}


_STATIC_KB_CACHE: dict[tuple[int, str, str], tuple[KnowledgeBase, dict[str, Any]]] = {}
_QA_CACHE: dict[tuple[str, int, str, int | None, bool, str], dict[str, Any]] = {}


def _knowledge_base(
    *,
    lines: list[NoteLine],
    text: str | None,
    session_id: str | None,
    class_level: int,
    subject: str,
    title: str | None = None,
) -> tuple[KnowledgeBase, dict[str, Any]]:
    resolved, source_kind, meta = _lines_from_payload(
        lines=lines, text=text, session_id=session_id
    )
    demo = None
    exact = True
    if not resolved:
        if subject == "maths" and class_level == 10:
            source_kind = "textbook"
            meta = {
                "kind": "textbook",
                "session_id": None,
                "title": "NCERT Class 10 Mathematics Textbook",
                "demo_id": None,
                "exact": True,
                "text": "NCERT Class 10 Mathematics Textbook covering all 14 chapters",
            }
        else:
            resolved, demo, exact = _demo_lines(class_level, subject)
            source_kind = "demo"
            meta = {
                "kind": "demo",
                "session_id": None,
                "title": demo.title,
                "demo_id": demo.id,
                "exact": exact,
                "text": " ".join(line.text for line in resolved),
            }
        cache_key = (class_level, subject, source_kind)
        if cache_key in _STATIC_KB_CACHE:
            cached_kb, cached_meta = _STATIC_KB_CACHE[cache_key]
            return cached_kb, dict(cached_meta)
    else:
        meta["title"] = title or meta.get("title") or "Lecture"
    knowledge = KnowledgeBase.from_lines(
        resolved,
        class_level,
        subject,
        title=str(meta.get("title") or "Lecture"),
        source_kind=source_kind,
        demo_id=demo.id if demo else None,
        chapter_hint=demo.chapter_number if demo else None,
    )
    meta["lines"] = len(resolved)
    meta["course"] = knowledge.course.label if knowledge.course else None
    if not resolved:
        _STATIC_KB_CACHE[(class_level, subject, source_kind)] = (knowledge, dict(meta))
    return knowledge, meta


def _ask_llm_provider(profile_override: str | None = None) -> LlmProvider | None:
    if not SETTINGS.llm.enabled:
        return None
    # For high-speed interactive Q&A, prefer potato (0.8B) for ~1.2s responses unless specified
    preferred_candidates = [profile_override] if profile_override else ["potato", SETTINGS.llm.profile, "balanced"]
    for candidate in preferred_candidates:
        if not candidate:
            continue
        try:
            profile = resolve_profile(candidate)
            provider = LLM_REGISTRY.get(SETTINGS, profile=profile)
            if provider.available:
                return provider
        except Exception:
            continue
    try:
        profile = resolve_profile(SETTINGS.llm.profile)
        return LLM_REGISTRY.get(SETTINGS, profile=profile)
    except Exception:  # a Q&A request must still work extractively
        logger.debug("could not create the Q&A model", exc_info=True)
        return None


def _generate_notes_sync(
    settings: Settings,
    lines: list[TranscriptLine],
    *,
    title: str,
    profile: str | None,
    syllabus: Any,
) -> NoteResult:
    resolved: str | None = None
    if settings.llm.enabled:
        try:
            resolved = profile or settings.llm.profile
            resolve_profile(resolved)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    provider = LLM_REGISTRY.get(settings, profile=resolved)
    generator = NotesGenerator(provider, settings.llm)
    with NOTES_LOCK:
        return generator.generate(lines, title=title, syllabus=syllabus)


def _transcribe_audio_lines(
    settings: Settings,
    path: Path,
) -> tuple[list[TranscriptLine], float, dict[str, Any]]:
    """Run offline ASR on an uploaded audio file (batched VAD on CPU when supported)."""
    with TRANSCRIBE_LOCK:
        asr = REGISTRY.get(settings)
        batched_fn = getattr(asr, "transcribe_file_batched", None)
        if callable(batched_fn):
            raw_segments, duration_s = batched_fn(
                path,
                batch_size=settings.asr.batch_size,
            )
            lines = [
                TranscriptLine(text=text, start=start, end=end)
                for text, start, end in raw_segments
            ]
        else:
            source = FileSource(
                path,
                sample_rate=settings.audio.sample_rate,
                block_ms=settings.audio.block_ms,
                realtime=False,
            )
            try:
                pipeline = CaptionPipeline.from_settings(settings, source, asr)
                events = [event for event in pipeline.events() if event.final]
                duration_s = source.duration_s
            finally:
                source.close()
            lines = lines_from_events(events)

    if not lines:
        raise ValueError("No speech was detected in the uploaded file")
    return lines, duration_s, asr.info.to_dict()


def _transcribe_file(
    settings: Settings,
    path: Path,
    *,
    title: str,
    class_level: int,
    subject: str,
    profile: str,
    use_llm: bool,
) -> dict[str, Any]:
    lines, duration_s, asr_info = _transcribe_audio_lines(settings, path)

    syllabus = _syllabus_for(lines, class_level, subject)
    notes: dict[str, Any] | None = None
    markdown: str | None = None
    notes_error: str | None = None
    try:
        result = _generate_notes_sync(
            settings,
            lines,
            title=title,
            profile=profile if use_llm else None,
            syllabus=syllabus,
        )
        notes = result.to_dict()
        markdown = result.to_markdown()
    except Exception as exc:  # a transcript is still useful if notes fail
        logger.exception("notes failed after upload transcription")
        notes_error = str(exc)

    return {
        "lines": [line.to_dict() for line in lines],
        "transcript": " ".join(line.text for line in lines),
        "duration_s": round(duration_s, 2),
        "asr": asr_info,
        "notes": notes,
        "markdown": markdown,
        "notes_error": notes_error,
    }


def _syllabus_for_subject_with_db_chapters(
    transcript_text: str,
    class_level: int,
    subject: str,
) -> SyllabusContext | None:
    """Build syllabus matches for a class/subject, falling back to DB chapters if needed."""
    try:
        syllabus = build_syllabus_context(transcript_text, class_level, subject)
    except ValueError:
        syllabus = None

    if syllabus and syllabus.course.chapters:
        return syllabus

    db_chapters = _store().get_chapters(class_level, subject)
    if not db_chapters:
        return syllabus

    chapters = tuple(
        Chapter(
            number=int(ch["chapter_number"]),
            title=str(ch["title"]),
            keywords=tuple(
                dict.fromkeys(
                    w
                    for w in re.findall(
                        r"[a-z0-9]+",
                        f"{ch['title']} {ch.get('description', '')}".lower(),
                    )
                    if len(w) > 2
                )
            ),
        )
        for ch in db_chapters
    )
    dynamic_course = Course(class_level, subject, chapters)
    matches = tuple(match_chapters(transcript_text, dynamic_course, limit=3))
    return SyllabusContext(course=dynamic_course, matches=matches)


def _match_student_audio_to_syllabus(
    lines: list[TranscriptLine],
    class_level: int,
    subject_input: str,
) -> tuple[str, SyllabusContext, Any]:
    """Verify audio transcript correlates with syllabus topics and return best (subject, context, match)."""
    transcript_text = " ".join(line.text for line in lines)
    raw_subject = subject_input.strip().lower()
    if raw_subject in ("", "auto"):
        candidate_subjects = [
            str(s["code"]).strip().lower()
            for s in _store().get_subjects(class_level)
        ]
        if not candidate_subjects:
            candidate_subjects = ["maths", "science"]
    else:
        _, norm_subject = _selection(class_level, raw_subject)
        candidate_subjects = [norm_subject]

    best_subject: str | None = None
    best_context: SyllabusContext | None = None
    best_match: Any = None
    sample_topics: list[str] = []

    for cand_subj in dict.fromkeys(candidate_subjects):
        ctx = _syllabus_for_subject_with_db_chapters(transcript_text, class_level, cand_subj)
        if not ctx or not ctx.course.chapters:
            continue
        for ch in ctx.course.chapters[:4]:
            if ch.title not in sample_topics:
                sample_topics.append(ch.title)
        if not ctx.matches:
            continue
        top = ctx.matches[0]
        if best_match is None or top.score > best_match.score:
            best_subject = cand_subj
            best_context = ctx
            best_match = top

    if not sample_topics:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Rejected: No syllabus topics are configured for Class {class_level}"
                + (f" ({raw_subject})" if raw_subject not in ("", "auto") else "")
                + "."
            ),
        )

    if best_match is None or best_context is None or best_subject is None or best_match.score < 1.5:
        topics_hint = ", ".join(sample_topics[:5])
        score_info = f" (score {best_match.score:.1f} < 1.5)" if best_match is not None else ""
        raise HTTPException(
            status_code=400,
            detail=(
                f"Rejected{score_info}: The spoken audio does not correlate with any "
                f"Class {class_level} syllabus topics ({topics_hint}). "
                f"Transcript was dropped and not saved."
            ),
        )

    return best_subject, best_context, best_match


async def _stream_upload_to_path(file: UploadFile, target: Path) -> None:
    """Persist an uploaded file safely to disk, enforcing non-empty and max-size bounds."""
    target.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with target.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File is larger than {MAX_UPLOAD_BYTES // (1024**2)} MB",
                )
            handle.write(chunk)
    if total == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")


# --------------------------------------------------------------------- auth routes
class SchoolAccount(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    identifier: str = Field(min_length=1, max_length=50)
    role: Literal["teacher", "student"]
    class_level: int = Field(ge=9, le=12)
    section: str = Field(min_length=1, max_length=12)
    subject: str = ""
    password: str | None = Field(default=None, min_length=8, max_length=72)
    active: bool = True


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8,max_length=72)


@app.post("/api/auth/password")
def change_password(item: PasswordChange, user: Annotated[dict, Depends(get_current_user)]):
    account = _store().get_user_by_id(user["id"])
    if not verify_password(item.current_password, account["password_hash"]):
        raise HTTPException(403, "Current password is incorrect")
    if len(item.new_password.encode()) > 72:
        raise HTTPException(422, "Password exceeds 72 bytes")
    _store().reset_password_for_user(user["id"],hash_password(item.new_password))
    return {"status": "ok"}


class SchoolClass(BaseModel):
    class_level: int = Field(ge=9,le=12)
    name: str = Field(min_length=1,max_length=80)
    academic_year: str = Field(min_length=4,max_length=20)


@app.post("/api/admin/classes")
def save_class(item: SchoolClass, admin: Annotated[dict,Depends(require_admin)]):
    with _store()._connection() as db:
        db.execute(
            """INSERT INTO academic_classes
               (id,class_level,name,academic_year,is_active) VALUES (?,?,?,?,1)
               ON CONFLICT(class_level) DO UPDATE SET name=excluded.name,
               academic_year=excluded.academic_year,is_active=1""",
            (f"class-{item.class_level}",item.class_level,item.name.strip(),item.academic_year.strip()),
        )
        db.execute(
            """INSERT INTO sections (id,class_level,name,is_active) VALUES (?,?, 'A',1)
               ON CONFLICT(class_level,name) DO UPDATE SET is_active=1""",
            (f"sec-{item.class_level}-A",item.class_level),
        )
    return {"status":"ok"}


class SchoolSection(BaseModel):
    class_level: int = Field(ge=9, le=12)
    name: str = Field(min_length=1, max_length=12)


@app.get("/api/admin/school")
def school_directory(admin: Annotated[dict, Depends(require_admin)]):
    with _store()._connection() as db:
        return {key: [dict(row) for row in db.execute(sql)] for key, sql in {
            "users": """SELECT u.id,full_name,student_identifier AS identifier,role,u.class_level,
                        u.section,is_active AS active,COALESCE(group_concat(a.subject), '') AS subject
                        FROM users u LEFT JOIN teacher_class_assignments a ON a.teacher_id=u.id
                        WHERE role IN ('student','teacher') GROUP BY u.id ORDER BY full_name""",
            "classes":"SELECT class_level,name,academic_year FROM academic_classes WHERE is_active=1 ORDER BY class_level",
            "sections": """SELECT s.class_level,s.name FROM sections s
                           JOIN academic_classes c USING(class_level)
                           WHERE s.is_active=1 AND c.is_active=1 ORDER BY s.class_level,s.name""",
            "subjects": """SELECT class_level,code,name FROM subjects
                           WHERE class_level IN (SELECT class_level FROM academic_classes WHERE is_active=1)
                           ORDER BY class_level,name"""
        }.items()}


@app.post("/api/admin/sections")
def add_section(item: SchoolSection, admin: Annotated[dict, Depends(require_admin)]):
    name = item.name.strip().upper()
    if not name:
        raise HTTPException(422, "Enter a section name")
    with _store()._connection() as db:
        if not db.execute(
            "SELECT 1 FROM academic_classes WHERE class_level=? AND is_active=1",
            (item.class_level,),
        ).fetchone():
            raise HTTPException(422, "Add this class before creating its sections")
        db.execute(
            """INSERT INTO sections (id,class_level,name,is_active) VALUES (?,?,?,1)
               ON CONFLICT(class_level,name) DO UPDATE SET is_active=1""",
            (f"sec-{item.class_level}-{name}",item.class_level,name),
        )
    return {"status": "ok"}


@app.post("/api/admin/accounts")
@app.put("/api/admin/accounts/{account_id}")
def save_school_account(item: SchoolAccount, admin: Annotated[dict, Depends(require_admin)], account_id: str | None = None):
    from uuid import uuid4
    from datetime import datetime, timezone
    name, identifier = item.full_name.strip(), item.identifier.strip()
    if len(name) < 2 or not identifier or (not account_id and not item.password):
        raise HTTPException(422, "Enter a name, school ID and initial password")
    if item.password and len(item.password.encode()) > 72:
        raise HTTPException(422, "Password exceeds 72 bytes")
    password_hash = hash_password(item.password) if item.password else None
    now = datetime.now(timezone.utc).isoformat()
    with _store()._connection() as db:
        db.execute("BEGIN IMMEDIATE")
        if not db.execute(
            """SELECT 1 FROM sections s JOIN academic_classes c USING(class_level)
               WHERE s.class_level=? AND s.name=? AND s.is_active=1 AND c.is_active=1""",
            (item.class_level,item.section),
        ).fetchone():
            raise HTTPException(422, "Unknown class or section")
        if item.role == "teacher" and not db.execute("SELECT 1 FROM subjects WHERE class_level=? AND code=?", (item.class_level,item.subject)).fetchone():
            raise HTTPException(422, "Select an assigned subject")
        if db.execute("SELECT 1 FROM users WHERE lower(student_identifier)=lower(?) AND id!=?", (identifier, account_id or "")).fetchone():
            raise HTTPException(409, "School ID already exists")
        if account_id:
            prior = db.execute("SELECT student_identifier FROM users WHERE id=? AND role=?", (account_id,item.role)).fetchone()
            if not prior:
                raise HTTPException(404, "Account unavailable")
            if item.role == "student" and prior[0] and prior[0] != identifier:
                for table in ("quiz_attempts","quiz_sessions","mastery","remediation_records"):
                    if db.execute(f"SELECT 1 FROM {table} WHERE student_id=? LIMIT 1",(identifier,)).fetchone():
                        raise HTTPException(409,"This ID already has learning records")
                    db.execute(f"UPDATE {table} SET student_id=? WHERE student_id=?",(identifier,prior[0]))
            db.execute("""UPDATE users SET full_name=?,student_identifier=?,class_level=?,section=?,is_active=?,
                          updated_at=?,password_hash=coalesce(?,password_hash) WHERE id=?""",
                       (name,identifier,item.class_level,item.section,item.active,now,password_hash,account_id))
            if password_hash or not item.active:
                db.execute("DELETE FROM auth_sessions WHERE user_id=?", (account_id,))
        else:
            account_id = uuid4().hex
            db.execute("""INSERT INTO users(id,full_name,student_identifier,role,class_level,section,password_hash,
                          created_at,updated_at,is_active) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                       (account_id,name,identifier,item.role,item.class_level,item.section,password_hash,now,now,item.active))
        if item.role == "student":
            db.execute("DELETE FROM student_enrollments WHERE student_id=?", (account_id,))
            db.execute("INSERT INTO student_enrollments VALUES (?,?,?,?,?)", (uuid4().hex,account_id,item.class_level,item.section,identifier))
        else:
            db.execute("DELETE FROM teacher_class_assignments WHERE teacher_id=?", (account_id,))
            db.execute("INSERT INTO teacher_class_assignments VALUES (?,?,?,?,?)", (uuid4().hex,account_id,item.class_level,item.section,item.subject))
    return {"id": account_id}


@app.delete("/api/admin/accounts/{account_id}")
def delete_school_account(
    account_id: str,
    admin: Annotated[dict, Depends(require_admin)],
) -> dict[str, str]:
    if not _store().delete_school_account(account_id):
        raise HTTPException(404, "Student or teacher account unavailable")
    return {"status": "ok"}


@app.post("/api/auth/login")
def auth_login(request: LoginRequest, response: Response) -> dict[str, Any]:
    ident = (request.identifier or request.email_or_username or "").strip()
    candidates: list[dict[str, Any]] = []

    # Priority 1: full_name + identifier + role_hint matching
    if request.full_name and request.identifier and request.role_hint:
        candidates = _store().get_users_by_name_and_identifier(
            request.full_name, request.identifier, request.role_hint
        )

    # Priority 2: Direct identifier (USN or Teacher ID or Email) lookup
    if not candidates and ident:
        if request.role_hint:
            user = _store().get_user_by_identifier_and_role(ident, request.role_hint)
            if user:
                candidates = [user]
        if not candidates:
            user = _store().get_user_by_identifier(ident)
            if user:
                candidates = [user]

    # Priority 3: Lookup by full_name if only name was provided
    if not candidates and request.full_name and not ident:
        with _store()._connection() as conn:
            if request.role_hint == "student":
                rows = conn.execute(
                    "SELECT * FROM users WHERE LOWER(full_name) = LOWER(?) AND role = 'student'",
                    (request.full_name.strip(),),
                ).fetchall()
            elif request.role_hint in ("teacher", "admin"):
                rows = conn.execute(
                    "SELECT * FROM users WHERE LOWER(full_name) = LOWER(?) AND role IN ('teacher', 'admin')",
                    (request.full_name.strip(),),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM users WHERE LOWER(full_name) = LOWER(?)",
                    (request.full_name.strip(),),
                ).fetchall()
            candidates = [dict(r) for r in rows]

    if not candidates:
        if request.role_hint == "teacher":
            msg = "Invalid Teacher ID or password."
        elif request.role_hint == "student":
            msg = "Invalid USN / Roll number or password."
        else:
            msg = "Invalid credentials. Check your USN/ID and password."
        raise HTTPException(status_code=401, detail=msg)

    matching_users = [
        candidate
        for candidate in candidates
        if (not request.role_hint or candidate["role"] == request.role_hint)
        and verify_password(request.password, candidate["password_hash"])
    ]
    if len(matching_users) != 1:
        if request.role_hint == "teacher":
            msg = "Invalid Teacher ID or password."
        elif request.role_hint == "student":
            msg = "Invalid USN / Roll number or password."
        else:
            msg = "Invalid credentials. Check your USN/ID and password."
        raise HTTPException(status_code=401, detail=msg)

    user = matching_users[0]

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="Account is deactivated. Contact administrator.",
        )

    token = generate_session_token()
    exp = compute_expiration(remember_me=request.remember_me)
    _store().create_auth_session(user["id"], token, exp)

    max_age = (30 if request.remember_me else 14) * 86400
    response.set_cookie(
        key="ila_session",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=max_age,
    )

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
            "class_level": user["class_level"],
            "section": user.get("section", "A"),
            "student_identifier": user["student_identifier"],
            "created_at": user["created_at"],
        },
    }


@app.api_route("/api/auth/logout", methods=["GET", "POST"])
def auth_logout(
    request: Request,
    response: Response,
    user: Annotated[dict[str, Any] | None, Depends(get_current_user_optional)] = None,
) -> dict[str, Any]:
    token = extract_token(
        ila_session=request.cookies.get("ila_session"),
        authorization=request.headers.get("authorization"),
    )
    if token:
        _store().delete_auth_session(token)
    response.delete_cookie(key="ila_session")
    return {"status": "ok", "message": "Logged out successfully"}


@app.get("/api/auth/me")
def auth_me(current_user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    return {
        "user": {
            "id": current_user["id"],
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "role": current_user["role"],
            "class_level": current_user["class_level"],
            "section": current_user.get("section", "A"),
            "student_identifier": current_user["student_identifier"],
            "created_at": current_user["created_at"],
        }
    }


# --------------------------------------------------------------------- core routes
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": __version__,
        "schema": SCHEMA_VERSION,
        "asr_loaded": REGISTRY.loaded(),
    }


@app.get("/api/config")
def config() -> dict[str, Any]:
    settings = SETTINGS
    profile = _resolved_profile(settings)
    detected = hardware.detect()
    return {
        "version": __version__,
        "schema": SCHEMA_VERSION,
        "offline": True,
        "asr": {
            "model": settings.asr.model,
            "language": settings.asr.language,
            "device": settings.asr.device,
            "compute_type": settings.asr.compute_type,
            "model_dir": str(settings.asr.model_dir),
            "local_files_only": settings.asr.local_files_only,
        },
        "notes": _notes_provider_info(settings, profile),
        "hardware": {
            "summary": detected.summary,
            "ram_gb": detected.ram_gb,
            "logical_cores": detected.logical_cores,
            "physical_cores": detected.physical_cores,
            "platform": detected.platform,
            "suggested_profile": detected.suggested_profile,
            "reason": detected.reason,
        },
        "curriculum": {
            "class_levels": list(CLASS_LEVELS),
            "subjects": list(SUBJECTS),
            "subject_labels": SUBJECT_LABELS,
            "default_class_level": settings.curriculum.class_level,
            "default_subject": settings.curriculum.subject,
            "auto_match": settings.curriculum.auto_match,
            "courses": course_catalogue(),
            "demos": demo_summaries(),
        },
        "retrieval": {
            "engine": "bm25+hashed-embeddings",
            "fusion": "lexical 0.58 / dense 0.42",
            "embedding_dim": EMBEDDING_DIM,
            "offline": True,
            "answers": "extractive with citations",
        },
        "quiz": {
            "engine": "grounded deterministic generation",
            "mastery": "bounded exponential moving average",
            "kinds": ["mcq", "short"],
            "adaptive": True,
        },
        "storage": {
            "engine": "sqlite",
            "path": str(SETTINGS.data_dir / "ila.sqlite3"),
        },
        "server": {
            "host": settings.server.host,
            "port": settings.server.port,
            "dashboard_built": DASHBOARD_DIST.is_dir(),
        },
    }


@app.get("/api/devices")
def devices() -> dict[str, Any]:
    try:
        return {"devices": list_input_devices()}
    except Exception as exc:  # pragma: no cover - hardware dependent
        return {"devices": [], "error": str(exc)}


@app.get("/api/demo")
def demo(class_level: int = 10, subject: str = "science") -> dict[str, Any]:
    level, name = _selection(class_level, subject)
    lecture, exact = find_demo(level, name)
    payload = lecture.to_dict()
    payload["exact"] = exact
    return payload


@app.get("/api/ncert-notes")
def list_ncert_notes() -> list[dict[str, Any]]:
    """List available generated NCERT study notes for Units 1, 2, and 3."""
    results = []
    unit_map = {
        1: ("Unit 1: Real Numbers", "Unit_1_Real_Numbers_Notes.md", 1),
        2: ("Unit 2: Polynomials", "Unit_2_Polynomials_Notes.md", 2),
        3: (
            "Unit 3: Pair of Linear Equations in Two Variables",
            "Unit_3_Pair_of_Linear_Equations_Notes.md",
            3,
        ),
    }
    for unit_id, (title, filename, ch_num) in unit_map.items():
        file_path = NOTES_DIR / filename
        if file_path.is_file():
            text = file_path.read_text(encoding="utf-8")
            words = len(text.split())
            results.append({
                "unit": unit_id,
                "title": title,
                "chapter": ch_num,
                "filename": filename,
                "words": words,
                "pages": round(words / 380, 1),
            })
    return results


def _parse_markdown_into_pages(markdown: str) -> list[dict[str, Any]]:
    import re
    parts = re.split(r'\n---\n\n## Section\s+(\d+\.\d+):\s*([^\n]+)', markdown)
    pages = []
    if len(parts) > 1:
        i = 1
        page_num = 1
        while i < len(parts):
            sec_id = parts[i]
            sec_title = parts[i + 1].strip()
            content = parts[i + 2].strip()
            # Clean duplicate heading if LLM repeated it
            content = re.sub(r'^#\s+[^\n]+\n+##\s+[^\n]+\n+', '', content)
            pages.append({
                "page_number": page_num,
                "section_id": sec_id,
                "title": sec_title,
                "content": content,
                "words": len(content.split()),
            })
            page_num += 1
            i += 3
    else:
        pages.append({
            "page_number": 1,
            "section_id": "1.0",
            "title": "Complete Notes",
            "content": markdown,
            "words": len(markdown.split()),
        })
    return pages


@app.get("/api/ncert-notes/{unit}")
def get_ncert_note(unit: int) -> dict[str, Any]:
    """Return the generated markdown notes and metadata for a specific unit."""
    unit_map = {
        1: ("Unit 1: Real Numbers", "Unit_1_Real_Numbers_Notes.md"),
        2: ("Unit 2: Polynomials", "Unit_2_Polynomials_Notes.md"),
        3: (
            "Unit 3: Pair of Linear Equations in Two Variables",
            "Unit_3_Pair_of_Linear_Equations_Notes.md",
        ),
    }
    if unit not in unit_map:
        raise HTTPException(status_code=404, detail=f"Unit {unit} notes not found")
    title, filename = unit_map[unit]
    file_path = NOTES_DIR / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Notes file {filename} not generated yet")
    markdown = file_path.read_text(encoding="utf-8")
    words = len(markdown.split())
    pages = _parse_markdown_into_pages(markdown)
    notes_payload = {
        "title": title,
        "summary": (
            f"Concise ~10-page NCERT study notes generated by on-device LLM "
            f"({words} words, {len(pages)} pages)."
        ),
        "points": [],
        "definitions": [],
        "keywords": ["NCERT Class 10", "Mathematics", title],
        "used_llm": True,
        "profile": "0.8B / 2B Q4",
        "model": "Qwen3.5 Local LLM",
        "dropped": 0,
        "latency_s": 168.0,
        "fallback_reason": None,
        "sentences": 10,
        "curriculum": {"course": "Class 10 Mathematics", "chapter": unit},
    }
    return {
        "unit": unit,
        "title": title,
        "word_count": words,
        "pages_est": len(pages),
        "markdown": markdown,
        "notes": notes_payload,
        "total_pages": len(pages),
        "pages": pages,
    }


@app.post("/api/notes")
async def create_notes(
    request: NotesRequest,
    current_user: Annotated[dict[str, Any] | None, Depends(require_teacher)] = None,
) -> dict[str, Any]:
    lines = _request_lines(request)
    class_level, subject = _selection(request.class_level, request.subject)
    if not any(a["class_level"] == class_level and a["subject"] == subject for a in _store().get_teacher_assigned_classes(current_user["id"])):
        raise HTTPException(403,"Select an assigned class and subject")
    settings = _request_settings(request)
    title = request.title.strip() or "Lecture notes"

    syllabus = None
    mapped_topic = None
    chapter_number = None
    correlation_score = 0.0
    matched_terms: list[str] = []

    if request.use_syllabus:
        syllabus = _syllabus_for(lines, class_level, subject)
        has_defined_chapters = bool(syllabus and getattr(syllabus.course, "chapters", ()))
        if has_defined_chapters:
            if not syllabus or not getattr(syllabus, "matches", None):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"No syllabus correlation found: The transcript does not correlate with any "
                        f"NCERT Class {class_level} {subject.capitalize()} topic. Grounded notes dropped. "
                        f"Please capture a lecture covering syllabus topics (e.g. Real Numbers, Polynomials, Linear Equations, Quadratic Equations)."
                    ),
                )
            top_match = syllabus.matches[0]
            if top_match.score < 1.5:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient syllabus correlation (score {top_match.score:.1f} < 1.5): "
                        f"The transcript has too little correlation with '{top_match.chapter.title}'. "
                        f"Grounded notes dropped. Please provide more subject-specific lecture content."
                    ),
                )
            mapped_topic = top_match.chapter.title
            chapter_number = top_match.chapter.number
            correlation_score = top_match.score
            matched_terms = list(top_match.matched_terms)
            title = f"{mapped_topic} (Class {class_level} {subject.capitalize()})"
        elif syllabus and getattr(syllabus, "matches", None):
            top = syllabus.matches[0]
            mapped_topic = top.chapter.title
            chapter_number = top.chapter.number
            correlation_score = top.score
            matched_terms = list(top.matched_terms)

    try:
        result = await asyncio.to_thread(
            _generate_notes_sync,
            settings,
            lines,
            title=title,
            profile=None if not settings.llm.enabled else request.profile,
            syllabus=syllabus,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("note generation failed")
        raise HTTPException(status_code=500, detail=f"Note generation failed: {exc}") from exc

    # Store notes along with mapped topic in SQLite storage
    transcript_text = " ".join(line.text for line in lines)
    duration_s = max(0.0, (lines[-1].end or 0.0) - (lines[0].start or 0.0)) if lines else 0.0
    user_id = current_user["id"] if current_user else None
    session_id = _store().save_session(
        title=title,
        class_level=class_level,
        subject=subject,
        lines=[line.to_dict() for line in lines],
        transcript=transcript_text,
        duration_s=duration_s,
        notes=result.to_dict(),
        markdown=result.to_markdown(),
        topic=mapped_topic,
        chapter_number=chapter_number,
        user_id=user_id,
    )

    return {
        "notes": result.to_dict(),
        "markdown": result.to_markdown(),
        "mapped_topic": mapped_topic,
        "chapter_number": chapter_number,
        "correlation_score": round(correlation_score, 2),
        "matched_terms": matched_terms,
        "session_id": session_id,
    }


@app.get("/api/lecture-notes/{chapter_number}")
def get_lecture_notes_for_unit(chapter_number: int, current_user: Annotated[dict, Depends(require_student)],
                               class_level: int=10, subject: str="maths"):
    lessons = _store().list_lessons(class_level=current_user["class_level"], section=current_user["section"],
                                    subject=subject, status="published")
    lesson = next((l for l in lessons if l["chapter_number"] == chapter_number), None)
    if not lesson:
        return {"found": False, "notes": None, "markdown": None}
    return {"found":True,"title":lesson["title"],"markdown":lesson["notes_markdown"],"notes":lesson["notes_json"]}


@app.post("/api/transcribe")
async def transcribe_upload(
    current_user: Annotated[dict, Depends(require_teacher)],
    file: Annotated[UploadFile, File()],
    class_level: Annotated[int, Form()] = 10,
    subject: Annotated[str, Form()] = "science",
    profile: Annotated[str, Form()] = "auto",
    use_llm: Annotated[bool, Form()] = True,
    title: Annotated[str, Form()] = "",
    budget_s: Annotated[float | None, Form()] = None,
) -> dict[str, Any]:
    level, name = _selection(class_level, subject)
    if not any(a["class_level"] == level and a["subject"] == name for a in _store().get_teacher_assigned_classes(current_user["id"])):
        raise HTTPException(403,"Select an assigned class and subject")
    upload_dir = _store().path.parent / "recordings" / f"class_{level}" / name / current_user["id"]
    saved = False
    upload_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "lecture.wav").suffix.lower() or ".wav"
    target = upload_dir / f"{uuid4().hex}{suffix}"

    settings = SETTINGS.model_copy(deep=True)
    settings.partials.enabled = False
    settings.llm.enabled = use_llm and profile != "extractive"
    if budget_s is not None:
        settings.llm.budget_s = budget_s

    try:
        await _stream_upload_to_path(file, target)

        result = await asyncio.to_thread(
            _transcribe_file,
            settings,
            target,
            title=title.strip() or Path(file.filename or "Lecture").stem,
            class_level=level,
            subject=name,
            profile=profile,
            use_llm=settings.llm.enabled,
        )
        saved = True
        result["audio_path"] = target.relative_to(_store().path.parent).as_posix()
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("upload transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        with contextlib.suppress(OSError):
            if not saved:
                target.unlink(missing_ok=True)


@app.post("/api/student/transcribe")
async def student_transcribe_upload(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
    file: Annotated[UploadFile, File()],
    subject: Annotated[str, Form()] = "auto",
    profile: Annotated[str, Form()] = "auto",
    use_llm: Annotated[bool, Form()] = True,
    title: Annotated[str, Form()] = "",
    lines_json: Annotated[str, Form()] = "",
) -> dict[str, Any]:
    """Transcribe student audio only if it correlates with syllabus topics, then auto-sort into its chapter."""
    enrollment = _store().get_student_enrollment(current_user["id"])
    class_level = int(enrollment.get("class_level") or current_user.get("class_level") or 10)
    section = str(enrollment.get("section") or current_user.get("section") or "A")

    suffix = Path(file.filename or "study_audio.wav").suffix.lower() or ".wav"
    tmp_target = _store().path.parent / "recordings" / "_tmp" / f"{uuid4().hex}{suffix}"
    final_target: Path | None = None
    saved = False

    settings = SETTINGS.model_copy(deep=True)
    settings.partials.enabled = False
    settings.llm.enabled = use_llm and profile != "extractive"

    try:
        await _stream_upload_to_path(file, tmp_target)
        lines: list[TranscriptLine] = []
        if lines_json.strip():
            try:
                raw_lines = json.loads(lines_json)
                if isinstance(raw_lines, list):
                    for item in raw_lines:
                        txt = str(item.get("text", "")).strip()
                        if txt:
                            lines.append(
                                TranscriptLine(
                                    text=txt,
                                    start=item.get("start"),
                                    end=item.get("end"),
                                )
                            )
            except Exception:
                lines = []

        if lines:
            last_end = lines[-1].end or 0.0
            first_start = lines[0].start or 0.0
            duration_s = max(0.0, float(last_end) - float(first_start))
            asr_info = {"model": settings.asr.model}
        else:
            lines, duration_s, asr_info = await asyncio.to_thread(
                _transcribe_audio_lines, settings, tmp_target
            )

        matched_subject, syllabus_ctx, top_match = _match_student_audio_to_syllabus(
            lines, class_level, subject
        )
        chapter_number = int(top_match.chapter.number)
        chapter_title = str(top_match.chapter.title)
        matched_terms = list(top_match.matched_terms)
        correlation_score = round(float(top_match.score), 2)
        lesson_title = title.strip() or f"{chapter_title} — Self-Study Notes"

        notes_error: str | None = None
        notes_dict: dict[str, Any] = {}
        markdown = ""
        try:
            note_result = await asyncio.to_thread(
                _generate_notes_sync,
                settings,
                lines,
                title=lesson_title,
                profile=profile if settings.llm.enabled else None,
                syllabus=syllabus_ctx,
            )
            notes_dict = note_result.to_dict()
            markdown = note_result.to_markdown()
        except Exception as exc:
            logger.exception("student note generation failed after transcription")
            notes_error = str(exc)

        final_dir = _store().path.parent / "recordings" / f"class_{class_level}" / matched_subject / current_user["id"]
        final_dir.mkdir(parents=True, exist_ok=True)
        final_target = final_dir / tmp_target.name
        shutil.move(str(tmp_target), str(final_target))

        transcript_text = " ".join(line.text for line in lines)
        rel_audio_path = final_target.relative_to(_store().path.parent).as_posix()
        lesson_id = _store().create_lesson(
            title=lesson_title,
            class_level=class_level,
            section=section,
            subject=matched_subject,
            chapter_number=chapter_number,
            chapter_title=chapter_title,
            teacher_id=current_user["id"],
            teaching_date=date.today().isoformat(),
            transcript=transcript_text,
            notes_markdown=markdown,
            notes_json=notes_dict,
            duration_s=round(duration_s, 2),
            audio_filename=file.filename,
            audio_path=rel_audio_path,
            status="student_private",
        )
        saved = True

        _emit_realtime_event(
            "student_lesson_created",
            class_level=class_level,
            target_user_id=current_user["id"],
            data={"lesson_id": lesson_id, "subject": matched_subject, "chapter_number": chapter_number},
        )
        return {
            "lesson_id": lesson_id,
            "title": lesson_title,
            "subject": matched_subject,
            "subject_label": SUBJECT_LABELS.get(matched_subject, matched_subject.title()),
            "chapter_number": chapter_number,
            "chapter_title": chapter_title,
            "correlation_score": correlation_score,
            "matched_terms": matched_terms,
            "lines": [line.to_dict() for line in lines],
            "transcript": transcript_text,
            "duration_s": round(duration_s, 2),
            "asr": asr_info,
            "notes": notes_dict,
            "markdown": markdown,
            "notes_error": notes_error,
            "audio_path": rel_audio_path,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("student upload transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        with contextlib.suppress(OSError):
            if not saved:
                tmp_target.unlink(missing_ok=True)
                if final_target is not None:
                    final_target.unlink(missing_ok=True)


def _iter_file_caption_queue(
    settings: Settings,
    path: Path,
    queue: asyncio.Queue[Any],
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Run CaptionPipeline on a file and push live partial/final events into ``queue``."""
    try:
        with TRANSCRIBE_LOCK:
            asr = REGISTRY.get(settings)
            source = FileSource(
                path,
                sample_rate=settings.audio.sample_rate,
                block_ms=settings.audio.block_ms,
                realtime=False,
            )
            try:
                pipeline = CaptionPipeline.from_settings(settings, source, asr)
                events: list[CaptionEvent] = []
                for event in pipeline.events():
                    loop.call_soon_threadsafe(queue.put_nowait, ("event", event))
                    if event.final:
                        events.append(event)
                duration_s = source.duration_s
            finally:
                source.close()
        lines = lines_from_events(events)
        if not lines:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ("error", 400, "No speech was detected in the uploaded file"),
            )
        else:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ("asr_done", lines, duration_s, asr.info.to_dict()),
            )
    except Exception as exc:
        logger.exception("streaming file transcription failed")
        loop.call_soon_threadsafe(queue.put_nowait, ("error", 500, str(exc)))


def _ndjson(payload: dict[str, Any]) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


@app.post("/api/transcribe/stream")
async def transcribe_upload_stream(
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
    file: Annotated[UploadFile, File()],
    class_level: Annotated[int, Form()] = 10,
    subject: Annotated[str, Form()] = "science",
) -> StreamingResponse:
    """Stream real-time partial and final transcript lines while transcribing a teacher audio upload."""
    level, name = _selection(class_level, subject)
    if not any(
        a["class_level"] == level and a["subject"] == name
        for a in _store().get_teacher_assigned_classes(current_user["id"])
    ):
        raise HTTPException(403, "Select an assigned class and subject")

    upload_dir = _store().path.parent / "recordings" / f"class_{level}" / name / current_user["id"]
    suffix = Path(file.filename or "lecture.wav").suffix.lower() or ".wav"
    target = upload_dir / f"{uuid4().hex}{suffix}"
    await _stream_upload_to_path(file, target)

    settings = SETTINGS.model_copy(deep=True)
    settings.partials.enabled = True
    settings.partials.after_s = min(settings.partials.after_s, 0.8)
    settings.partials.interval_s = min(settings.partials.interval_s, 1.0)
    settings.llm.enabled = False

    async def event_generator():
        saved = False
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Any] = asyncio.Queue()
        try:
            yield _ndjson({"type": "status", "stage": "transcribing"})
            task = asyncio.create_task(
                asyncio.to_thread(_iter_file_caption_queue, settings, target, queue, loop)
            )
            lines: list[TranscriptLine] = []
            duration_s = 0.0
            asr_info: dict[str, Any] = {}
            while True:
                kind, *rest = await queue.get()
                if kind == "event":
                    ev: CaptionEvent = rest[0]
                    yield _ndjson(ev.to_dict())
                elif kind == "error":
                    status_code, detail = rest
                    yield _ndjson({"type": "error", "status_code": status_code, "detail": detail})
                    await task
                    return
                elif kind == "asr_done":
                    lines, duration_s, asr_info = rest
                    break
            await task
            saved = True
            yield _ndjson({
                "type": "done",
                "lines": [line.to_dict() for line in lines],
                "transcript": " ".join(line.text for line in lines),
                "duration_s": round(duration_s, 2),
                "asr": asr_info,
                "audio_path": target.relative_to(_store().path.parent).as_posix(),
            })
        finally:
            with contextlib.suppress(OSError):
                if not saved:
                    target.unlink(missing_ok=True)

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.post("/api/student/transcribe/stream")
async def student_transcribe_upload_stream(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
    file: Annotated[UploadFile, File()],
    subject: Annotated[str, Form()] = "auto",
    profile: Annotated[str, Form()] = "auto",
    use_llm: Annotated[bool, Form()] = True,
    title: Annotated[str, Form()] = "",
    lines_json: Annotated[str, Form()] = "",
) -> StreamingResponse:
    """Stream real-time ASR lines for a student upload, reject off-topic audio, and auto-sort into chapter."""
    enrollment = _store().get_student_enrollment(current_user["id"])
    class_level = int(enrollment.get("class_level") or current_user.get("class_level") or 10)
    section = str(enrollment.get("section") or current_user.get("section") or "A")

    suffix = Path(file.filename or "study_audio.wav").suffix.lower() or ".wav"
    tmp_target = _store().path.parent / "recordings" / "_tmp" / f"{uuid4().hex}{suffix}"
    await _stream_upload_to_path(file, tmp_target)

    settings = SETTINGS.model_copy(deep=True)
    settings.partials.enabled = True
    settings.partials.after_s = min(settings.partials.after_s, 0.8)
    settings.partials.interval_s = min(settings.partials.interval_s, 1.0)
    settings.llm.enabled = use_llm and profile != "extractive"

    precomputed_lines: list[TranscriptLine] = []
    if lines_json.strip():
        try:
            raw_lines = json.loads(lines_json)
            if isinstance(raw_lines, list):
                for item in raw_lines:
                    txt = str(item.get("text", "")).strip()
                    if txt:
                        precomputed_lines.append(
                            TranscriptLine(
                                text=txt,
                                start=item.get("start"),
                                end=item.get("end"),
                            )
                        )
        except Exception:
            precomputed_lines = []

    async def event_generator():
        saved = False
        final_target: Path | None = None
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Any] = asyncio.Queue()
        try:
            lines: list[TranscriptLine] = []
            duration_s = 0.0
            asr_info: dict[str, Any] = {"model": settings.asr.model}

            if precomputed_lines:
                lines = precomputed_lines
                last_end = lines[-1].end or 0.0
                first_start = lines[0].start or 0.0
                duration_s = max(0.0, float(last_end) - float(first_start))
            else:
                yield _ndjson({"type": "status", "stage": "transcribing"})
                task = asyncio.create_task(
                    asyncio.to_thread(_iter_file_caption_queue, settings, tmp_target, queue, loop)
                )
                while True:
                    kind, *rest = await queue.get()
                    if kind == "event":
                        ev: CaptionEvent = rest[0]
                        yield _ndjson(ev.to_dict())
                    elif kind == "error":
                        status_code, detail = rest
                        yield _ndjson({"type": "error", "status_code": status_code, "detail": detail})
                        await task
                        return
                    elif kind == "asr_done":
                        lines, duration_s, asr_info = rest
                        break
                await task

            try:
                matched_subject, syllabus_ctx, top_match = _match_student_audio_to_syllabus(
                    lines, class_level, subject
                )
            except HTTPException as exc:
                yield _ndjson({"type": "error", "status_code": exc.status_code, "detail": exc.detail})
                return

            chapter_number = int(top_match.chapter.number)
            chapter_title = str(top_match.chapter.title)
            matched_terms = list(top_match.matched_terms)
            correlation_score = round(float(top_match.score), 2)
            lesson_title = title.strip() or f"{chapter_title} — Self-Study Notes"

            yield _ndjson({
                "type": "status",
                "stage": "generating_notes",
                "subject": matched_subject,
                "subject_label": SUBJECT_LABELS.get(matched_subject, matched_subject.title()),
                "chapter_number": chapter_number,
                "chapter_title": chapter_title,
                "correlation_score": correlation_score,
                "matched_terms": matched_terms,
            })

            notes_error: str | None = None
            notes_dict: dict[str, Any] = {}
            markdown = ""
            try:
                note_result = await asyncio.to_thread(
                    _generate_notes_sync,
                    settings,
                    lines,
                    title=lesson_title,
                    profile=profile if settings.llm.enabled else None,
                    syllabus=syllabus_ctx,
                )
                notes_dict = note_result.to_dict()
                markdown = note_result.to_markdown()
            except Exception as exc:
                logger.exception("student note generation failed after streaming transcription")
                notes_error = str(exc)

            final_dir = _store().path.parent / "recordings" / f"class_{class_level}" / matched_subject / current_user["id"]
            final_dir.mkdir(parents=True, exist_ok=True)
            final_target = final_dir / tmp_target.name
            shutil.move(str(tmp_target), str(final_target))

            transcript_text = " ".join(line.text for line in lines)
            rel_audio_path = final_target.relative_to(_store().path.parent).as_posix()
            lesson_id = _store().create_lesson(
                title=lesson_title,
                class_level=class_level,
                section=section,
                subject=matched_subject,
                chapter_number=chapter_number,
                chapter_title=chapter_title,
                teacher_id=current_user["id"],
                teaching_date=date.today().isoformat(),
                transcript=transcript_text,
                notes_markdown=markdown,
                notes_json=notes_dict,
                duration_s=round(duration_s, 2),
                audio_filename=file.filename,
                audio_path=rel_audio_path,
                status="student_private",
            )
            saved = True
            _emit_realtime_event(
                "student_lesson_created",
                class_level=class_level,
                target_user_id=current_user["id"],
                data={"lesson_id": lesson_id, "subject": matched_subject, "chapter_number": chapter_number},
            )
            yield _ndjson({
                "type": "done",
                "lesson_id": lesson_id,
                "title": lesson_title,
                "subject": matched_subject,
                "subject_label": SUBJECT_LABELS.get(matched_subject, matched_subject.title()),
                "chapter_number": chapter_number,
                "chapter_title": chapter_title,
                "correlation_score": correlation_score,
                "matched_terms": matched_terms,
                "lines": [line.to_dict() for line in lines],
                "transcript": transcript_text,
                "duration_s": round(duration_s, 2),
                "asr": asr_info,
                "notes": notes_dict,
                "markdown": markdown,
                "notes_error": notes_error,
                "audio_path": rel_audio_path,
            })
        finally:
            with contextlib.suppress(OSError):
                if not saved:
                    tmp_target.unlink(missing_ok=True)
                    if final_target is not None:
                        final_target.unlink(missing_ok=True)

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


# ------------------------------------------------------------------ Q&A
@app.post("/api/ask")
async def ask_question(request: AskRequest, current_user: Annotated[dict, Depends(require_student)]) -> dict[str, Any]:
    """Answer from the current transcript, a saved session, or the built-in demo."""
    if request.session_id:
        get_session(request.session_id, current_user)
    if request.class_level and request.class_level != current_user["class_level"]:
        raise HTTPException(403, "This class is outside your enrollment")
    level, name = _selection(request.class_level, request.subject)
    norm_chapter = request.chapter if request.chapter and request.chapter > 0 else None
    if not request.lines and not request.text and not request.session_id:
        lessons = _store().list_lessons(
            class_level=current_user["class_level"],
            subject=name,
            status="published",
        )
        combined_lessons = "\n".join(
            l["transcript"] + "\n" + l["notes_markdown"]
            for l in lessons
            if not norm_chapter or l["chapter_number"] == norm_chapter
        ).strip()
        if combined_lessons:
            request.text = combined_lessons
    cache_key = None
    if not request.lines and not request.text and not request.session_id:
        norm_q = re.sub(r"[^a-z0-9\s]", "", request.question.strip().lower())
        norm_q = " ".join(norm_q.split())
        cache_key = (
            norm_q,
            level,
            name,
            norm_chapter,
            bool(request.use_llm),
            request.profile or "default",
        )
        if cache_key in _QA_CACHE:
            cached = dict(_QA_CACHE[cache_key])
            cached["latency_s"] = 0.008
            return cached

    knowledge, meta = _knowledge_base(
        lines=request.lines,
        text=request.text,
        session_id=request.session_id,
        class_level=level,
        subject=name,
    )
    llm = _ask_llm_provider(request.profile) if request.use_llm else None
    engine = AnswerEngine(
        knowledge,
        min_score=request.min_score if request.min_score is not None else 0.16,
        top_k=request.top_k,
        llm=llm,
    )
    answer = await asyncio.to_thread(
        engine.ask,
        request.question,
        use_llm=request.use_llm and llm is not None,
        chapter=norm_chapter,
    )
    payload = answer.to_dict()
    payload["source"] = meta
    payload["course"] = knowledge.course.label if knowledge.course else None
    payload["chapter_matches"] = [
        match.to_dict() for match in knowledge.chapter_matches
    ]
    if cache_key is not None and payload.get("answerable") and payload.get("answer"):
        if len(_QA_CACHE) > 200:
            _QA_CACHE.clear()
        _QA_CACHE[cache_key] = payload
    return payload


# ------------------------------------------------------------------ quizzes
@app.post("/api/quiz/start")
def start_quiz(
    request: QuizStartRequest,
    current_user: Annotated[dict[str, Any] | None, Depends(require_student)] = None,
) -> dict[str, Any]:
    if request.session_id:
        get_session(request.session_id, current_user)
    if request.class_level and request.class_level != current_user["class_level"]:
        raise HTTPException(403, "This class is outside your enrollment")
    if request.lesson_id:
        lesson = _published_lesson(request.lesson_id,current_user)
        request.class_level, request.subject = lesson["class_level"], lesson["subject"]
        request.lines, request.session_id = [], None
        request.text = lesson["transcript"] + "\n" + lesson["notes_markdown"]
    elif request.chapter_number:
        lvl, subj_norm = _selection(request.class_level, request.subject)
        material = _store().list_lessons(
            class_level=current_user["class_level"], subject=subj_norm, status="published"
        )
        combined_ch = "\n".join(
            l["transcript"] for l in material if l["chapter_number"] == request.chapter_number
        ).strip()
        if combined_ch:
            request.text = combined_ch
        elif lvl == 10 and subj_norm == "maths":
            course = get_course(lvl, subj_norm)
            ch = course.chapter(request.chapter_number)
            if ch is None:
                raise HTTPException(404, "Chapter not found in Class 10 Mathematics")
            if not request.topic:
                request.topic = ch.title
        else:
            raise HTTPException(404, "No published lectures for this chapter")
    level, name = _selection(request.class_level, request.subject)
    knowledge, meta = _knowledge_base(
        lines=request.lines,
        text=request.text,
        session_id=request.session_id,
        class_level=level,
        subject=name,
    )
    pool = build_question_bank(knowledge)
    if not pool:
        raise HTTPException(
            status_code=400,
            detail=(
                "No grounded questions could be generated from this transcript. "
                "Try a demo lecture with definitions, or record a longer session."
            ),
        )
    student_id = request.student_id
    if current_user and current_user.get("role") == "student":
        student_id = current_user.get("student_identifier") or current_user["id"]

    engine = QuizEngine(_store())
    try:
        result = engine.start(
            knowledge,
            student_id=student_id,
            class_level=level,
            subject=name,
            topic=request.topic,
            length=request.length,
            difficulty=request.difficulty,
            pool=pool,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result["source"] = meta
    if request.lesson_id:
        with _store()._connection() as db:
            db.execute("INSERT INTO lesson_quizzes VALUES (?,?,?)",(result["quiz_id"],request.lesson_id,current_user["id"]))
    result["topics"] = sorted({question.topic for question in pool})
    return result


@app.post("/api/quiz/answer")
def answer_quiz(
    request: QuizAnswerRequest,
    current_user: Annotated[dict[str, Any] | None, Depends(require_student)] = None,
) -> dict[str, Any]:
    if current_user and current_user.get("role") == "student":
        quiz_data = _store().get_quiz(request.quiz_id)
        if quiz_data:
            s_id = current_user.get("student_identifier") or current_user["id"]
            if quiz_data["student_id"] not in (s_id, current_user["id"]):
                raise HTTPException(
                    status_code=403, detail="Forbidden: You cannot answer another student's quiz."
                )

    llm = _ask_llm_provider()
    engine = QuizEngine(_store(), llm=llm)
    try:
        result = engine.answer(
            request.quiz_id,
            question_id=request.question_id,
            answer=request.answer,
            answer_index=request.answer_index,
            response_ms=request.response_ms,
        )
        if result["completed"]:
            with _store()._connection() as db:
                link = db.execute("SELECT lesson_id FROM lesson_quizzes WHERE quiz_id=? AND student_id=?",
                                  (request.quiz_id,current_user["id"])).fetchone()
            if link:
                _store().record_lesson_activity(current_user["id"],link[0],"quiz_completed",{"score":result["progress"]["score"]})
        _emit_realtime_event(
            "quiz_updated",
            class_level=current_user.get("class_level") if current_user else None,
            target_user_id=current_user["id"] if current_user else None,
            roles=("teacher", "student"),
            data={"quiz_id": request.quiz_id, "completed": bool(result.get("completed"))},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/students/{student_id}/gaps")
def student_gaps(
    student_id: str,
    limit: int = 5,
    current_user: Annotated[dict[str, Any] | None, Depends(require_student)] = None,
) -> dict[str, Any]:
    if current_user and current_user.get("role") == "student":
        auth_id = current_user.get("student_identifier") or current_user["id"]
        if student_id not in (auth_id, current_user["id"]):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: You cannot view another student's knowledge gaps.",
            )
    return QuizEngine(_store()).gaps(student_id, limit=max(1, min(limit, 20)))


# ------------------------------------------------------------------ auto-remediation
@app.post("/api/remediation/generate")
async def generate_remediation(
    request: RemediationGenerateRequest,
    current_user: Annotated[dict[str, Any] | None, Depends(require_student)] = None,
) -> dict[str, Any]:
    from ila.remediation import AutoRemediationEngine

    student_id = request.student_id
    if current_user and current_user.get("role") == "student":
        student_id = current_user.get("student_identifier") or current_user["id"]

    if request.session_id:
        get_session(request.session_id, current_user)
    if request.class_level and request.class_level != current_user["class_level"]:
        raise HTTPException(403, "This class is outside your enrollment")
    level, name = _selection(request.class_level, request.subject)
    knowledge, meta = _knowledge_base(
        lines=request.lines,
        text=request.text,
        session_id=request.session_id,
        class_level=level,
        subject=name,
    )
    llm = _ask_llm_provider()
    engine = AutoRemediationEngine(_store(), llm=llm)
    result = await asyncio.to_thread(
        engine.generate_remediation_pack,
        knowledge,
        student_id=student_id,
        topic=request.topic,
        count=request.count,
    )
    result["source"] = meta
    return result


@app.post("/api/remediation/submit")
def submit_remediation(
    request: RemediationAnswerRequest,
    current_user: Annotated[dict[str, Any] | None, Depends(require_student)] = None,
) -> dict[str, Any]:
    from ila.remediation import AutoRemediationEngine

    student_id = request.student_id
    if current_user and current_user.get("role") == "student":
        student_id = current_user.get("student_identifier") or current_user["id"]

    pack = _store().get_quiz(request.pack_id)
    if not pack or pack["student_id"] not in (student_id,current_user["id"]):
        raise HTTPException(404,"Remediation pack unavailable")
    llm = _ask_llm_provider()
    engine = AutoRemediationEngine(_store(), llm=llm)
    try:
        return engine.evaluate_remediation_answer(
            pack_id=request.pack_id,
            student_id=student_id,
            item_id=request.item_id,
            answer=request.answer,
            selected_index=request.selected_index,
            response_ms=request.response_ms,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ------------------------------------------------------------------ academic hierarchy routes
@app.get("/api/classes")
def api_get_classes() -> list[dict[str, Any]]:
    return _store().get_classes()


@app.get("/api/classes/{class_level}/subjects")
def api_get_class_subjects(class_level: int) -> list[dict[str, Any]]:
    return _store().get_subjects(class_level)


@app.get("/api/classes/{class_level}/subjects/{subject}/chapters")
def api_get_class_chapters(class_level: int, subject: str) -> list[dict[str, Any]]:
    return _store().get_chapters(class_level, subject)


@app.get("/api/classes/{class_level}/timetable")
def api_get_class_timetable(class_level: int, section: str = "A") -> list[dict[str, Any]]:
    return _store().get_timetable(class_level, section)


# ------------------------------------------------------------------ student workspace
@app.get("/api/student/overview")
def get_student_overview(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    student_id = current_user.get("student_identifier") or current_user["id"]
    data = _store().student_overview(student_id=student_id, user_id=current_user["id"])
    data["full_name"] = current_user.get("full_name")
    data["class_level"] = current_user.get("class_level", 10)
    data["section"] = current_user.get("section", "A")
    data["email"] = current_user.get("email")

    # Enrich with today's published lessons, timetable, and notifications
    enrollment = _store().get_student_enrollment(current_user["id"])
    class_level = enrollment.get("class_level", 10)
    section = enrollment.get("section", "A")

    today_lessons = _store().list_lessons(
        class_level=class_level,
        status="published",
        limit=6,
    )
    timetable = _store().get_timetable(class_level, section)
    notifications = _store().get_user_notifications(current_user["id"], unread_only=False)

    from datetime import date
    from datetime import datetime
    data["today_lessons"] = [lesson for lesson in today_lessons if lesson.get("published_at")
                             and datetime.fromisoformat(lesson["published_at"]).astimezone().date() == date.today()]
    data["recent_notes"] = today_lessons
    with _store()._connection() as db:
        year = db.execute("SELECT academic_year FROM academic_classes WHERE class_level=?",(class_level,)).fetchone()
        data["academic_year"] = year[0] if year else None
        data["assignments"] = [dict(r) for r in db.execute("""SELECT title,subject,due_date FROM assignments
            WHERE class_level=? AND section=? AND due_date>=? ORDER BY due_date LIMIT 10""",
            (class_level,section,date.today().isoformat()))]
        data["pending_quizzes"] = [dict(r) for r in db.execute("""SELECT l.id,l.title FROM lessons l
            LEFT JOIN lesson_completions c ON l.id=c.lesson_id AND c.student_id=?
            WHERE l.status='published' AND l.class_level=? AND coalesce(c.quiz_completed,0)=0
            ORDER BY l.published_at DESC LIMIT 10""",(current_user["id"],class_level))]
    data["timetable"] = timetable
    data["notifications"] = notifications
    return data


@app.get("/api/student/progress")
def get_student_progress(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    student_id = current_user.get("student_identifier") or current_user["id"]
    data = _store().student_progress(student_id=student_id, user_id=current_user["id"])
    data["full_name"] = current_user.get("full_name")
    data["class_level"] = current_user.get("class_level", 10)
    data["section"] = current_user.get("section", "A")
    return data


@app.get("/api/student/subjects")
def student_subjects(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> list[dict[str, Any]]:
    enrollment = _store().get_student_enrollment(current_user["id"])
    class_level = enrollment.get("class_level", 10)
    section = enrollment.get("section", "A")
    return _store().get_student_subjects_tree(current_user["id"], class_level, section)


def _published_lesson(lesson_id, current_user):
    lesson = _store().get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found or not yet published by teacher")

    is_own_private = lesson.get("status") == "student_private" and lesson.get("teacher_id") == current_user["id"]
    if lesson.get("status") != "published" and not is_own_private:
        raise HTTPException(status_code=404, detail="Lesson not found or not yet published by teacher")

    enrollment = _store().get_student_enrollment(current_user["id"])
    user_level = enrollment.get("class_level", 10)
    if lesson["class_level"] != user_level:
        raise HTTPException(status_code=403, detail="Forbidden: Lesson is not for your class")

    return lesson


@app.get("/api/student/lessons/{lesson_id}")
def student_lesson_detail(
    lesson_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    lesson = _published_lesson(lesson_id,current_user)
    _store().record_lesson_activity(current_user["id"], lesson_id, "opened", {"lesson_title": lesson["title"]})
    completion = _store().get_lesson_completion(current_user["id"], lesson_id)
    _emit_realtime_event(
        "student_activity",
        class_level=lesson["class_level"],
        target_user_id=current_user["id"],
        roles=("teacher",),
        data={"lesson_id": lesson_id, "event_type": "opened"},
    )
    return {
        "lesson": lesson,
        "completion": completion,
    }


@app.post("/api/student/lessons/{lesson_id}/activity")
def student_record_activity(
    lesson_id: str,
    request: LessonActivityRequest,
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    lesson = _published_lesson(lesson_id,current_user)
    _store().record_lesson_activity(current_user["id"], lesson_id, request.event_type, {k:v for k,v in (request.metadata or {}).items() if k != "score"})
    _emit_realtime_event(
        "student_activity",
        class_level=lesson["class_level"],
        target_user_id=current_user["id"],
        roles=("teacher",),
        data={"lesson_id": lesson_id, "event_type": request.event_type},
    )
    return {"status": "ok"}


@app.post("/api/student/lessons/{lesson_id}/complete")
def student_mark_lesson_complete(
    lesson_id: str,
    request: LessonCompleteRequest,
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    lesson = _published_lesson(lesson_id,current_user)
    completion = _store().mark_lesson_completed(current_user["id"], lesson_id, request.completed)
    _emit_realtime_event(
        "student_activity",
        class_level=lesson["class_level"],
        target_user_id=current_user["id"],
        roles=("teacher", "student"),
        data={"lesson_id": lesson_id, "event_type": "completed", "completed": request.completed},
    )
    return completion


@app.get("/api/student/notifications")
def student_notifications(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> list[dict[str, Any]]:
    return _store().get_user_notifications(current_user["id"])


@app.post("/api/student/notifications/{notification_id}/read")
def student_mark_notification_read(
    notification_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    success = _store().mark_notification_read(notification_id, current_user["id"])
    return {"status": "ok" if success else "not_found"}


@app.get("/api/student/practice")
def student_practice(
    current_user: Annotated[dict[str, Any], Depends(require_student)],
) -> dict[str, Any]:
    enrollment = _store().get_student_enrollment(current_user["id"])
    return _store().get_student_practice_data(current_user.get("student_identifier") or current_user["id"], enrollment.get("class_level"))


# ------------------------------------------------------------------ teacher dashboard
@app.get("/api/teacher/overview")
def teacher_overview(
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    ov = _store().teacher_overview()
    assigned = _store().get_teacher_assigned_classes(current_user["id"])
    t_lessons = _store().list_lessons(teacher_id=current_user["id"])
    ov["assigned_classes"] = assigned
    ov["total_published_lessons"] = sum(1 for l in t_lessons if l.get("status") == "published")
    ov["lessons_awaiting_review"] = sum(1 for l in t_lessons if l.get("status") == "ready_for_review")
    ov["draft_lessons"] = sum(1 for l in t_lessons if l.get("status") == "draft")
    # Lesson-based student activity log (has event_type, lesson_title, etc.)
    ov["recent_activity"] = _store().get_student_activity_log(limit=10)
    # Provide a proper list for students_needing_attention (not just the count)
    ov["students_needing_attention_list"] = _store().get_students_needing_attention(
        teacher_id=current_user["id"]
    )
    # class_accuracy field for the KPI tile
    ov["class_accuracy"] = ov.get("overall_accuracy", 0.0)
    return ov


@app.get("/api/teacher/classes")
def teacher_classes(
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> list[dict[str, Any]]:
    assigned = _store().get_teacher_assigned_classes(current_user["id"])
    result = []
    for item in assigned:
        level = item["class_level"]
        sec = item["section"]
        subj = item["subject"]
        students = _store().get_teacher_students_for_class(level, sec)
        chapters = _store().get_chapters(level, subj)
        timetable = _store().get_timetable(level, sec)
        lessons = _store().list_lessons(class_level=level, section=sec, subject=subj, teacher_id=current_user["id"])
        result.append({
            "class_level": level,
            "section": sec,
            "subject": subj,
            "subject_label": SUBJECT_LABELS.get(subj, subj.capitalize()),
            "students_count": len(students),
            "students": students,
            "chapters": chapters,
            "timetable": timetable,
            "lessons": lessons,
        })
    return result


@app.get("/api/teacher/lessons")
def teacher_lessons(
    class_level: int | None = None,
    section: str | None = None,
    subject: str | None = None,
    status: str | None = None,
    search: str | None = None,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)] = None,
) -> list[dict[str, Any]]:
    if class_level is not None and not _store().is_teacher_authorized_for_class(current_user["id"], class_level, section):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this class")
    return _store().list_lessons(
        class_level=class_level,
        section=section,
        subject=subject,
        status=status,
        teacher_id=current_user["id"] if current_user.get("role") != "admin" else None,
        search=search,
    )


@app.post("/api/teacher/lessons")
def teacher_create_lesson(
    request: LessonCreateRequest,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    if not any(a["class_level"] == request.class_level and a["section"] == request.section and a["subject"] == request.subject for a in _store().get_teacher_assigned_classes(current_user["id"])):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this class")
    if request.status not in ("draft","ready_for_review"):
        raise HTTPException(422, "Save a draft before publishing")
    lesson_id = _store().create_lesson(
        title=request.title,
        class_level=request.class_level,
        section=request.section,
        subject=request.subject,
        chapter_number=request.chapter_number,
        chapter_title=request.chapter_title,
        teacher_id=current_user["id"],
        teaching_date=request.teaching_date,
        transcript=request.transcript,
        notes_markdown=request.notes_markdown,
        notes_json=request.notes_json,
        key_concepts=request.key_concepts,
        examples=request.examples,
        duration_s=request.duration_s,
        audio_filename=request.audio_filename,
        audio_path=request.audio_path,
        status=request.status,
    )
    return {"lesson_id": lesson_id, "status": request.status, "message": "Lesson successfully created"}


@app.get("/api/teacher/lessons/{lesson_id}")
def teacher_get_lesson(
    lesson_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    lesson = _store().get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson["teacher_id"] != current_user["id"] or not any(
        a["class_level"] == lesson["class_level"] and a["section"] == lesson["section"] and a["subject"] == lesson["subject"]
        for a in _store().get_teacher_assigned_classes(current_user["id"])
    ):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this lesson's class")
    return lesson


@app.put("/api/teacher/lessons/{lesson_id}")
def teacher_update_lesson(
    lesson_id: str,
    request: LessonUpdateRequest,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    lesson = _store().get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson["teacher_id"] != current_user["id"] or not any(
        a["class_level"] == lesson["class_level"] and a["section"] == lesson["section"] and a["subject"] == lesson["subject"]
        for a in _store().get_teacher_assigned_classes(current_user["id"])
    ):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this lesson's class")
    if request.status == "published":
        raise HTTPException(422, "Use the lesson publication action")
    success = _store().update_lesson(
        lesson_id,
        title=request.title,
        transcript=request.transcript,
        notes_markdown=request.notes_markdown,
        notes_json=request.notes_json,
        key_concepts=request.key_concepts,
        examples=request.examples,
        status=request.status,
        duration_s=request.duration_s,
        audio_filename=request.audio_filename,
        audio_path=request.audio_path,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update lesson")
    _emit_realtime_event(
        "lesson_updated",
        class_level=lesson["class_level"],
        target_user_id=current_user["id"],
        roles=("student", "teacher"),
        data={"lesson_id": lesson_id},
    )
    return {"status": "ok", "message": "Lesson updated successfully"}


@app.post("/api/teacher/lessons/{lesson_id}/publish")
def teacher_publish_lesson(
    lesson_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    lesson = _store().get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson["teacher_id"] != current_user["id"] or not any(
        a["class_level"] == lesson["class_level"] and a["section"] == lesson["section"] and a["subject"] == lesson["subject"]
        for a in _store().get_teacher_assigned_classes(current_user["id"])
    ):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this lesson's class")
    if not lesson["transcript"].strip() or not lesson["notes_markdown"].strip():
        raise HTTPException(422, "Review the transcript and notes before publishing")
    published = _store().publish_lesson(lesson_id, current_user["id"])
    _emit_realtime_event(
        "lesson_published",
        class_level=lesson["class_level"],
        target_user_id=current_user["id"],
        roles=("student", "teacher"),
        data={"lesson_id": lesson_id, "subject": lesson["subject"], "chapter_number": lesson["chapter_number"]},
    )
    return {
        "status": "published",
        "lesson": published,
        "message": f"Lesson '{lesson['title']}' published to Class {lesson['class_level']}{lesson['section']}",
    }


@app.post("/api/teacher/lessons/{lesson_id}/archive")
def teacher_archive_lesson(
    lesson_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    lesson = _store().get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson["teacher_id"] != current_user["id"] or not any(
        a["class_level"] == lesson["class_level"] and a["section"] == lesson["section"] and a["subject"] == lesson["subject"]
        for a in _store().get_teacher_assigned_classes(current_user["id"])
    ):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this lesson's class")
    _store().archive_lesson(lesson_id, current_user["id"])
    _emit_realtime_event(
        "lesson_archived",
        class_level=lesson["class_level"],
        target_user_id=current_user["id"],
        roles=("student", "teacher"),
        data={"lesson_id": lesson_id},
    )
    return {"status": "archived", "message": "Lesson archived"}


@app.post("/api/teacher/lessons/{lesson_id}/regenerate-notes")
def teacher_regenerate_notes(
    lesson_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    lesson = _store().get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if lesson["teacher_id"] != current_user["id"] or not any(
        a["class_level"] == lesson["class_level"] and a["section"] == lesson["section"] and a["subject"] == lesson["subject"]
        for a in _store().get_teacher_assigned_classes(current_user["id"])
    ):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this lesson's class")
    transcript = lesson.get("transcript", "")
    if not transcript or not transcript.strip():
        raise HTTPException(status_code=400, detail="Lesson has no transcript to generate notes from")

    lines = lines_from_text(transcript)
    settings = SETTINGS.model_copy(deep=True)
    provider = LLM_REGISTRY.get(settings, profile="auto")
    generator = NotesGenerator(provider)
    syllabus_ctx = _syllabus_for(lines, lesson["class_level"], lesson["subject"])
    note_result = generator.generate(lines, title=lesson["title"], syllabus=syllabus_ctx)
    markdown = note_result.to_markdown()

    _store().update_lesson(
        lesson_id,
        notes_markdown=markdown,
        notes_json=note_result.to_dict(),
        status="ready_for_review",
    )
    return {
        "status": "ready_for_review",
        "notes_markdown": markdown,
        "notes_json": note_result.to_dict(),
        "message": "Structured notes successfully generated and saved for review",
    }


@app.get("/api/teacher/activity")
def teacher_activity(
    class_level: int | None = None,
    section: str | None = None,
    student_id: str | None = None,
    limit: int = 50,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)] = None,
) -> list[dict[str, Any]]:
    if class_level is not None and not _store().is_teacher_authorized_for_class(current_user["id"], class_level, section):
        raise HTTPException(status_code=403, detail="Forbidden: You are not assigned to manage this class")
    return _store().get_student_activity_log(
        class_level=class_level,
        section=section,
        student_id=student_id,
        limit=limit,
    )


@app.get("/api/teacher/students")
def teacher_students(
    search: str | None = None,
    class_level: int | None = None,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)] = None,
) -> dict[str, Any]:
    detailed = _store().list_students_detailed(search=search, class_filter=class_level)
    legacy_list = _store().list_students()
    return {
        "students": legacy_list,
        "directory": detailed,
    }


@app.get("/api/teacher/students/{student_id}")
def teacher_student_detail(
    student_id: str,
    current_user: Annotated[dict[str, Any], Depends(require_teacher)] = None,
) -> dict[str, Any]:
    if not (_store().get_user_by_id(student_id) or _store().get_user_by_identifier_and_role(student_id, "student")):
        raise HTTPException(404, "Student outside assigned roster")
    profile = _store().teacher_student_profile(student_id)
    engine = QuizEngine(_store())
    gaps_info = engine.gaps(student_id, limit=10)
    account = _store().get_user_by_identifier_and_role(student_id,"student") or _store().get_user_by_id(student_id)
    profile["lesson_history"] = _store().get_student_activity_log(student_id=account["id"])
    profile["classifier_model"] = gaps_info.get("classifier_model", "DecisionTreeClassifier")
    profile["gaps"] = gaps_info.get("gaps", [])
    profile["student_id"] = student_id
    profile["mastery"] = profile.get("topic_analysis", [])
    return profile


@app.get("/api/teacher/gaps")
def get_teacher_gaps(
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    return _store().teacher_gaps_analytics()


@app.get("/api/teacher/improvement")
def get_teacher_improvement(
    current_user: Annotated[dict[str, Any], Depends(require_teacher)],
) -> dict[str, Any]:
    return _store().teacher_improvement_tracking()


# ---------------------------------------------------------------- saved sessions
@app.post("/api/sessions")
def create_session(
    request: SessionRequest,
    current_user: Annotated[dict[str, Any] | None, Depends(get_current_user)] = None,
) -> dict[str, Any]:
    level, name = _selection(request.class_level, request.subject)
    lines = _request_lines(NotesRequest(lines=request.lines, text=request.text))
    user_id = current_user["id"] if current_user else None
    session_id = _store().save_session(
        title=request.title.strip() or "Lecture",
        class_level=level,
        subject=name,
        lines=[line.to_dict() for line in lines],
        transcript=" ".join(line.text for line in lines),
        duration_s=request.duration_s,
        notes=request.notes,
        markdown=request.markdown,
        user_id=user_id,
    )
    return {"id": session_id, "session": _store().get_session(session_id)}


@app.get("/api/sessions")
def list_sessions(
    limit: int = 50,
    current_user: Annotated[dict[str, Any] | None, Depends(get_current_user)] = None,
) -> dict[str, Any]:
    user_id = current_user["id"]
    return {"sessions": _store().list_sessions(limit=max(1, min(limit, 200)), user_id=user_id)}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, current_user: Annotated[dict, Depends(get_current_user)]) -> dict[str, Any]:
    session = _store().get_session(session_id)
    if not session or session.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ---------------------------------------------------------------- WebSocket
@app.websocket("/ws/captions")
async def captions_socket(websocket: WebSocket) -> None:
    user = _store().get_auth_session(websocket.cookies.get("ila_session") or "")
    if not user or user["role"] != "teacher":
        await websocket.close(code=1008)
        return
    await websocket.accept()

    try:
        request = await websocket.receive_json()
    except (WebSocketDisconnect, ValueError):
        return

    if not isinstance(request, dict):
        await websocket.send_json({"type": "error", "message": "Expected a JSON object"})
        await websocket.close()
        return

    settings = _apply_overrides(SETTINGS.model_copy(deep=True), request)
    source_kind = str(request.get("source", "mic")).lower()

    await websocket.send_json(
        {"type": "status", "stage": "loading_model", "model": settings.asr.model}
    )
    try:
        asr = await asyncio.to_thread(REGISTRY.get, settings)
    except Exception as exc:
        logger.exception("failed to load ASR model")
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    await websocket.send_json(
        {
            "type": "ready",
            "schema": SCHEMA_VERSION,
            "asr": asr.info.to_dict(),
            "source": source_kind,
        }
    )
    await _pump(websocket, settings, asr, source_kind, request)


def _apply_overrides(settings: Settings, request: dict[str, Any]) -> Settings:
    if request.get("model"):
        settings.asr.model = str(request["model"]).strip()
    if "language" in request:
        language = request["language"]
        settings.asr.language = None if not language or language == "auto" else str(language)
    if request.get("device") is not None:
        settings.audio.device = int(request["device"])
    if request.get("partials") is not None:
        settings.partials.enabled = bool(request["partials"])
    if request.get("realtime") is not None:
        settings.audio.realtime = bool(request["realtime"])
    if request.get("model_dir"):
        settings.asr.model_dir = request["model_dir"]
    return settings


async def _pump(
    websocket: WebSocket,
    settings: Settings,
    asr: AsrProvider,
    source_kind: str,
    request: dict[str, Any],
) -> None:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Any] = asyncio.Queue()
    stop = threading.Event()
    sentinel = object()

    def worker() -> None:
        source = None
        try:
            source = build_source(
                source_kind,
                path=request.get("path"),
                sample_rate=settings.audio.sample_rate,
                block_ms=settings.audio.block_ms,
                device=settings.audio.device,
                realtime=settings.audio.realtime,
            )
            pipeline = CaptionPipeline.from_settings(settings, source, asr)
            for event in pipeline.events(stop=stop.is_set):
                loop.call_soon_threadsafe(queue.put_nowait, event)
                if stop.is_set():
                    break
        except Exception as exc:
            logger.exception("caption session failed")
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "message": str(exc)})
        finally:
            if source is not None:
                try:
                    source.close()
                except Exception:  # pragma: no cover - best effort
                    logger.debug("failed to close audio source", exc_info=True)
            loop.call_soon_threadsafe(queue.put_nowait, sentinel)

    thread = threading.Thread(target=worker, name="ila-captions", daemon=True)
    thread.start()

    async def watch_client() -> None:
        try:
            while True:
                message = await websocket.receive_json()
                if isinstance(message, dict) and message.get("action") == "stop":
                    stop.set()
                    return
        except Exception:
            stop.set()

    watcher = asyncio.create_task(watch_client())
    completed = False
    try:
        while True:
            item = await queue.get()
            if item is sentinel:
                completed = True
                break
            if isinstance(item, CaptionEvent):
                await websocket.send_json(item.to_dict())
            else:
                await websocket.send_json(item)
    except WebSocketDisconnect:
        logger.debug("caption client disconnected")
    finally:
        stop.set()
        watcher.cancel()
        if thread.is_alive():
            await asyncio.to_thread(thread.join, 5.0)

    if completed:
        with contextlib.suppress(Exception):  # client may already be gone
            await websocket.send_json({"type": "done"})


@app.websocket("/ws/live-mic")
async def live_mic_captions(websocket: WebSocket) -> None:
    """Stream real-time partial & final transcripts from browser microphone PCM frames (teacher & student)."""
    token = extract_token(
        ila_session=websocket.cookies.get("ila_session"),
        authorization=websocket.headers.get("authorization"),
    ) or websocket.query_params.get("token")
    user = _store().get_auth_session(token) if token else None
    if not user or user.get("role") not in ("teacher", "student"):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    settings = SETTINGS.model_copy(deep=True)
    settings.partials.enabled = True
    settings.partials.after_s = min(settings.partials.after_s, 0.9)
    settings.partials.interval_s = min(settings.partials.interval_s, 1.1)
    settings.vad.start_margin_db = min(settings.vad.start_margin_db, 5.5)
    settings.vad.end_margin_db = min(settings.vad.end_margin_db, 2.5)
    settings.vad.min_silence_ms = max(settings.vad.min_silence_ms, 650)
    settings.vad.min_speech_ms = min(settings.vad.min_speech_ms, 250)
    settings.asr.no_speech_threshold = max(settings.asr.no_speech_threshold, 0.75)
    settings.asr.logprob_threshold = min(settings.asr.logprob_threshold, -1.25)

    await websocket.send_json({"type": "status", "stage": "loading_model", "model": settings.asr.model})
    try:
        asr = await asyncio.to_thread(REGISTRY.get, settings)
    except Exception as exc:
        logger.exception("failed to load ASR model for live mic")
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    await websocket.send_json({"type": "ready", "schema": SCHEMA_VERSION, "asr": asr.info.to_dict()})

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Any] = asyncio.Queue()
    source = QueueAudioSource(sample_rate=settings.audio.sample_rate)
    stop = threading.Event()
    sentinel = object()

    def worker() -> None:
        try:
            with TRANSCRIBE_LOCK:
                pipeline = CaptionPipeline.from_settings(settings, source, asr)
                for event in pipeline.events(stop=stop.is_set):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
        except Exception as exc:
            logger.exception("live-mic caption worker failed")
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "message": str(exc)})
        finally:
            source.close()
            loop.call_soon_threadsafe(queue.put_nowait, sentinel)

    thread = threading.Thread(target=worker, name="ila-live-mic", daemon=True)
    thread.start()

    async def recv_audio() -> None:
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    source.push(msg["bytes"])
                elif msg.get("text"):
                    try:
                        data = json.loads(msg["text"])
                        if isinstance(data, dict) and data.get("action") == "stop":
                            break
                    except Exception:
                        pass
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            source.close()

    receiver = asyncio.create_task(recv_audio())
    try:
        while True:
            item = await queue.get()
            if item is sentinel:
                break
            if isinstance(item, CaptionEvent):
                await websocket.send_json(item.to_dict())
            else:
                await websocket.send_json(item)
        with contextlib.suppress(Exception):
            await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        stop.set()
    finally:
        stop.set()
        source.close()
        receiver.cancel()
        if thread.is_alive():
            await asyncio.to_thread(thread.join, 5.0)


@app.websocket("/ws/events")
async def realtime_events(websocket: WebSocket) -> None:
    """Push real-time lesson, notification, and student-activity updates to connected portals."""
    token = extract_token(
        ila_session=websocket.cookies.get("ila_session"),
        authorization=websocket.headers.get("authorization"),
    ) or websocket.query_params.get("token")
    user = _store().get_auth_session(token) if token else None
    if not user:
        await websocket.close(code=4401)
        return

    REALTIME_HUB.attach_loop(asyncio.get_running_loop())
    await websocket.accept()
    REALTIME_HUB.register(websocket, user)
    try:
        await websocket.send_json({"type": "connected", "role": user.get("role")})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        REALTIME_HUB.unregister(websocket)


# ---------------------------------------------------------------- dashboard & notes view
HTML_NOTES_DIR = NOTES_DIR / "html"
if HTML_NOTES_DIR.is_dir():
    app.mount(
        "/notes-view",
        StaticFiles(directory=str(HTML_NOTES_DIR), html=True),
        name="notes_html",
    )

from starlette.exceptions import HTTPException as StaticHTTPException

class SPAStaticFiles(StaticFiles):
    @staticmethod
    def _no_cache_index(index_path: Path) -> FileResponse:
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache",
            },
        )

    async def get_response(self, path: str, scope: Any) -> Response:
        if scope.get("type") == "http" and str(scope.get("path", "")).startswith("/api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        try:
            response = await super().get_response(path, scope)
            if response.status_code == 404 and scope.get("method") in ("GET", "HEAD"):
                index_path = Path(self.directory) / "index.html"
                if index_path.is_file():
                    return self._no_cache_index(index_path)
            if (path in ("", ".", "index.html") or response.media_type == "text/html") and response.status_code == 200:
                response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
                response.headers["Pragma"] = "no-cache"
            return response
        except StaticHTTPException as exc:
            if exc.status_code == 404 and scope.get("method") in ("GET", "HEAD") and not str(scope.get("path", "")).startswith("/api"):
                index_path = Path(self.directory) / "index.html"
                if index_path.is_file():
                    return self._no_cache_index(index_path)
            raise


if DASHBOARD_DIST.is_dir():
    app.mount("/", SPAStaticFiles(directory=str(DASHBOARD_DIST), html=True), name="dashboard")
else:


    @app.get("/")
    def dashboard_not_built() -> dict[str, str]:
        return {
            "message": "Dashboard build not found.",
            "develop": "cd dashboard && npm install && npm run dev  (http://localhost:5173)",
            "build": "cd dashboard && npm install && npm run build  (served here at /)",
        }
