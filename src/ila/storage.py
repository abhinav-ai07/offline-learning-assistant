"""Small SQLite store for sessions, quiz attempts and topic mastery.

SQLite is in the Python standard library, so the persistence layer adds no
download and no service to run. Every method opens a short-lived connection;
that keeps the store safe to call from FastAPI's thread pool without sharing a
connection across threads.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator, Sequence
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

report_teacher: ContextVar[str | None] = ContextVar("report_teacher", default=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS roles (
    code TEXT PRIMARY KEY
);
INSERT OR IGNORE INTO roles(code) VALUES ('admin'),('teacher'),('student');
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' REFERENCES roles(code),
    class_level INTEGER DEFAULT 10,
    student_identifier TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    class_level INTEGER,
    subject TEXT,
    duration_s REAL,
    transcript TEXT NOT NULL DEFAULT '',
    notes_json TEXT,
    markdown TEXT,
    topic TEXT,
    chapter_number INTEGER,
    user_id TEXT
);

CREATE TABLE IF NOT EXISTS utterances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    start REAL,
    end REAL
);

CREATE TABLE IF NOT EXISTS notes (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    markdown TEXT NOT NULL,
    notes_json TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    class_level INTEGER,
    subject TEXT,
    topic TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_quizzes (
    quiz_id TEXT PRIMARY KEY REFERENCES quiz_sessions(id),
    lesson_id TEXT NOT NULL REFERENCES lessons(id),
    student_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS lesson_documents (
    lesson_id TEXT PRIMARY KEY REFERENCES lessons(id),
    transcript_path TEXT NOT NULL,
    notes_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    expected TEXT NOT NULL,
    response TEXT NOT NULL DEFAULT '',
    correct INTEGER NOT NULL,
    response_ms INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mastery (
    student_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0.5,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, topic)
);

CREATE TABLE IF NOT EXISTS academic_classes (
    id TEXT PRIMARY KEY,
    class_level INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    academic_year TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    class_level INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY(class_level) REFERENCES academic_classes(class_level),
    UNIQUE(class_level, name)
);

CREATE TABLE IF NOT EXISTS teacher_class_assignments (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_level INTEGER NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    subject TEXT NOT NULL,
    FOREIGN KEY(class_level,section) REFERENCES sections(class_level,name),
    FOREIGN KEY(class_level,subject) REFERENCES subjects(class_level,code)
);

CREATE TABLE IF NOT EXISTS student_enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_level INTEGER NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    roll_number TEXT,
    FOREIGN KEY(class_level,section) REFERENCES sections(class_level,name)
);

CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    class_level INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    FOREIGN KEY(class_level) REFERENCES academic_classes(class_level),
    UNIQUE(class_level, code)
);

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    class_level INTEGER NOT NULL,
    subject TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    UNIQUE(class_level, subject, chapter_number)
);

CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    class_level INTEGER NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    subject TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_title TEXT NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES users(id),
    teaching_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    published_at TEXT,
    duration_s REAL DEFAULT 0.0,
    audio_filename TEXT,
    audio_path TEXT,
    transcript TEXT NOT NULL DEFAULT '',
    notes_markdown TEXT NOT NULL DEFAULT '',
    notes_json TEXT,
    key_concepts_json TEXT,
    examples_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(class_level,subject,chapter_number) REFERENCES chapters(class_level,subject,chapter_number)
);

CREATE TABLE IF NOT EXISTS lesson_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_completions (
    student_id TEXT NOT NULL REFERENCES users(id),
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed INTEGER NOT NULL DEFAULT 0,
    transcript_viewed INTEGER NOT NULL DEFAULT 0,
    notes_viewed INTEGER NOT NULL DEFAULT 0,
    quiz_completed INTEGER NOT NULL DEFAULT 0,
    quiz_score REAL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'lesson_published',
    link TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
    teacher_id TEXT NOT NULL REFERENCES users(id),
    class_level INTEGER NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timetables (
    id TEXT PRIMARY KEY,
    class_level INTEGER NOT NULL,
    section TEXT NOT NULL DEFAULT 'A',
    day_of_week TEXT NOT NULL,
    period INTEGER NOT NULL,
    subject TEXT NOT NULL,
    teacher_name TEXT,
    time_slot TEXT
);

CREATE TABLE IF NOT EXISTS remediation_records (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    pack_json TEXT NOT NULL,
    score REAL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_identifier);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id, idx);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON quiz_attempts(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_mastery_student ON mastery(student_id, score);
CREATE INDEX IF NOT EXISTS idx_lessons_class_sec ON lessons(class_level, section, status);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_activity_student ON lesson_activity(student_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments ON teacher_class_assignments(teacher_id, class_level, section);
CREATE INDEX IF NOT EXISTS idx_student_enrollments ON student_enrollments(student_id, class_level, section);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _loads(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _resolve_topic_subject(topic: str) -> tuple[str, str]:
    from ila.curriculum import COURSES, SUBJECT_LABELS

    cleaned = topic.strip().lower()
    for course in COURSES.values():
        for ch in course.chapters:
            title_clean = ch.title.strip().lower()
            if title_clean == cleaned or title_clean in cleaned or cleaned in title_clean:
                subj = course.subject
                return subj, SUBJECT_LABELS.get(subj, subj.capitalize())

    math_keywords = (
        "math", "equation", "number", "polynomial", "trigonometry", "algebra",
        "probability", "statistics", "geometry", "triangle", "circle", "arithmetic",
        "fraction", "coordinate", "tangent", "root", "linear",
    )
    if any(k in cleaned for k in math_keywords):
        return "maths", "Mathematics"

    science_keywords = (
        "science", "light", "current", "acid", "cell", "chemical", "physics",
        "biology", "chemistry", "eye", "environment", "motion", "force",
        "gravity", "energy", "sound", "matter", "reflection", "refraction",
        "heredity", "reproduce", "plant", "animal", "electricity", "magnet",
    )
    if any(k in cleaned for k in science_keywords):
        return "science", "Science"

    return "general", "General"


class Storage:
    """Thin, explicit data-access layer (no ORM, no migration framework)."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    # --------------------------------------------------------------- plumbing
    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.path), timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        teacher = report_teacher.get()
        if teacher:
            connection.create_function("report_teacher", 0, lambda: teacher)
            connection.executescript("""
                CREATE TEMP VIEW roster AS
                SELECT u.* FROM main.users u JOIN main.student_enrollments e ON e.student_id=u.id
                WHERE u.is_active AND EXISTS (SELECT 1 FROM main.teacher_class_assignments a
                    WHERE a.teacher_id=report_teacher() AND a.class_level=e.class_level AND a.section=e.section);
                CREATE TEMP VIEW student_keys AS SELECT id AS k FROM roster UNION SELECT student_identifier FROM roster;
                CREATE TEMP VIEW users AS SELECT * FROM roster UNION SELECT * FROM main.users WHERE id=report_teacher();
                CREATE TEMP VIEW lessons AS SELECT l.* FROM main.lessons l WHERE l.teacher_id=report_teacher()
                    AND EXISTS (SELECT 1 FROM main.teacher_class_assignments a WHERE a.teacher_id=report_teacher()
                        AND a.class_level=l.class_level AND a.section=l.section AND a.subject=l.subject);
                CREATE TEMP VIEW sessions AS SELECT * FROM main.sessions WHERE user_id=report_teacher();
                CREATE TEMP VIEW quiz_sessions AS SELECT q.* FROM main.quiz_sessions q
                    WHERE q.student_id IN student_keys AND EXISTS (SELECT 1 FROM main.teacher_class_assignments a
                    WHERE a.teacher_id=report_teacher() AND a.class_level=q.class_level AND a.subject=q.subject);
                CREATE TEMP VIEW quiz_attempts AS SELECT * FROM main.quiz_attempts WHERE quiz_id IN (SELECT id FROM quiz_sessions);
                CREATE TEMP VIEW mastery AS SELECT m.* FROM main.mastery m WHERE EXISTS
                    (SELECT 1 FROM quiz_attempts q WHERE m.student_id=q.student_id AND m.topic=q.topic);
                CREATE TEMP VIEW lesson_activity AS SELECT * FROM main.lesson_activity
                    WHERE lesson_id IN (SELECT id FROM lessons) AND student_id IN student_keys;
                CREATE TEMP VIEW lesson_completions AS SELECT * FROM main.lesson_completions
                    WHERE lesson_id IN (SELECT id FROM lessons) AND student_id IN student_keys;
            """)
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _init(self) -> None:
        with self._connection() as connection:
            if connection.execute("PRAGMA user_version").fetchone()[0] < 2 and connection.execute(
                "SELECT 1 FROM sqlite_master WHERE name='users'"
            ).fetchone():
                folder = self.path.parent / "backups"
                folder.mkdir(exist_ok=True)
                backup = sqlite3.connect(folder / f"before-school-{uuid4().hex}.sqlite3")
                try:
                    connection.backup(backup)
                finally:
                    backup.close()
            connection.executescript(SCHEMA)
            self._migrate_user_email(connection)
            for col, col_type in [
                ("topic", "TEXT"),
                ("chapter_number", "INTEGER"),
                ("user_id", "TEXT"),
            ]:
                try:
                    connection.execute(f"ALTER TABLE sessions ADD COLUMN {col} {col_type}")
                except Exception:
                    pass
            try:
                connection.execute("ALTER TABLE users ADD COLUMN section TEXT DEFAULT 'A'")
            except Exception:
                pass
            try:
                connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
            except Exception:
                pass
            self._seed_academic_data(connection)
            for level in (11,12):
                connection.execute("INSERT OR IGNORE INTO subjects VALUES (?,?,?,?,?)",
                                   (f"sub-{level}-science",level,"science","Science","book"))
            if connection.execute("PRAGMA user_version").fetchone()[0] < 2:
                connection.execute("PRAGMA user_version=2")

    def _migrate_user_email(self, connection: sqlite3.Connection) -> None:
        columns = list(connection.execute("PRAGMA table_info(users)"))
        email_column = next((column for column in columns if column["name"] == "email"), None)
        if email_column is None or not email_column["notnull"]:
            return

        column_names = {column["name"] for column in columns}
        section_value = "section" if "section" in column_names else "'A'"
        connection.execute("PRAGMA foreign_keys = OFF")
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                CREATE TABLE users_new (
                    id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    email TEXT UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'student',
                    class_level INTEGER DEFAULT 10,
                    student_identifier TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    section TEXT DEFAULT 'A'
                )
                """
            )
            connection.execute(
                f"""
                INSERT INTO users_new
                    (id, full_name, email, password_hash, role, class_level,
                     student_identifier, created_at, updated_at, is_active, section)
                SELECT id, full_name, email, password_hash, role, class_level,
                       student_identifier, created_at, updated_at, is_active, {section_value}
                FROM users
                """
            )
            connection.execute("DROP TABLE users")
            connection.execute("ALTER TABLE users_new RENAME TO users")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_identifier)"
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys = ON")

    def _seed_academic_data(self, connection: sqlite3.Connection) -> None:
        """Initialize the class, section and curriculum catalogues for a new school."""
        cursor = connection.cursor()
        classes_count = cursor.execute("SELECT COUNT(*) FROM academic_classes").fetchone()[0]
        if classes_count == 0:
            # Classes 9 to 12
            for level in (9, 10, 11, 12):
                connection.execute(
                    "INSERT OR IGNORE INTO academic_classes (id, class_level, name, academic_year) VALUES (?, ?, ?, ?)",
                    (f"class-{level}", level, f"Class {level}", "2026-2027"),
                )
                for sec in ("A", "B"):
                    connection.execute(
                        "INSERT OR IGNORE INTO sections (id, class_level, name) VALUES (?, ?, ?)",
                        (f"sec-{level}-{sec}", level, sec),
                    )

            # Subjects
            for level in (9, 10):
                for code, name, icon in (
                    ("science", "Science", "flask"),
                    ("maths", "Mathematics", "calculator"),
                    ("social", "Social Science", "globe"),
                    ("english", "English", "book"),
                ):
                    connection.execute(
                        "INSERT OR IGNORE INTO subjects (id, class_level, code, name, icon) VALUES (?, ?, ?, ?, ?)",
                        (f"sub-{level}-{code}", level, code, name, icon),
                    )

            for level in (11, 12):
                for code, name, icon in (
                    ("physics", "Physics", "zap"),
                    ("chemistry", "Chemistry", "flask"),
                    ("maths", "Mathematics", "calculator"),
                    ("biology", "Biology", "activity"),
                    ("english", "English", "book"),
                ):
                    connection.execute(
                        "INSERT OR IGNORE INTO subjects (id, class_level, code, name, icon) VALUES (?, ?, ?, ?, ?)",
                        (f"sub-{level}-{code}", level, code, name, icon),
                    )

            # Chapters from NCERT curriculum for Class 9 and 10
            from ila.curriculum import COURSES
            for (level, subj), course in COURSES.items():
                for ch in course.chapters:
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO chapters
                            (id, class_level, subject, chapter_number, title, description)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            f"ch-{level}-{subj}-{ch.number}",
                            level,
                            subj,
                            ch.number,
                            ch.title,
                            f"NCERT Class {level} {subj.capitalize()} Chapter {ch.number}: {ch.title}",
                        ),
                    )

    def save_session(
        self,
        *,
        title: str,
        class_level: int | None,
        subject: str | None,
        lines: Sequence[dict[str, Any]],
        transcript: str = "",
        duration_s: float | None = None,
        notes: dict[str, Any] | None = None,
        markdown: str | None = None,
        session_id: str | None = None,
        topic: str | None = None,
        chapter_number: int | None = None,
        user_id: str | None = None,
    ) -> str:
        identifier = session_id or uuid4().hex
        created = _now()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO sessions
                    (id, created_at, title, class_level, subject, duration_s, transcript,
                     notes_json, markdown, topic, chapter_number, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    class_level=excluded.class_level,
                    subject=excluded.subject,
                    duration_s=excluded.duration_s,
                    transcript=excluded.transcript,
                    notes_json=excluded.notes_json,
                    markdown=excluded.markdown,
                    topic=excluded.topic,
                    chapter_number=excluded.chapter_number,
                    user_id=COALESCE(excluded.user_id, sessions.user_id)
                """,
                (
                    identifier,
                    created,
                    title,
                    class_level,
                    subject,
                    duration_s,
                    transcript,
                    json.dumps(notes, ensure_ascii=False) if notes is not None else None,
                    markdown,
                    topic,
                    chapter_number,
                    user_id,
                ),
            )
            connection.execute("DELETE FROM utterances WHERE session_id = ?", (identifier,))
            connection.executemany(
                """
                INSERT INTO utterances (session_id, idx, text, start, end)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    (
                        identifier,
                        index,
                        str(line.get("text", "")),
                        line.get("start"),
                        line.get("end"),
                    )
                    for index, line in enumerate(lines)
                ],
            )
            if markdown is not None:
                connection.execute(
                    """
                    INSERT INTO notes (session_id, markdown, notes_json, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        markdown=excluded.markdown,
                        notes_json=excluded.notes_json,
                        updated_at=excluded.updated_at
                    """,
                    (
                        identifier,
                        markdown,
                        json.dumps(notes, ensure_ascii=False) if notes is not None else None,
                        created,
                    ),
                )
        return identifier

    def list_sessions(
        self, *, limit: int = 50, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            if user_id:
                query = """
                    SELECT s.id, s.created_at, s.title, s.class_level, s.subject, s.duration_s,
                           s.transcript, s.markdown, s.user_id, COUNT(u.id) AS utterances
                    FROM sessions s
                    LEFT JOIN utterances u ON u.session_id = s.id
                    WHERE s.user_id = ? OR s.user_id IS NULL
                    GROUP BY s.id
                    ORDER BY s.created_at DESC
                    LIMIT ?
                """
                rows = connection.execute(query, (user_id, max(1, limit))).fetchall()
            else:
                query = """
                    SELECT s.id, s.created_at, s.title, s.class_level, s.subject, s.duration_s,
                           s.transcript, s.markdown, s.user_id, COUNT(u.id) AS utterances
                    FROM sessions s
                    LEFT JOIN utterances u ON u.session_id = s.id
                    GROUP BY s.id
                    ORDER BY s.created_at DESC
                    LIMIT ?
                """
                rows = connection.execute(query, (max(1, limit),)).fetchall()
        return [
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "title": row["title"],
                "class_level": row["class_level"],
                "subject": row["subject"],
                "duration_s": row["duration_s"],
                "utterances": row["utterances"],
                "preview": (row["transcript"] or "")[:220],
                "has_notes": bool(row["markdown"]),
                "user_id": row["user_id"] if "user_id" in row.keys() else None,
            }
            for row in rows
        ]

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            session = connection.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if session is None:
                return None
            rows = connection.execute(
                "SELECT text, start, end FROM utterances WHERE session_id = ? ORDER BY idx",
                (session_id,),
            ).fetchall()
            note_row = connection.execute(
                "SELECT markdown FROM notes WHERE session_id = ?", (session_id,)
            ).fetchone()
        return {
            "id": session["id"],
            "created_at": session["created_at"],
            "title": session["title"],
            "class_level": session["class_level"],
            "subject": session["subject"],
            "user_id": session["user_id"],
            "duration_s": session["duration_s"],
            "transcript": session["transcript"],
            "notes": _loads(session["notes_json"]),
            "markdown": note_row["markdown"] if note_row else session["markdown"],
            "lines": [dict(row) for row in rows],
            "topic": session["topic"] if "topic" in session.keys() else None,
            "chapter_number": session["chapter_number"] if "chapter_number" in session.keys() else None,
        }

    def get_notes_by_chapter(
        self,
        chapter_number: int,
        *,
        class_level: int | None = None,
        subject: str | None = None,
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            cursor = connection.execute(
                """
                SELECT id, created_at, title, class_level, subject, duration_s,
                       transcript, notes_json, markdown, topic, chapter_number
                FROM sessions
                WHERE chapter_number = ?
                  AND (class_level = ? OR ? IS NULL)
                  AND (subject = ? OR ? IS NULL)
                  AND markdown IS NOT NULL AND markdown != ''
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (chapter_number, class_level, class_level, subject, subject),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "created_at": row["created_at"],
                "title": row["title"],
                "class_level": row["class_level"],
                "subject": row["subject"],
                "duration_s": row["duration_s"],
                "transcript": row["transcript"],
                "notes": _loads(row["notes_json"]),
                "markdown": row["markdown"],
                "topic": row["topic"],
                "chapter_number": row["chapter_number"],
            }

    # ------------------------------------------------------------------ quizzes
    def create_quiz(
        self,
        *,
        student_id: str,
        class_level: int,
        subject: str,
        topic: str | None,
        state: dict[str, Any],
        quiz_id: str | None = None,
    ) -> str:
        identifier = quiz_id or uuid4().hex
        now = _now()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO quiz_sessions
                    (id, student_id, class_level, subject, topic, created_at, updated_at,
                     completed, score, state_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
                """,
                (
                    identifier,
                    student_id,
                    class_level,
                    subject,
                    topic,
                    now,
                    now,
                    json.dumps(state, ensure_ascii=False),
                ),
            )
        return identifier

    def get_quiz(self, quiz_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM quiz_sessions WHERE id = ?", (quiz_id,)
            ).fetchone()
        if row is None:
            return None
        payload = dict(row)
        payload["state"] = _loads(row["state_json"]) or {}
        payload["completed"] = bool(row["completed"])
        return payload

    def update_quiz(
        self,
        quiz_id: str,
        *,
        state: dict[str, Any],
        completed: bool,
        score: float,
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                UPDATE quiz_sessions
                SET state_json = ?, completed = ?, score = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(state, ensure_ascii=False), int(completed), score, _now(), quiz_id),
            )

    def record_attempt(
        self,
        *,
        quiz_id: str,
        student_id: str,
        question_id: str,
        topic: str,
        difficulty: int,
        prompt: str,
        expected: str,
        response: str,
        correct: bool,
        response_ms: int | None = None,
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO quiz_attempts
                    (quiz_id, student_id, question_id, topic, difficulty, prompt, expected,
                     response, correct, response_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    quiz_id,
                    student_id,
                    question_id,
                    topic,
                    difficulty,
                    prompt,
                    expected,
                    response,
                    int(correct),
                    response_ms,
                    _now(),
                ),
            )

    def recent_attempts(self, student_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT question_id, topic, difficulty, prompt, expected, response, correct,
                       response_ms, created_at
                FROM quiz_attempts
                WHERE student_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (student_id, max(1, limit)),
            ).fetchall()
        return [{**dict(row), "correct": bool(row["correct"])} for row in rows]

    # ------------------------------------------------------------------ mastery
    def get_mastery(self, student_id: str, topic: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM mastery WHERE student_id = ? AND topic = ?",
                (student_id, topic),
            ).fetchone()
        return dict(row) if row else None

    def list_mastery(self, student_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM mastery WHERE student_id = ? ORDER BY score ASC, topic ASC",
                (student_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def save_mastery(
        self,
        student_id: str,
        topic: str,
        *,
        attempts: int,
        correct: int,
        score: float,
    ) -> dict[str, Any]:
        now = _now()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO mastery (student_id, topic, attempts, correct, score, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(student_id, topic) DO UPDATE SET
                    attempts=excluded.attempts,
                    correct=excluded.correct,
                    score=excluded.score,
                    updated_at=excluded.updated_at
                """,
                (student_id, topic, attempts, correct, max(0.0, min(1.0, score)), now),
            )
        return {
            "student_id": student_id,
            "topic": topic,
            "attempts": attempts,
            "correct": correct,
            "score": round(max(0.0, min(1.0, score)), 4),
            "updated_at": now,
        }

    def weakest_topics(self, student_id: str, *, limit: int = 3) -> list[dict[str, Any]]:
        return self.list_mastery(student_id)[: max(1, limit)]

    # ------------------------------------------------------------------ users
    def create_user(
        self,
        *,
        full_name: str,
        email: str | None = None,
        password_hash: str,
        role: str = "student",
        class_level: int = 10,
        student_identifier: str | None = None,
        section: str = "A",
    ) -> dict[str, Any]:
        user_id = uuid4().hex
        now = _now()
        identifier = (student_identifier or user_id[:8]).strip()
        clean_name = full_name.strip()
        if len(clean_name) < 2:
            raise ValueError("Name must have at least 2 characters")
        if not identifier:
            raise ValueError("ID is required")
        normalized_role = role.strip().lower()
        sec = (section or "A").strip().upper()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if normalized_role == "admin" and connection.execute(
                "SELECT 1 FROM users WHERE role='admin' LIMIT 1"
            ).fetchone():
                raise ValueError("The initial administration account already exists")
            if student_identifier is not None:
                role_condition = (
                    "role = 'student'"
                    if normalized_role == "student"
                    else "role IN ('teacher', 'admin')"
                )
                existing = connection.execute(
                    f"""
                    SELECT 1 FROM users
                    WHERE LOWER(student_identifier) = LOWER(?) AND {role_condition}
                    LIMIT 1
                    """,
                    (identifier,),
                ).fetchone()
                if existing:
                    raise ValueError("This ID is already registered")
            connection.execute(
                """
                INSERT INTO users
                    (id, full_name, email, password_hash, role, class_level,
                     student_identifier, created_at, updated_at, is_active, section)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    user_id,
                    clean_name,
                    email.strip().lower() if email else None,
                    password_hash,
                    normalized_role,
                    class_level,
                    identifier,
                    now,
                    now,
                    sec,
                ),
            )
            # Link enrollment / assignments
            if normalized_role == "student":
                connection.execute(
                    """
                    INSERT OR REPLACE INTO student_enrollments
                        (id, student_id, class_level, section, roll_number)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (f"enr-{user_id[:12]}", user_id, class_level, sec, identifier),
                )
            elif normalized_role == "teacher":
                for subj in ("science", "maths"):
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO teacher_class_assignments
                            (id, teacher_id, class_level, section, subject)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (f"tca-{user_id[:8]}-{class_level}-{sec}-{subj}", user_id, class_level, sec, subj),
                    )
        return {
            "id": user_id,
            "full_name": clean_name,
            "email": email.strip().lower() if email else None,
            "role": normalized_role,
            "class_level": class_level,
            "section": sec,
            "student_identifier": identifier,
            "created_at": now,
            "updated_at": now,
            "is_active": True,
        }

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),)
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_identifier(self, identifier: str) -> dict[str, Any] | None:
        ident = identifier.strip()
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT * FROM users
                WHERE id = ? OR LOWER(student_identifier) = LOWER(?) OR LOWER(email) = LOWER(?)
                """,
                (ident, ident, ident),
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_identifier_and_role(
        self, identifier: str, role: str | None = None
    ) -> dict[str, Any] | None:
        ident = identifier.strip()
        with self._connection() as connection:
            if role == "student":
                row = connection.execute(
                    """
                    SELECT * FROM users
                    WHERE (id = ? OR LOWER(student_identifier) = LOWER(?) OR LOWER(email) = LOWER(?))
                      AND role = 'student'
                    """,
                    (ident, ident, ident),
                ).fetchone()
            elif role in ("teacher", "admin"):
                row = connection.execute(
                    """
                    SELECT * FROM users
                    WHERE (id = ? OR LOWER(student_identifier) = LOWER(?) OR LOWER(email) = LOWER(?))
                      AND role IN ('teacher', 'admin')
                    """,
                    (ident, ident, ident),
                ).fetchone()
            else:
                row = connection.execute(
                    """
                    SELECT * FROM users
                    WHERE id = ? OR LOWER(student_identifier) = LOWER(?) OR LOWER(email) = LOWER(?)
                    """,
                    (ident, ident, ident),
                ).fetchone()
        return dict(row) if row else None

    def get_users_by_name_and_identifier(
        self, full_name: str, identifier: str, role: str
    ) -> list[dict[str, Any]]:
        role_condition = (
            "role = 'student'" if role == "student" else "role IN ('teacher', 'admin')"
        )
        with self._connection() as connection:
            rows = connection.execute(
                f"""
                SELECT * FROM users
                WHERE LOWER(full_name) = LOWER(?)
                  AND LOWER(student_identifier) = LOWER(?)
                  AND {role_condition}
                """,
                (full_name.strip(), identifier.strip()),
            ).fetchall()
        return [dict(row) for row in rows]

    def count_users(self, role: str | None = None) -> int:
        with self._connection() as connection:
            if role:
                cursor = connection.execute(
                    "SELECT COUNT(*) FROM users WHERE role = ?", (role,)
                )
            else:
                cursor = connection.execute("SELECT COUNT(*) FROM users")
            return cursor.fetchone()[0]

    def has_teachers(self) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                "SELECT COUNT(*) FROM users WHERE role IN ('teacher', 'admin')"
            )
            return (cursor.fetchone()[0] or 0) > 0

    # ---------------------------------------------------------- auth sessions
    def create_auth_session(self, user_id: str, token: str, expires_at: str) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO auth_sessions (token, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(token) DO UPDATE SET
                    user_id=excluded.user_id,
                    expires_at=excluded.expires_at
                """,
                (token, user_id, expires_at, _now()),
            )

    def get_auth_session(self, token: str) -> dict[str, Any] | None:
        now = _now()
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT s.token, s.expires_at, s.created_at as session_created,
                       u.id, u.full_name, u.email, u.role, u.class_level,
                       u.section, u.student_identifier, u.created_at, u.updated_at, u.is_active
                FROM auth_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at >= ? AND u.is_active = 1
                """,
                (token, now),
            ).fetchone()
            if not row:
                # Clean up if token expired
                connection.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
                return None
            return {
                "token": row["token"],
                "expires_at": row["expires_at"],
                "id": row["id"],
                "full_name": row["full_name"],
                "email": row["email"],
                "role": row["role"],
                "class_level": row["class_level"],
                "section": row["section"],
                "student_identifier": row["student_identifier"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "is_active": bool(row["is_active"]),
            }

    def delete_auth_session(self, token: str) -> None:
        with self._connection() as connection:
            connection.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))

    def clean_expired_sessions(self) -> int:
        now = _now()
        with self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM auth_sessions WHERE expires_at < ?", (now,)
            )
            return cursor.rowcount

    # ------------------------------------------------------------- analytics & overview
    def list_students(self) -> list[str]:
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT DISTINCT student_identifier FROM users WHERE role = 'student' AND student_identifier IS NOT NULL
                UNION
                SELECT DISTINCT student_id FROM mastery
                UNION
                SELECT DISTINCT student_id FROM quiz_attempts
                ORDER BY 1 ASC
                """
            )
            return [row[0] for row in cursor.fetchall() if row[0]]

    def list_students_detailed(
        self, search: str | None = None, class_filter: int | None = None
    ) -> list[dict[str, Any]]:
        """Return rich student directory records for teachers."""
        with self._connection() as conn:
            query = """
                SELECT u.id, u.full_name, u.email, u.class_level, u.student_identifier,
                       u.created_at, u.is_active
                FROM users u
                WHERE u.role = 'student'
            """
            params: list[Any] = []
            if class_filter is not None:
                query += " AND u.class_level = ?"
                params.append(class_filter)
            if search:
                pattern = f"%{search.strip().lower()}%"
                query += " AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.student_identifier) LIKE ?)"
                params.extend([pattern, pattern, pattern])
            query += " ORDER BY u.created_at DESC"

            user_rows = conn.execute(query, params).fetchall()

            students_list: list[dict[str, Any]] = []
            for u in user_rows:
                s_id = u["student_identifier"] or u["id"]
                # Get aggregate stats for student
                stats_row = conn.execute(
                    """
                    SELECT COUNT(*), AVG(correct), MAX(created_at)
                    FROM quiz_attempts
                    WHERE student_id = ? OR student_id = ?
                    """,
                    (s_id, u["id"]),
                ).fetchone()
                total_attempts = stats_row[0] or 0
                avg_acc = round(float(stats_row[1] or 0.0), 4)
                last_active = stats_row[2] or u["created_at"]

                # Get average mastery
                mastery_row = conn.execute(
                    """
                    SELECT AVG(score), COUNT(*)
                    FROM mastery
                    WHERE student_id = ? OR student_id = ?
                    """,
                    (s_id, u["id"]),
                ).fetchone()
                avg_mastery = round(float(mastery_row[0] or 0.5), 4)
                mastery_count = mastery_row[1] or 0

                # Knowledge gap status classification
                if total_attempts == 0 and mastery_count == 0:
                    gap_status = "new_student"
                elif avg_mastery < 0.55:
                    gap_status = "critical_gap"
                elif avg_mastery < 0.75:
                    gap_status = "needs_review"
                else:
                    gap_status = "proficient"

                students_list.append({
                    "id": u["id"],
                    "full_name": u["full_name"],
                    "email": u["email"],
                    "class_level": u["class_level"],
                    "student_identifier": s_id,
                    "created_at": u["created_at"],
                    "is_active": bool(u["is_active"]),
                    "total_attempts": total_attempts,
                    "overall_accuracy": avg_acc,
                    "average_mastery": avg_mastery,
                    "gap_status": gap_status,
                    "last_active": last_active,
                })

            # If no registered student users exist yet, fall back to distinct IDs from attempts/mastery
            if not students_list:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT DISTINCT student_id FROM mastery
                    UNION
                    SELECT DISTINCT student_id FROM quiz_attempts
                    """
                )
                legacy_ids = [r[0] for r in cursor.fetchall() if r[0]]
                for lid in legacy_ids:
                    stats_row = conn.execute(
                        "SELECT COUNT(*), AVG(correct), MAX(created_at) FROM quiz_attempts WHERE student_id = ?",
                        (lid,),
                    ).fetchone()
                    m_row = conn.execute(
                        "SELECT AVG(score) FROM mastery WHERE student_id = ?", (lid,)
                    ).fetchone()
                    tot = stats_row[0] or 0
                    acc = round(float(stats_row[1] or 0.0), 4)
                    last_act = stats_row[2] or _now()
                    m_score = round(float(m_row[0] or 0.5), 4)
                    g_stat = "critical_gap" if m_score < 0.55 else "needs_review" if m_score < 0.75 else "proficient"
                    students_list.append({
                        "id": lid,
                        "full_name": lid.replace("-", " ").title(),
                        "email": f"{lid}@school.edu",
                        "class_level": 10,
                        "student_identifier": lid,
                        "created_at": last_act,
                        "is_active": True,
                        "total_attempts": tot,
                        "overall_accuracy": acc,
                        "average_mastery": m_score,
                        "gap_status": g_stat,
                        "last_active": last_act,
                    })

            return students_list

    def student_overview(self, student_id: str, user_id: str | None = None) -> dict[str, Any]:
        """Aggregate personal dashboard metrics for an authenticated student."""
        with self._connection() as conn:
            # 1. Lectures processed
            if user_id:
                lec_row = conn.execute(
                    "SELECT COUNT(*) FROM sessions WHERE user_id = ? OR user_id = ?",
                    (user_id, student_id),
                ).fetchone()
            else:
                lec_row = conn.execute(
                    "SELECT COUNT(*) FROM sessions WHERE user_id = ?",
                    (student_id,),
                ).fetchone()
            total_lectures = lec_row[0] if lec_row else 0

            # 2. Quiz attempts & accuracy
            att_row = conn.execute(
                """
                SELECT COUNT(*), AVG(correct), AVG(response_ms)
                FROM quiz_attempts
                WHERE student_id = ? OR (? IS NOT NULL AND student_id = ?)
                """,
                (student_id, user_id, user_id),
            ).fetchone()
            total_attempts = att_row[0] or 0
            accuracy = round(float(att_row[1] or 0.0), 4)
            avg_response_ms = int(att_row[2] or 0)

            # 3. Overall mastery
            mast_row = conn.execute(
                """
                SELECT AVG(score), COUNT(*)
                FROM mastery
                WHERE student_id = ? OR (? IS NOT NULL AND student_id = ?)
                """,
                (student_id, user_id, user_id),
            ).fetchone()
            overall_mastery = round(float(mast_row[0] or 0.5), 4)

            # 4. Topics requiring revision (score < 0.60)
            weak_rows = conn.execute(
                """
                SELECT topic, score, attempts, correct
                FROM mastery
                WHERE (student_id = ? OR (? IS NOT NULL AND student_id = ?)) AND score < 0.60
                ORDER BY score ASC
                LIMIT 5
                """,
                (student_id, user_id, user_id),
            ).fetchall()
            topics_requiring_revision = [
                {
                    "topic": row["topic"],
                    "score": round(float(row["score"]), 4),
                    "attempts": row["attempts"],
                    "correct": row["correct"],
                }
                for row in weak_rows
            ]

            # 5. Recent learning activity
            rec_rows = conn.execute(
                """
                SELECT question_id, topic, prompt, correct, response_ms, created_at
                FROM quiz_attempts
                WHERE student_id = ? OR (? IS NOT NULL AND student_id = ?)
                ORDER BY id DESC
                LIMIT 6
                """,
                (student_id, user_id, user_id),
            ).fetchall()
            recent_activity = [
                {
                    "topic": r["topic"],
                    "prompt": r["prompt"],
                    "correct": bool(r["correct"]),
                    "response_ms": r["response_ms"],
                    "created_at": r["created_at"],
                }
                for r in rec_rows
            ]

            # 6. Recommendation
            if topics_requiring_revision:
                top_weak = topics_requiring_revision[0]["topic"]
                recommended_next = f"Practice targeted remediation for '{top_weak}' to bridge your knowledge gap."
            elif total_attempts == 0:
                recommended_next = "Take your first adaptive quiz in Real Numbers or record a lecture."
            else:
                recommended_next = "Explore Unit 2: Polynomials or challenge yourself with difficulty level 3."

            return {
                "student_id": student_id,
                "total_lectures": total_lectures,
                "quiz_attempts": total_attempts,
                "overall_accuracy": accuracy,
                "overall_mastery": overall_mastery,
                "avg_response_ms": avg_response_ms,
                "topics_requiring_revision": topics_requiring_revision,
                "recent_activity": recent_activity,
                "recommended_next": recommended_next,
            }

    def student_progress(self, student_id: str, user_id: str | None = None) -> dict[str, Any]:
        """Detailed personal analytics for the student's My Progress tab."""
        with self._connection() as conn:
            # Topic-wise mastery
            m_rows = conn.execute(
                """
                SELECT topic, score, attempts, correct, updated_at
                FROM mastery
                WHERE student_id = ? OR (? IS NOT NULL AND student_id = ?)
                ORDER BY score ASC
                """,
                (student_id, user_id, user_id),
            ).fetchall()

            topic_mastery: list[dict[str, Any]] = []
            for r in m_rows:
                subj, subj_label = _resolve_topic_subject(r["topic"])
                score = round(float(r["score"]), 4)
                topic_mastery.append({
                    "topic": r["topic"],
                    "score": score,
                    "attempts": r["attempts"],
                    "correct": r["correct"],
                    "updated_at": r["updated_at"],
                    "subject": subj,
                    "subject_label": subj_label,
                    "status": "proficient" if score >= 0.75 else "needs_review" if score >= 0.55 else "critical_gap",
                })

            # Strong topics (>= 0.75) and weak topics (< 0.60)
            strong = [t["topic"] for t in topic_mastery if t["score"] >= 0.75]
            weak = [t["topic"] for t in topic_mastery if t["score"] < 0.60]

            # Overall stats
            att_row = conn.execute(
                """
                SELECT COUNT(*), AVG(correct), AVG(response_ms)
                FROM quiz_attempts
                WHERE student_id = ? OR (? IS NOT NULL AND student_id = ?)
                """,
                (student_id, user_id, user_id),
            ).fetchone()
            total_attempts = att_row[0] or 0
            overall_accuracy = round(float(att_row[1] or 0.0), 4)
            avg_response_ms = int(att_row[2] or 0)

            # Response time trends (last 20 attempts chronological)
            time_rows = conn.execute(
                """
                SELECT id, topic, correct, response_ms, created_at
                FROM quiz_attempts
                WHERE student_id = ? OR (? IS NOT NULL AND student_id = ?)
                ORDER BY id DESC
                LIMIT 20
                """,
                (student_id, user_id, user_id),
            ).fetchall()
            history_chronological = [
                {
                    "attempt_id": r["id"],
                    "topic": r["topic"],
                    "correct": bool(r["correct"]),
                    "response_ms": r["response_ms"] or 0,
                    "created_at": r["created_at"],
                }
                for r in reversed(time_rows)
            ]

            # Remediation history (sessions starting with 'rem-')
            rem_rows = conn.execute(
                """
                SELECT id, topic, completed, score, created_at, updated_at, state_json
                FROM quiz_sessions
                WHERE (student_id = ? OR (? IS NOT NULL AND student_id = ?)) AND id LIKE 'rem-%'
                ORDER BY created_at DESC
                LIMIT 10
                """,
                (student_id, user_id, user_id),
            ).fetchall()
            remediation_history = [
                {
                    "pack_id": r["id"],
                    "topic": r["topic"],
                    "completed": bool(r["completed"]),
                    "score": round(float(r["score"] or 0.0), 2),
                    "created_at": r["created_at"],
                }
                for r in rem_rows
            ]

            return {
                "student_id": student_id,
                "overall_accuracy": overall_accuracy,
                "total_attempts": total_attempts,
                "avg_response_ms": avg_response_ms,
                "topic_mastery": topic_mastery,
                "strong_topics": strong,
                "weak_topics": weak,
                "recent_trend": history_chronological,
                "remediation_history": remediation_history,
            }

    def teacher_overview(self) -> dict[str, Any]:
        """Aggregate class-level analytics from local SQLite storage."""
        with self._connection() as conn:
            cursor = conn.cursor()

            # 1. Registered students count
            cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
            reg_students = cursor.fetchone()[0] or 0

            # Total distinct students from attempts/mastery if greater
            cursor.execute("SELECT COUNT(DISTINCT student_id) FROM mastery")
            active_students = cursor.fetchone()[0] or 0
            total_students = max(reg_students, active_students)

            # 2. Overall counts
            cursor.execute("SELECT COUNT(*) FROM sessions")
            total_sessions = cursor.fetchone()[0] or 0

            cursor.execute("SELECT COUNT(*), AVG(correct), AVG(response_ms) FROM quiz_attempts")
            attempts_row = cursor.fetchone()
            total_attempts = attempts_row[0] or 0
            overall_accuracy = round(float(attempts_row[1] or 0.0), 4)
            avg_response_ms = int(attempts_row[2] or 0)

            # 3. Overall class mastery
            cursor.execute("SELECT AVG(score) FROM mastery")
            avg_mastery = round(float(cursor.fetchone()[0] or 0.5), 4)

            # 4. Students needing attention (mastery < 0.60)
            cursor.execute(
                """
                SELECT COUNT(DISTINCT student_id)
                FROM mastery
                GROUP BY student_id
                HAVING AVG(score) < 0.60
                """
            )
            needing_attention_count = len(cursor.fetchall())

            # 5. Remediation completion stats
            cursor.execute(
                """
                SELECT COUNT(*), SUM(completed)
                FROM quiz_sessions
                WHERE id LIKE 'rem-%'
                """
            )
            rem_stats = cursor.fetchone()
            total_remediations = rem_stats[0] or 0
            completed_remediations = rem_stats[1] or 0

            # 6. Topic-wise breakdown
            cursor.execute(
                """
                SELECT topic, COUNT(*) as attempts_count,
                       SUM(correct) as correct_count,
                       AVG(response_ms) as avg_ms
                FROM quiz_attempts
                GROUP BY topic
                ORDER BY attempts_count DESC
                """
            )
            topic_rows = cursor.fetchall()
            if not topic_rows:
                cursor.execute(
                    """
                    SELECT topic, SUM(attempts) as attempts_count,
                           SUM(correct) as correct_count,
                           0 as avg_ms
                    FROM mastery
                    GROUP BY topic
                    ORDER BY attempts_count DESC
                    """
                )
                topic_rows = cursor.fetchall()

            topic_analytics = []
            for t_row in topic_rows:
                t_name, t_attempts, t_correct, t_avg_ms = t_row
                t_acc = (t_correct / t_attempts) if t_attempts and t_attempts > 0 else 0.0
                subj, subj_label = _resolve_topic_subject(t_name)
                topic_analytics.append({
                    "topic": t_name,
                    "attempts": t_attempts or 0,
                    "correct": t_correct or 0,
                    "accuracy": round(t_acc, 4),
                    "avg_response_ms": int(t_avg_ms or 0),
                    "subject": subj,
                    "subject_label": subj_label,
                })

            # 7. Recent student activity
            cursor.execute(
                """
                SELECT qa.student_id, qa.topic, qa.correct, qa.response_ms, qa.created_at,
                       COALESCE(u.full_name, qa.student_id) as student_name
                FROM quiz_attempts qa
                LEFT JOIN users u ON u.student_identifier = qa.student_id OR u.id = qa.student_id
                ORDER BY qa.id DESC
                LIMIT 10
                """
            )
            recent_activity = [
                {
                    "student_id": row["student_id"],
                    "student_name": row["student_name"],
                    "topic": row["topic"],
                    "correct": bool(row["correct"]),
                    "response_ms": row["response_ms"],
                    "created_at": row["created_at"],
                }
                for row in cursor.fetchall()
            ]

            return {
                "total_sessions": total_sessions,
                "total_attempts": total_attempts,
                "total_students": total_students,
                "overall_accuracy": overall_accuracy,
                "avg_response_ms": avg_response_ms,
                "class_mastery_avg": avg_mastery,
                "students_needing_attention": needing_attention_count,
                "remediation_stats": {
                    "total": total_remediations,
                    "completed": completed_remediations,
                },
                "topics": topic_analytics,
                "recent_activity": recent_activity,
            }

    def teacher_student_profile(self, student_id: str) -> dict[str, Any]:
        """Comprehensive profile of an individual student for teacher inspection."""
        with self._connection() as conn:
            # 1. User metadata if registered
            user_row = conn.execute(
                """
                SELECT id, full_name, email, class_level, student_identifier, created_at, is_active
                FROM users
                WHERE student_identifier = ? OR id = ?
                """,
                (student_id, student_id),
            ).fetchone()

            if user_row:
                student_info = {
                    "id": user_row["id"],
                    "full_name": user_row["full_name"],
                    "email": user_row["email"],
                    "class_level": user_row["class_level"],
                    "student_identifier": user_row["student_identifier"],
                    "created_at": user_row["created_at"],
                }
            else:
                student_info = {
                    "id": student_id,
                    "full_name": student_id.replace("-", " ").title(),
                    "email": f"{student_id}@school.edu",
                    "class_level": 10,
                    "student_identifier": student_id,
                    "created_at": _now(),
                }

            # 2. Aggregate metrics
            att_row = conn.execute(
                """
                SELECT COUNT(*), AVG(correct), AVG(response_ms)
                FROM quiz_attempts
                WHERE student_id = ? OR student_id = ?
                """,
                (student_id, student_info["id"]),
            ).fetchone()
            total_attempts = att_row[0] or 0
            overall_accuracy = round(float(att_row[1] or 0.0), 4)
            avg_response_ms = int(att_row[2] or 0)

            # 3. Overall mastery
            m_row = conn.execute(
                """
                SELECT AVG(score)
                FROM mastery
                WHERE student_id = ? OR student_id = ?
                """,
                (student_id, student_info["id"]),
            ).fetchone()
            overall_mastery = round(float(m_row[0] or 0.5), 4)

            # 4. Topic mastery rows
            m_rows = conn.execute(
                """
                SELECT topic, attempts, correct, score, updated_at
                FROM mastery
                WHERE student_id = ? OR student_id = ?
                ORDER BY score ASC
                """,
                (student_id, student_info["id"]),
            ).fetchall()

            topic_analysis = []
            for r in m_rows:
                subj, subj_label = _resolve_topic_subject(r["topic"])
                score = round(float(r["score"]), 4)
                topic_analysis.append({
                    "topic": r["topic"],
                    "attempts": r["attempts"],
                    "correct": r["correct"],
                    "score": score,
                    "updated_at": r["updated_at"],
                    "subject": subj,
                    "subject_label": subj_label,
                    "gap_classification": "proficient" if score >= 0.75 else "needs_review" if score >= 0.55 else "critical_gap",
                })

            strong_topics = [t for t in topic_analysis if t["score"] >= 0.75]
            weak_topics = [t for t in topic_analysis if t["score"] < 0.60]

            # 5. Improvement tracking & chronology
            recent_attempts = conn.execute(
                """
                SELECT id, topic, prompt, expected, response, correct, response_ms, created_at
                FROM quiz_attempts
                WHERE student_id = ? OR student_id = ?
                ORDER BY id DESC
                LIMIT 50
                """,
                (student_id, student_info["id"]),
            ).fetchall()
            attempts_list = [
                {
                    "id": r["id"],
                    "topic": r["topic"],
                    "prompt": r["prompt"],
                    "expected": r["expected"],
                    "response": r["response"],
                    "correct": bool(r["correct"]),
                    "response_ms": r["response_ms"],
                    "created_at": r["created_at"],
                }
                for r in recent_attempts
            ]

            # 6. Remediation packs
            rem_rows = conn.execute(
                """
                SELECT id, topic, completed, score, created_at, updated_at
                FROM quiz_sessions
                WHERE (student_id = ? OR student_id = ?) AND id LIKE 'rem-%'
                ORDER BY created_at DESC
                """,
                (student_id, student_info["id"]),
            ).fetchall()
            remediation_packs = [
                {
                    "pack_id": r["id"],
                    "topic": r["topic"],
                    "completed": bool(r["completed"]),
                    "score": round(float(r["score"] or 0.0), 2),
                    "created_at": r["created_at"],
                }
                for r in rem_rows
            ]

            return {
                "student": student_info,
                "overall_mastery": overall_mastery,
                "overall_accuracy": overall_accuracy,
                "total_attempts": total_attempts,
                "avg_response_ms": avg_response_ms,
                "topic_analysis": topic_analysis,
                "strong_topics": strong_topics,
                "weak_topics": weak_topics,
                "recent_attempts": attempts_list,
                "remediation_packs": remediation_packs,
            }

    def teacher_gaps_analytics(self) -> dict[str, Any]:
        """Aggregate topic-wise and student-wise knowledge gaps for teacher dashboard."""
        with self._connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT m.topic, m.student_id, m.score, m.attempts, m.correct,
                       COALESCE(u.full_name, m.student_id) as student_name,
                       COALESCE(u.class_level, 10) as class_level
                FROM mastery m
                LEFT JOIN users u ON u.student_identifier = m.student_id OR u.id = m.student_id
                ORDER BY m.score ASC
                """
            )
            rows = cursor.fetchall()

            critical_gaps = []
            needs_review = []
            proficient = []

            for r in rows:
                score = round(float(r["score"]), 4)
                subj, subj_label = _resolve_topic_subject(r["topic"])
                item = {
                    "topic": r["topic"],
                    "student_id": r["student_id"],
                    "student_name": r["student_name"],
                    "class_level": r["class_level"],
                    "score": score,
                    "attempts": r["attempts"],
                    "correct": r["correct"],
                    "subject": subj,
                    "subject_label": subj_label,
                }
                if score < 0.55:
                    item["classification"] = "critical_gap"
                    critical_gaps.append(item)
                elif score < 0.75:
                    item["classification"] = "needs_review"
                    needs_review.append(item)
                else:
                    item["classification"] = "proficient"
                    proficient.append(item)

            return {
                "total_records": len(rows),
                "critical_gaps": critical_gaps,
                "needs_review": needs_review,
                "proficient": proficient,
            }

    def teacher_improvement_tracking(self) -> dict[str, Any]:
        """Return observed progression of accuracy, mastery, and remediation impact over time."""
        with self._connection() as conn:
            # Group attempts chronologically by date or attempt cohorts
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT DATE(created_at) as attempt_date,
                       COUNT(*) as count,
                       AVG(correct) as accuracy,
                       AVG(response_ms) as avg_ms
                FROM quiz_attempts
                GROUP BY DATE(created_at)
                ORDER BY attempt_date ASC
                LIMIT 30
                """
            )
            timeline_rows = cursor.fetchall()
            progression = [
                {
                    "date": r[0] or "Initial",
                    "attempts": r[1],
                    "accuracy": round(float(r[2] or 0.0), 4),
                    "avg_response_ms": int(r[3] or 0),
                }
                for r in timeline_rows
            ]

            # Compare performance before remediation vs after remediation
            cursor.execute(
                """
                SELECT topic, COUNT(*), AVG(score)
                FROM mastery
                GROUP BY topic
                ORDER BY topic ASC
                """
            )
            topic_masteries = [
                {
                    "topic": r[0],
                    "count": r[1],
                    "avg_score": round(float(r[2] or 0.5), 4),
                }
                for r in cursor.fetchall()
            ]

            return {
                "progression": progression,
                "topic_masteries": topic_masteries,
            }

    # ---------------------------------------------------------------- academic hierarchy & classes
    def get_classes(self) -> list[dict[str, Any]]:
        with self._connection() as conn:
            classes = [dict(r) for r in conn.execute("SELECT * FROM academic_classes ORDER BY class_level ASC").fetchall()]
            for cls in classes:
                level = cls["class_level"]
                cls["sections"] = [r["name"] for r in conn.execute("SELECT name FROM sections WHERE class_level = ? ORDER BY name ASC", (level,)).fetchall()]
                cls["subjects"] = [dict(r) for r in conn.execute("SELECT * FROM subjects WHERE class_level = ? ORDER BY name ASC", (level,)).fetchall()]
            return classes

    def get_sections(self, class_level: int) -> list[str]:
        with self._connection() as conn:
            rows = conn.execute("SELECT name FROM sections WHERE class_level = ? ORDER BY name ASC", (class_level,)).fetchall()
            return [r["name"] for r in rows] if rows else ["A", "B"]

    def get_subjects(self, class_level: int) -> list[dict[str, Any]]:
        with self._connection() as conn:
            rows = conn.execute("SELECT * FROM subjects WHERE class_level = ? ORDER BY name ASC", (class_level,)).fetchall()
            if not rows:
                return [
                    {"id": f"sub-{class_level}-science", "class_level": class_level, "code": "science", "name": "Science", "icon": "flask"},
                    {"id": f"sub-{class_level}-maths", "class_level": class_level, "code": "maths", "name": "Mathematics", "icon": "calculator"},
                ]
            return [dict(r) for r in rows]

    def get_chapters(self, class_level: int, subject: str) -> list[dict[str, Any]]:
        norm_subj = subject.strip().lower()
        if norm_subj in ("math", "mathematics"):
            norm_subj = "maths"
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT * FROM chapters WHERE class_level = ? AND (subject = ? OR subject = ?) ORDER BY chapter_number ASC",
                (class_level, norm_subj, subject),
            ).fetchall()
            if rows:
                return [dict(r) for r in rows]
        # Fallback to curriculum module if not yet in chapters table
        from ila.curriculum import COURSES
        course = COURSES.get((class_level, norm_subj))
        if course:
            return [{"chapter_number": ch.number, "title": ch.title, "description": f"Chapter {ch.number}: {ch.title}"} for ch in course.chapters]
        return []

    def get_timetable(self, class_level: int, section: str = "A") -> list[dict[str, Any]]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT * FROM timetables WHERE class_level = ? AND section = ? ORDER BY period ASC",
                (class_level, section.strip().upper()),
            ).fetchall()
            return [dict(r) for r in rows]

    # ---------------------------------------------------------------- teacher authorization
    def get_teacher_assigned_classes(self, teacher_id: str) -> list[dict[str, Any]]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT DISTINCT class_level, section, subject FROM teacher_class_assignments WHERE teacher_id = ? ORDER BY class_level, section",
                (teacher_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def assign_teacher_to_class(self, teacher_id: str, class_level: int, section: str, subject: str) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO teacher_class_assignments
                    (id, teacher_id, class_level, section, subject)
                VALUES (?, ?, ?, ?, ?)
                """,
                (f"tca-{teacher_id[:8]}-{class_level}-{section}-{subject}", teacher_id, class_level, section.strip().upper(), subject.strip().lower()),
            )

    def is_teacher_authorized_for_class(self, teacher_id: str, class_level: int, section: str | None = None) -> bool:
        with self._connection() as conn:
            user_row = conn.execute("SELECT role FROM users WHERE id = ?", (teacher_id,)).fetchone()
            if user_row and user_row["role"] == "admin":
                return True
            assigned = self.get_teacher_assigned_classes(teacher_id)
            for item in assigned:
                if item["class_level"] == class_level:
                    if section is None or item["section"] == section.strip().upper():
                        return True
            return False

    def get_teacher_students_for_class(self, class_level: int, section: str = "A") -> list[dict[str, Any]]:
        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT u.id, u.full_name, u.email, u.student_identifier, u.class_level, COALESCE(u.section, 'A') as section,
                       COALESCE(AVG(m.score), 0.5) as avg_mastery,
                       COUNT(DISTINCT qa.id) as attempts_count,
                       AVG(qa.correct) as accuracy,
                       (SELECT count(DISTINCT lesson_id) FROM lesson_activity WHERE student_id=u.id) AS accessed,
                       (SELECT max(created_at) FROM lesson_activity WHERE student_id=u.id) AS last_open,
                       MAX(qa.created_at) AS last_attempt
                FROM users u
                LEFT JOIN student_enrollments se ON u.id = se.student_id
                LEFT JOIN mastery m ON (u.id = m.student_id OR u.student_identifier = m.student_id)
                LEFT JOIN quiz_attempts qa ON (u.id = qa.student_id OR u.student_identifier = qa.student_id)
                WHERE u.role = 'student'
                  AND (se.class_level = ? OR u.class_level = ?)
                  AND (se.section = ? OR u.section = ? OR u.section IS NULL)
                GROUP BY u.id
                ORDER BY u.full_name ASC
                """,
                (class_level, class_level, section.strip().upper(), section.strip().upper()),
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "full_name": r["full_name"],
                    "email": r["email"],
                    "student_identifier": r["student_identifier"],
                    "class_level": r["class_level"],
                    "section": r["section"],
                    "avg_mastery": round(float(r["avg_mastery"] or 0.5), 2),
                    "attempts_count": r["attempts_count"],
                    "accuracy": r["accuracy"], "accessed":r["accessed"],
                    "last_activity":max(r["last_open"] or "",r["last_attempt"] or ""),
                }
                for r in rows
            ]

    def get_students_needing_attention(
        self,
        teacher_id: str | None = None,
        threshold: float = 0.60,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return students whose average mastery score is below `threshold`.

        Each entry has: full_name, student_identifier, class_level, section,
        avg_score, weak_topic (the topic with the lowest mastery).
        """
        with self._connection() as conn:
            # Optionally restrict to classes the teacher is assigned to
            class_filter = ""
            params: list[Any] = []
            if teacher_id:
                assigned_rows = conn.execute(
                    "SELECT DISTINCT class_level, section FROM teacher_class_assignments WHERE teacher_id = ?",
                    (teacher_id,),
                ).fetchall()
                if assigned_rows:
                    placeholders = " OR ".join(
                        "(u.class_level = ? AND COALESCE(u.section,'A') = ?)"
                        for _ in assigned_rows
                    )
                    class_filter = f"AND ({placeholders})"
                    for r in assigned_rows:
                        params.extend([r["class_level"], r["section"]])

            query = f"""
                SELECT u.id, u.full_name, u.student_identifier,
                       u.class_level, COALESCE(u.section, 'A') AS section,
                       AVG(m.score) AS avg_score
                FROM users u
                JOIN mastery m ON (u.id = m.student_id OR u.student_identifier = m.student_id)
                WHERE u.role = 'student'
                {class_filter}
                GROUP BY u.id
                HAVING AVG(m.score) < ?
                ORDER BY avg_score ASC
                LIMIT ?
            """
            params.extend([threshold, limit])
            rows = conn.execute(query, params).fetchall()

            result: list[dict[str, Any]] = []
            for r in rows:
                # Find the single weakest topic for this student
                weak_row = conn.execute(
                    """
                    SELECT topic, AVG(score) AS ts
                    FROM mastery
                    WHERE student_id = ? OR student_id = ?
                    GROUP BY topic
                    ORDER BY ts ASC
                    LIMIT 1
                    """,
                    (r["id"], r["student_identifier"] or ""),
                ).fetchone()
                result.append(
                    {
                        "full_name": r["full_name"] or r["student_identifier"],
                        "student_identifier": r["student_identifier"],
                        "class_level": r["class_level"],
                        "section": r["section"],
                        "score": round(float(r["avg_score"] or 0.0), 2),
                        "weak_topic": weak_row["topic"] if weak_row else "General",
                    }
                )
            return result

    # ---------------------------------------------------------------- student enrollments
    def enroll_student(self, student_id: str, class_level: int, section: str = "A", roll_number: str | None = None) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO student_enrollments
                    (id, student_id, class_level, section, roll_number)
                VALUES (?, ?, ?, ?, ?)
                """,
                (f"enr-{student_id[:12]}", student_id, class_level, section.strip().upper(), roll_number),
            )

    def get_student_enrollment(self, student_id: str) -> dict[str, Any]:
        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT se.*, u.full_name, u.email, u.student_identifier
                FROM student_enrollments se
                JOIN users u ON se.student_id = u.id
                WHERE se.student_id = ?
                """,
                (student_id,),
            ).fetchone()
            if row:
                return dict(row)
            # Check user table directly
            u = conn.execute("SELECT * FROM users WHERE id = ?", (student_id,)).fetchone()
            if u:
                return {
                    "student_id": u["id"],
                    "class_level": u["class_level"] or 10,
                    "section": u["section"] if "section" in u.keys() and u["section"] else "A",
                    "roll_number": u["student_identifier"],
                    "full_name": u["full_name"],
                    "email": u["email"],
                }
            return {"student_id": student_id, "class_level": 10, "section": "A", "roll_number": "STUDENT-10"}

    # ---------------------------------------------------------------- lessons & daily materials
    def create_lesson(
        self,
        *,
        title: str,
        class_level: int,
        section: str = "A",
        subject: str,
        chapter_number: int,
        chapter_title: str,
        teacher_id: str,
        teaching_date: str,
        transcript: str = "",
        notes_markdown: str = "",
        notes_json: dict[str, Any] | None = None,
        key_concepts: list[dict[str, Any]] | None = None,
        examples: list[dict[str, Any]] | None = None,
        duration_s: float = 0.0,
        audio_filename: str | None = None,
        audio_path: str | None = None,
        status: str = "draft",
    ) -> str:
        lesson_id = uuid4().hex
        now = _now()
        pub_at = now if status == "published" else None
        with self._connection() as conn:
            conn.execute("""INSERT OR IGNORE INTO chapters(id,class_level,subject,chapter_number,title)
                            VALUES (?,?,?,?,?)""", (uuid4().hex,class_level,subject,chapter_number,chapter_title))
            conn.execute(
                """
                INSERT INTO lessons
                    (id, title, class_level, section, subject, chapter_number, chapter_title,
                     teacher_id, teaching_date, status, published_at, duration_s,
                     audio_filename, audio_path, transcript, notes_markdown, notes_json,
                     key_concepts_json, examples_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lesson_id,
                    title.strip(),
                    class_level,
                    section.strip().upper(),
                    subject.strip().lower(),
                    chapter_number,
                    chapter_title.strip(),
                    teacher_id,
                    teaching_date.strip(),
                    status,
                    pub_at,
                    duration_s,
                    audio_filename,
                    audio_path,
                    transcript,
                    notes_markdown,
                    json.dumps(notes_json, ensure_ascii=False) if notes_json is not None else None,
                    json.dumps(key_concepts, ensure_ascii=False) if key_concepts is not None else None,
                    json.dumps(examples, ensure_ascii=False) if examples is not None else None,
                    now,
                    now,
                ),
            )
            # If created directly as published, notify students
            if status == "published":
                self._notify_students_of_lesson(conn, lesson_id, class_level, section, title, subject)
        return lesson_id

    def update_lesson(
        self,
        lesson_id: str,
        *,
        title: str | None = None,
        transcript: str | None = None,
        notes_markdown: str | None = None,
        notes_json: dict[str, Any] | None = None,
        key_concepts: list[dict[str, Any]] | None = None,
        examples: list[dict[str, Any]] | None = None,
        status: str | None = None,
        duration_s: float | None = None,
        audio_filename: str | None = None,
        audio_path: str | None = None,
    ) -> bool:
        now = _now()
        fields: list[str] = ["updated_at = ?"]
        params: list[Any] = [now]

        if title is not None:
            fields.append("title = ?")
            params.append(title.strip())
        if transcript is not None:
            fields.append("transcript = ?")
            params.append(transcript)
        if notes_markdown is not None:
            fields.append("notes_markdown = ?")
            params.append(notes_markdown)
        if notes_json is not None:
            fields.append("notes_json = ?")
            params.append(json.dumps(notes_json, ensure_ascii=False))
        if key_concepts is not None:
            fields.append("key_concepts_json = ?")
            params.append(json.dumps(key_concepts, ensure_ascii=False))
        if examples is not None:
            fields.append("examples_json = ?")
            params.append(json.dumps(examples, ensure_ascii=False))
        if status is not None:
            fields.append("status = ?")
            params.append(status)
            if status == "published":
                fields.append("published_at = ?")
                params.append(now)
        if duration_s is not None:
            fields.append("duration_s = ?")
            params.append(duration_s)
        if audio_filename is not None:
            fields.append("audio_filename = ?")
            params.append(audio_filename)
        if audio_path is not None:
            fields.append("audio_path = ?")
            params.append(audio_path)

        params.append(lesson_id)
        with self._connection() as conn:
            cursor = conn.execute(f"UPDATE lessons SET {', '.join(fields)} WHERE id = ?", params)
            if cursor.rowcount > 0 and status == "published":
                row = conn.execute("SELECT class_level, section, title, subject FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
                if row:
                    self._notify_students_of_lesson(conn, lesson_id, row["class_level"], row["section"], row["title"], row["subject"])
            return cursor.rowcount > 0

    def get_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        with self._connection() as conn:
            row = conn.execute(
                """
                SELECT l.*, u.full_name AS teacher_name
                FROM lessons l
                LEFT JOIN users u ON l.teacher_id = u.id
                WHERE l.id = ?
                """,
                (lesson_id,),
            ).fetchone()
            if not row:
                return None
            res = dict(row)
            res["notes_json"] = _loads(res.get("notes_json"))
            res["key_concepts"] = _loads(res.get("key_concepts_json")) or []
            res["examples"] = _loads(res.get("examples_json")) or []
            res["is_student_generated"] = res.get("status") == "student_private"
            return res

    def list_lessons(
        self,
        *,
        class_level: int | None = None,
        section: str | None = None,
        subject: str | None = None,
        status: str | None = None,
        teacher_id: str | None = None,
        search: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []

        if class_level is not None:
            conditions.append("l.class_level = ?")
            params.append(class_level)
        if section is not None:
            conditions.append("l.section = ?")
            params.append(section.strip().upper())
        if subject is not None:
            norm_subj = subject.strip().lower()
            if norm_subj in ("math", "mathematics"):
                norm_subj = "maths"
            conditions.append("(l.subject = ? OR l.subject = ?)")
            params.extend([norm_subj, subject])
        if status is not None:
            conditions.append("l.status = ?")
            params.append(status)
        if teacher_id is not None:
            conditions.append("l.teacher_id = ?")
            params.append(teacher_id)
        if search and search.strip():
            conditions.append("(l.title LIKE ? OR l.chapter_title LIKE ? OR l.transcript LIKE ?)")
            pat = f"%{search.strip()}%"
            params.extend([pat, pat, pat])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT l.*, COALESCE(u.full_name, 'Classroom Teacher') AS teacher_name
            FROM lessons l
            LEFT JOIN users u ON l.teacher_id = u.id
            {where_clause}
            ORDER BY l.teaching_date DESC, l.created_at DESC
            LIMIT ?
        """
        params.append(limit)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()
            lessons = []
            for r in rows:
                item = dict(r)
                item["notes_json"] = _loads(item.get("notes_json"))
                item["key_concepts"] = _loads(item.get("key_concepts_json")) or []
                item["examples"] = _loads(item.get("examples_json")) or []
                item["has_transcript"] = bool(item.get("transcript") and len(str(item.get("transcript")).strip()) > 0)
                item["has_notes"] = bool(item.get("notes_markdown") and len(str(item.get("notes_markdown")).strip()) > 0)
                lessons.append(item)
            return lessons

    def export_lesson_documents(self, conn, lesson_id):
        row = conn.execute("SELECT class_level,subject,transcript,notes_markdown FROM lessons WHERE id=?", (lesson_id,)).fetchone()
        from hashlib import sha256
        import re
        component = re.sub(r"[^a-z0-9_-]", "_", row["subject"].lower())
        paths = []
        for folder, suffix, value in (("transcripts", "txt", row["transcript"]), ("notes", "md", row["notes_markdown"])):
            revision = sha256(value.encode()).hexdigest()[:16]
            path = Path(folder) / f"class_{row['class_level']}" / component / f"{lesson_id}-{revision}.{suffix}"
            target = self.path.parent / path
            target.parent.mkdir(parents=True, exist_ok=True)
            partial = target.with_suffix(f".{uuid4().hex}.tmp")
            partial.write_text(value, encoding="utf-8")
            partial.replace(target)
            paths.append(path.as_posix())
        conn.execute("INSERT OR REPLACE INTO lesson_documents VALUES (?,?,?)", (lesson_id,*paths))

    def publish_lesson(self, lesson_id: str, teacher_id: str) -> dict[str, Any]:
        now = _now()
        with self._connection() as conn:
            cursor = conn.execute(
                """
                UPDATE lessons
                SET status = 'published', published_at = ?, updated_at = ?
                WHERE id = ? AND teacher_id = ? AND status != 'published'
                """,
                (now, now, lesson_id, teacher_id),
            )
            if cursor.rowcount == 0:
                return self.get_lesson(lesson_id) or {}
            row = conn.execute("SELECT class_level, section, title, subject FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
            self.export_lesson_documents(conn,lesson_id)
            if row:
                self._notify_students_of_lesson(conn, lesson_id, row["class_level"], row["section"], row["title"], row["subject"])
        return self.get_lesson(lesson_id) or {}

    def archive_lesson(self, lesson_id: str, teacher_id: str) -> bool:
        now = _now()
        with self._connection() as conn:
            cursor = conn.execute(
                "UPDATE lessons SET status = 'archived', updated_at = ? WHERE id = ?",
                (now, lesson_id),
            )
            return cursor.rowcount > 0

    def _notify_students_of_lesson(
        self,
        conn: sqlite3.Connection,
        lesson_id: str,
        class_level: int,
        section: str,
        title: str,
        subject: str,
    ) -> None:
        """Create an in-app notification for all enrolled students in the target class and section."""
        now = _now()
        # Find students enrolled or in user table with matching class/section
        students = conn.execute(
            """
            SELECT DISTINCT u.id
            FROM users u
            LEFT JOIN student_enrollments se ON u.id = se.student_id
            WHERE u.role = 'student'
              AND (se.class_level = ? OR u.class_level = ?)
              AND u.is_active = 1
            """,
            (class_level, class_level),
        ).fetchall()

        for s in students:
            notif_id = uuid4().hex
            conn.execute(
                """
                INSERT INTO notifications
                    (id, user_id, title, message, type, link, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    notif_id,
                    s["id"],
                    f"New Lesson Published: {title}",
                    f"Your teacher published a new {subject.capitalize()} lesson: '{title}'. Check notes and transcript.",
                    "lesson_published",
                    f"/student/subjects?lesson={lesson_id}",
                    now,
                ),
            )

    # ---------------------------------------------------------------- lesson activity & completion
    def record_lesson_activity(
        self,
        student_id: str,
        lesson_id: str,
        event_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        now = _now()
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO lesson_activity (student_id, lesson_id, event_type, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    student_id,
                    lesson_id,
                    event_type,
                    json.dumps(metadata or {}, ensure_ascii=False),
                    now,
                ),
            )
            # Update lesson_completions table
            current = conn.execute(
                "SELECT * FROM lesson_completions WHERE student_id = ? AND lesson_id = ?",
                (student_id, lesson_id),
            ).fetchone()
            tr_view = 1 if event_type == "transcript_read" else (current["transcript_viewed"] if current else 0)
            no_view = 1 if event_type == "notes_read" else (current["notes_viewed"] if current else 0)
            comp = 1 if event_type == "marked_complete" else (current["completed"] if current else 0)
            q_comp = 1 if event_type == "quiz_completed" else (current["quiz_completed"] if current else 0)
            q_score = metadata.get("score") if (metadata and "score" in metadata) else (current["quiz_score"] if current else None)

            conn.execute(
                """
                INSERT INTO lesson_completions
                    (student_id, lesson_id, completed, transcript_viewed, notes_viewed, quiz_completed, quiz_score, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(student_id, lesson_id) DO UPDATE SET
                    completed = MAX(lesson_completions.completed, excluded.completed),
                    transcript_viewed = MAX(lesson_completions.transcript_viewed, excluded.transcript_viewed),
                    notes_viewed = MAX(lesson_completions.notes_viewed, excluded.notes_viewed),
                    quiz_completed = MAX(lesson_completions.quiz_completed, excluded.quiz_completed),
                    quiz_score = COALESCE(excluded.quiz_score, lesson_completions.quiz_score),
                    updated_at = excluded.updated_at
                """,
                (student_id, lesson_id, comp, tr_view, no_view, q_comp, q_score, now),
            )

    def get_lesson_completion(self, student_id: str, lesson_id: str) -> dict[str, Any]:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM lesson_completions WHERE student_id = ? AND lesson_id = ?",
                (student_id, lesson_id),
            ).fetchone()
            if row:
                return dict(row)
            return {
                "student_id": student_id,
                "lesson_id": lesson_id,
                "completed": False,
                "transcript_viewed": False,
                "notes_viewed": False,
                "quiz_completed": False,
                "quiz_score": None,
            }

    def mark_lesson_completed(self, student_id: str, lesson_id: str, completed: bool = True) -> dict[str, Any]:
        now = _now()
        val = 1 if completed else 0
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO lesson_completions
                    (student_id, lesson_id, completed, transcript_viewed, notes_viewed, quiz_completed, updated_at)
                VALUES (?, ?, ?, 1, 1, 0, ?)
                ON CONFLICT(student_id, lesson_id) DO UPDATE SET
                    completed = excluded.completed,
                    updated_at = excluded.updated_at
                """,
                (student_id, lesson_id, val, now),
            )
            # Record activity event
            conn.execute(
                "INSERT INTO lesson_activity (student_id, lesson_id, event_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (student_id, lesson_id, "marked_complete" if completed else "unmarked_complete", "{}", now),
            )
        return self.get_lesson_completion(student_id, lesson_id)

    # ---------------------------------------------------------------- student tree & dashboard
    def get_student_subjects_tree(self, student_id: str, class_level: int, section: str = "A") -> list[dict[str, Any]]:
        """Construct the full academic hierarchy: Class -> Section -> Subject -> Chapter -> Daily Classroom Lessons."""
        with self._connection() as conn:
            subjects = self.get_subjects(class_level)
            # Fetch all published lessons for this class and this student's private self-study lessons
            lessons = conn.execute(
                """
                SELECT l.*, COALESCE(u.full_name, 'Classroom Teacher') AS teacher_name,
                       COALESCE(lc.completed, 0) AS student_completed,
                       COALESCE(lc.transcript_viewed, 0) AS student_transcript_viewed,
                       COALESCE(lc.notes_viewed, 0) AS student_notes_viewed,
                       COALESCE(lc.quiz_completed, 0) AS student_quiz_completed,
                       lc.quiz_score AS student_quiz_score
                FROM lessons l
                LEFT JOIN users u ON l.teacher_id = u.id
                LEFT JOIN lesson_completions lc ON l.id = lc.lesson_id AND lc.student_id = ?
                WHERE l.class_level = ?
                  AND (l.status = 'published' OR (l.status = 'student_private' AND l.teacher_id = ?))
                ORDER BY l.teaching_date DESC, l.chapter_number ASC
                """,
                (student_id, class_level, student_id),
            ).fetchall()

            # Group lessons by subject and chapter
            lessons_by_sub_ch: dict[tuple[str, int], list[dict[str, Any]]] = {}
            for r in lessons:
                sub_code = r["subject"].strip().lower()
                ch_num = r["chapter_number"]
                key = (sub_code, ch_num)
                if key not in lessons_by_sub_ch:
                    lessons_by_sub_ch[key] = []
                lessons_by_sub_ch[key].append({
                    "id": r["id"],
                    "title": r["title"],
                    "teaching_date": r["teaching_date"],
                    "teacher_name": "You (Self-Study)" if r["status"] == "student_private" else r["teacher_name"],
                    "status": r["status"],
                    "is_student_generated": r["status"] == "student_private",
                    "published_at": r["published_at"],
                    "duration_s": r["duration_s"],
                    "has_transcript": bool(r["transcript"] and len(r["transcript"].strip()) > 0),
                    "has_notes": bool(r["notes_markdown"] and len(r["notes_markdown"].strip()) > 0),
                    "completed": bool(r["student_completed"]),
                    "transcript_viewed": bool(r["student_transcript_viewed"]),
                    "notes_viewed": bool(r["student_notes_viewed"]),
                    "quiz_completed": bool(r["student_quiz_completed"]),
                    "quiz_score": r["student_quiz_score"],
                })

            tree = []
            for subj in subjects:
                sub_code = subj["code"].strip().lower()
                chapters = self.get_chapters(class_level, sub_code)
                chapters_list = []
                for ch in chapters:
                    ch_num = ch["chapter_number"]
                    ch_lessons = lessons_by_sub_ch.get((sub_code, ch_num), [])
                    chapters_list.append({
                        "chapter_number": ch_num,
                        "title": ch["title"],
                        "description": ch.get("description", ""),
                        "lessons_count": len(ch_lessons),
                        "completed_count": sum(1 for l in ch_lessons if l["completed"]),
                        "lessons": ch_lessons,
                    })

                total_sub_lessons = sum(len(ch["lessons"]) for ch in chapters_list)
                total_completed = sum(ch["completed_count"] for ch in chapters_list)
                tree.append({
                    "subject_code": sub_code,
                    "subject_name": subj["name"],
                    "icon": subj.get("icon", "book"),
                    "total_lessons": total_sub_lessons,
                    "completed_lessons": total_completed,
                    "progress_pct": round((total_completed / total_sub_lessons * 100), 1) if total_sub_lessons > 0 else 0,
                    "chapters": chapters_list,
                })
            return tree

    # ---------------------------------------------------------------- notifications
    def get_user_notifications(self, user_id: str, unread_only: bool = False) -> list[dict[str, Any]]:
        with self._connection() as conn:
            query = "SELECT * FROM notifications WHERE user_id = ?"
            params: list[Any] = [user_id]
            if unread_only:
                query += " AND is_read = 0"
            query += " ORDER BY created_at DESC LIMIT 30"
            return [dict(r) for r in conn.execute(query, params).fetchall()]

    def mark_notification_read(self, notification_id: str, user_id: str) -> bool:
        with self._connection() as conn:
            cursor = conn.execute(
                "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
                (notification_id, user_id),
            )
            return cursor.rowcount > 0

    def create_notification(
        self,
        user_id: str,
        title: str,
        message: str,
        type: str = "lesson_published",
        link: str | None = None,
    ) -> str:
        nid = uuid4().hex
        now = _now()
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (nid, user_id, title, message, type, link, now),
            )
        return nid

    # ---------------------------------------------------------------- activity log
    def get_student_activity_log(
        self,
        class_level: int | None = None,
        section: str | None = None,
        student_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []

        if student_id:
            conditions.append("la.student_id = ?")
            params.append(student_id)
        if class_level is not None:
            conditions.append("l.class_level = ?")
            params.append(class_level)
        if section is not None:
            conditions.append("l.section = ?")
            params.append(section.strip().upper())

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT la.id, la.student_id, la.lesson_id, la.event_type, la.metadata_json, la.created_at,
                   COALESCE(u.full_name, la.student_id) AS student_name,
                   l.title AS lesson_title, l.subject, l.class_level, l.section
            FROM lesson_activity la
            JOIN lessons l ON la.lesson_id = l.id
            LEFT JOIN users u ON la.student_id = u.id OR la.student_id = u.student_identifier
            {where}
            ORDER BY la.created_at DESC
            LIMIT ?
        """
        params.append(limit)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()
            activity = []
            for r in rows:
                item = dict(r)
                item["metadata"] = _loads(item.get("metadata_json")) or {}
                activity.append(item)
            return activity

    # ---------------------------------------------------------------- practice & quizzes
    def get_student_practice_data(self, student_id: str, class_level: int | None = None) -> dict[str, Any]:
        with self._connection() as conn:
            # 1. Past quiz sessions
            sessions = conn.execute(
                """
                SELECT id, class_level, subject, topic, created_at, updated_at, completed, score
                FROM quiz_sessions
                WHERE student_id = ? OR student_id = (SELECT id FROM users WHERE student_identifier = ?)
                ORDER BY created_at DESC
                LIMIT 30
                """,
                (student_id, student_id),
            ).fetchall()

            # 2. Past question attempts with incorrect answers for review
            attempts = conn.execute(
                """
                SELECT id, quiz_id, question_id, topic, difficulty, prompt, expected, response, correct, response_ms, created_at
                FROM quiz_attempts
                WHERE student_id = ? OR student_id = (SELECT id FROM users WHERE student_identifier = ?)
                ORDER BY created_at DESC
                LIMIT 50
                """,
                (student_id, student_id),
            ).fetchall()

            incorrect_attempts = [dict(r) for r in attempts if not r["correct"]]
            completed_count = sum(1 for s in sessions if s["completed"])
            total_score = sum(s["score"] for s in sessions if s["completed"])
            avg_score = round(total_score / completed_count, 2) if completed_count > 0 else 0.0

            # 3. Weak topics from mastery table (EMA mastery < 0.65)
            weak_topics = conn.execute(
                """
                SELECT topic, score, attempts, correct, updated_at
                FROM mastery
                WHERE (student_id = ? OR student_id = (SELECT id FROM users WHERE student_identifier = ?))
                  AND score < 0.65
                ORDER BY score ASC
                LIMIT 10
                """,
                (student_id, student_id),
            ).fetchall()

            return {
                "total_quizzes": len(sessions),
                "completed_quizzes": completed_count,
                "average_score": avg_score,
                "recent_sessions": [dict(s) for s in sessions],
                "recent_attempts": [dict(a) for a in attempts],
                "incorrect_attempts": incorrect_attempts,
                "suggested_revision": [dict(w) for w in weak_topics],
            }

    # ---------------------------------------------------------------- password reset
    def reset_password(self, email: str, new_password_hash: str, student_identifier: str | None = None) -> bool:
        with self._connection() as conn:
            if student_identifier:
                cursor = conn.execute(
                    "UPDATE users SET password_hash = ?, updated_at = ? WHERE LOWER(email) = LOWER(?) AND (student_identifier = ? OR id = ?)",
                    (new_password_hash, _now(), email.strip(), student_identifier.strip(), student_identifier.strip()),
                )
            else:
                cursor = conn.execute(
                    "UPDATE users SET password_hash = ?, updated_at = ? WHERE LOWER(email) = LOWER(?)",
                    (new_password_hash, _now(), email.strip()),
                )
            # Revoke existing sessions
            user = conn.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),)).fetchone()
            if user:
                conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user["id"],))
            return cursor.rowcount > 0

    def reset_password_for_user(self, user_id: str, new_password_hash: str) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (new_password_hash, _now(), user_id),
            )
            if cursor.rowcount:
                connection.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
            return cursor.rowcount > 0
