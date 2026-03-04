"""Authentication dependency for FastAPI.

When SUPABASE_JWT_SECRET is set, every request must carry a valid Supabase JWT
in the Authorization header.  The JWT subject (``sub`` claim) becomes the
``user_id`` threaded through every endpoint.

When the secret is NOT set (local development), auth is skipped and all
requests are attributed to ``settings.default_user_id``.
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from typing import Optional

import jwt

from mcf.api.config import settings


def _verify_token(token: str) -> str:
    """Verify a Supabase JWT and return the user_id (sub claim)."""
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing sub claim",
            )
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}"
        )


def get_current_user(authorization: Optional[str] = Header(default=None)) -> str:
    """FastAPI dependency that resolves the current user_id.

    - If auth is disabled (no SUPABASE_JWT_SECRET): returns default_user_id.
    - If auth is enabled: validates Bearer token and returns the user's UUID.
    """
    if not settings.auth_enabled:
        return settings.default_user_id

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be: Bearer <token>",
        )

    return _verify_token(token)
