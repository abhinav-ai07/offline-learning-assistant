"""Tests for user authentication, password hashing, and role-based storage."""

import sqlite3
from pathlib import Path

from ila.auth import (
    compute_expiration,
    extract_token,
    generate_session_token,
    hash_password,
    verify_password,
)
from ila.storage import Storage


def test_password_hashing() -> None:
    pw = "supersecret123"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("wrongpassword", hashed) is False
    assert verify_password("", hashed) is False


def test_session_token_and_expiration() -> None:
    token = generate_session_token()
    assert isinstance(token, str)
    assert len(token) > 20
    exp = compute_expiration(remember_me=False)
    assert isinstance(exp, str)


def test_extract_token() -> None:
    assert extract_token(ila_session="token123") == "token123"
    assert extract_token(authorization="Bearer token456") == "token456"
    assert extract_token(authorization="bearer token789") == "token789"
    assert extract_token() is None


def test_user_creation_and_auth_sessions(tmp_path: Path) -> None:
    store = Storage(tmp_path / "test_auth.db")

    # 1. No teachers initially
    assert store.has_teachers() is False
    assert store.count_users() == 0

    # 2. Create student
    student = store.create_user(
        full_name="Alice Student",
        email="alice@example.com",
        password_hash=hash_password("alice123"),
        role="student",
        class_level=10,
        student_identifier="alice-10",
    )
    assert student["email"] == "alice@example.com"
    assert student["role"] == "student"
    assert student["student_identifier"] == "alice-10"

    # 3. Create teacher
    teacher = store.create_user(
        full_name="Prof. Sharma",
        email="sharma@school.edu",
        password_hash=hash_password("teacherpass"),
        role="teacher",
        class_level=10,
    )
    assert teacher["role"] == "teacher"
    assert store.has_teachers() is True
    assert store.count_users("student") == 1
    assert store.count_users("teacher") == 1

    # 4. Auth session token
    token = generate_session_token()
    exp = compute_expiration(remember_me=False)
    store.create_auth_session(student["id"], token, exp)

    session_user = store.get_auth_session(token)
    assert session_user is not None
    assert session_user["email"] == "alice@example.com"
    assert session_user["role"] == "student"

    # 5. Delete auth session
    store.delete_auth_session(token)
    assert store.get_auth_session(token) is None


def test_storage_migrates_email_to_optional(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy_auth.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                class_level INTEGER DEFAULT 10,
                student_identifier TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            """
            INSERT INTO users
                (id, full_name, email, password_hash, role, class_level,
                 student_identifier, created_at, updated_at, is_active)
            VALUES ('legacy-id', 'Legacy Student', 'legacy@example.test', 'hash',
                    'student', 10, 'LEG-10', 'now', 'now', 1)
            """
        )

    store = Storage(database_path)
    with sqlite3.connect(database_path) as connection:
        email_column = next(
            column
            for column in connection.execute("PRAGMA table_info(users)")
            if column[1] == "email"
        )
        assert email_column[3] == 0
    assert store.get_user_by_id("legacy-id")["email"] == "legacy@example.test"
