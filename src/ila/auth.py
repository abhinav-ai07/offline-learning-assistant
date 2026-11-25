"""Authentication and authorization utilities for ILA.

Provides password hashing via bcrypt, secure token generation, and FastAPI
dependencies for role-based access control (student, teacher, admin).
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import bcrypt
from fastapi import Cookie, Header, HTTPException, status

SESSION_DURATION_DAYS = 14
REMEMBER_ME_DAYS = 30


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with a generated salt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def generate_session_token() -> str:
    """Generate a secure, URL-safe session token."""
    return secrets.token_urlsafe(32)


def compute_expiration(remember_me: bool = False) -> str:
    """Compute the ISO-formatted UTC expiration timestamp for a session."""
    days = REMEMBER_ME_DAYS if remember_me else SESSION_DURATION_DAYS
    expires = datetime.now(UTC) + timedelta(days=days)
    return expires.isoformat(timespec="seconds")


def extract_token(
    ila_session: str | None = None,
    authorization: str | None = None,
) -> str | None:
    """Extract session token from Authorization Bearer header or cookie."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    if ila_session:
        return ila_session.strip()
    return None

