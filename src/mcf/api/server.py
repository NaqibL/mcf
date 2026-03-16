"""FastAPI server."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from mcf.api.auth import get_current_user
from mcf.api.config import settings
from mcf.api.services.matching_service import MatchingService
from mcf.lib.embeddings.base import EmbedderProtocol
from mcf.lib.embeddings.embedder import Embedder, EmbedderConfig
from mcf.lib.embeddings.resume import extract_resume_text, preprocess_resume_text
from mcf.lib.storage.base import Storage


def _make_store() -> Storage:
    """Return a DuckDBStore or PostgresStore depending on DATABASE_URL."""
    if settings.database_url:
        from mcf.lib.storage.postgres_store import PostgresStore

        return PostgresStore(settings.database_url)

    from mcf.lib.storage.duckdb_store import DuckDBStore

    db_path = Path(settings.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return DuckDBStore(str(db_path))


# Global store — initialised in lifespan
_store: Storage | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _store
    _store = _make_store()
    yield
    if _store:
        _store.close()


app = FastAPI(title="Job Matcher API", version="0.1.0", lifespan=lifespan)


def _add_cors_if_missing(response, request: Request) -> None:
    """Add CORS headers to response when missing (e.g. on 500 errors)."""
    origin = request.headers.get("origin")
    if not origin or origin not in settings.cors_origins:
        return
    existing = {h.lower() for h in response.headers}
    if "access-control-allow-origin" not in existing:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"


class CORSEnforcementMiddleware(BaseHTTPMiddleware):
    """Ensure CORS headers on all responses when request has Origin.

    FastAPI's CORSMiddleware can omit headers on 500 and other error paths. This
    safety net ensures the browser doesn't block with 'missing Allow Origin'.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:
            from starlette.responses import JSONResponse

            status = exc.status_code if isinstance(exc, HTTPException) else 500
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            response = JSONResponse(status_code=status, content={"detail": detail})
        _add_cors_if_missing(response, request)
        return response


# CORSEnforcement runs first (outermost); CORSMiddleware handles preflight and normal CORS
app.add_middleware(CORSEnforcementMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


def get_store() -> Storage:
    if _store is None:
        raise RuntimeError("Store not initialised")
    return _store


# ---------------------------------------------------------------------------
# Job endpoints
# ---------------------------------------------------------------------------


@app.post("/api/jobs/{job_uuid}/interact")
def mark_interaction(
    job_uuid: str,
    interaction_type: str = Query(
        ...,
        description="Interaction type: viewed, dismissed, interested, not_interested",
    ),
    user_id: str = Depends(get_current_user),
):
    """Record a user interaction with a job (interested / not_interested / …)."""
    store = get_store()
    valid_types = {"viewed", "dismissed", "applied", "saved", "interested", "not_interested"}
    if interaction_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interaction type. Must be one of: {', '.join(sorted(valid_types))}",
        )
    job = store.get_job(job_uuid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    store.record_interaction(user_id=user_id, job_uuid=job_uuid, interaction_type=interaction_type)
    return {"status": "ok", "job_uuid": job_uuid, "interaction_type": interaction_type}


# ---------------------------------------------------------------------------
# Discover endpoints
# ---------------------------------------------------------------------------


@app.get("/api/discover/stats")
def get_discover_stats(user_id: str = Depends(get_current_user)):
    """Return counts of interested, not_interested, and unrated jobs."""
    store = get_store()
    return store.get_discover_stats(user_id=user_id)


# ---------------------------------------------------------------------------
# Dashboard endpoints
# ---------------------------------------------------------------------------


@app.get("/api/dashboard/summary")
def get_dashboard_summary(user_id: str = Depends(get_current_user)):
    """Return dashboard summary: total jobs, active, by source (MCF only), jobs with embeddings."""
    store = get_store()
    return store.get_dashboard_summary()


@app.get("/api/dashboard/jobs-over-time-posted-and-removed")
def get_dashboard_jobs_over_time_posted_and_removed(
    limit_days: int = Query(default=90, ge=1, le=365),
    user_id: str = Depends(get_current_user),
):
    """Return daily posted (active) and removed (inactive) job counts by date."""
    store = get_store()
    return store.get_jobs_over_time_posted_and_removed(limit_days=limit_days)


@app.get("/api/dashboard/active-jobs-over-time")
def get_dashboard_active_jobs_over_time(
    limit_days: int = Query(default=90, ge=1, le=365),
    user_id: str = Depends(get_current_user),
):
    """Return total active jobs per day from job_daily_stats."""
    store = get_store()
    return store.get_active_jobs_over_time(limit_days=limit_days)


@app.get("/api/dashboard/active-jobs-over-time-public")
def get_dashboard_active_jobs_over_time_public(
    limit_days: int = Query(default=30, ge=1, le=90),
):
    """Public endpoint for active jobs over time (no auth). Used on login screen."""
    store = get_store()
    return store.get_active_jobs_over_time(limit_days=limit_days)


@app.get("/api/dashboard/jobs-by-category")
def get_dashboard_jobs_by_category(
    limit_days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=30, ge=1, le=50),
    user_id: str = Depends(get_current_user),
):
    """Return job counts by MCF category (from job_daily_stats)."""
    store = get_store()
    return store.get_jobs_by_category(limit_days=limit_days, limit=limit)


@app.get("/api/dashboard/category-trends")
def get_dashboard_category_trends(
    category: str = Query(..., min_length=1),
    limit_days: int = Query(default=90, ge=1, le=365),
    user_id: str = Depends(get_current_user),
):
    """Return trend data for a specific category from job_daily_stats."""
    store = get_store()
    return store.get_category_trends(category=category, limit_days=limit_days)


@app.get("/api/dashboard/category-stats")
def get_dashboard_category_stats(
    category: str = Query(..., min_length=1),
    user_id: str = Depends(get_current_user),
):
    """Return employment type, position level, salary breakdown for a category."""
    store = get_store()
    return store.get_category_stats(category=category)


@app.get("/api/dashboard/jobs-by-employment-type")
def get_dashboard_jobs_by_employment_type(
    limit_days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: str = Depends(get_current_user),
):
    """Return job counts by employment type (from job_daily_stats)."""
    store = get_store()
    return store.get_jobs_by_employment_type(limit_days=limit_days, limit=limit)


@app.get("/api/dashboard/jobs-by-position-level")
def get_dashboard_jobs_by_position_level(
    limit_days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: str = Depends(get_current_user),
):
    """Return job counts by position level (from job_daily_stats)."""
    store = get_store()
    return store.get_jobs_by_position_level(limit_days=limit_days, limit=limit)


@app.get("/api/dashboard/salary-distribution")
def get_dashboard_salary_distribution(user_id: str = Depends(get_current_user)):
    """Return salary distribution buckets (from jobs.salary_min)."""
    store = get_store()
    return store.get_salary_distribution()


# ---------------------------------------------------------------------------
# Profile endpoints
# ---------------------------------------------------------------------------


@app.get("/api/profile")
def get_profile(user_id: str = Depends(get_current_user)):
    """Get current user profile and resume status."""
    store = get_store()
    profile = store.get_profile_by_user_id(user_id)
    resume_path = Path(settings.resume_path)
    resume_exists = resume_path.exists()
    return {
        "user_id": user_id,
        "profile": profile,
        "resume_path": str(resume_path),
        "resume_exists": resume_exists,
    }


@app.post("/api/profile/process-resume")
async def process_resume(user_id: str = Depends(get_current_user)):
    """Process resume from local file or Supabase Storage.

    Tries local file first (dev). If not found and profile has resume_storage_path,
    fetches from Supabase Storage and processes that. Fixes Re-process in production.
    """
    store = get_store()
    resume_path = Path(settings.resume_path)

    if resume_path.exists():
        try:
            resume_text = extract_resume_text(resume_path)
            return _process_resume_text(store, user_id, resume_text)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to process resume: {e}")

    # Local file missing — try Supabase Storage
    profile = store.get_profile_by_user_id(user_id)
    if not profile or not profile.get("resume_storage_path"):
        raise HTTPException(
            status_code=404,
            detail="No resume found. Upload a resume first, or ensure the file exists at the configured path.",
        )

    storage_path = profile["resume_storage_path"]
    if not settings.storage_enabled:
        raise HTTPException(
            status_code=503,
            detail="Resume is in cloud storage but Supabase Storage is not configured.",
        )

    try:
        data = await _download_from_supabase(storage_path)
        resume_text = extract_resume_text(data)
        return _process_resume_text(store, user_id, resume_text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process resume from storage: {e}")


@app.post("/api/profile/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    """Upload a resume file, extract its text, and update the profile + embedding.

    Accepts PDF or DOCX.  If Supabase Storage is configured the raw file is
    also stored there so it can be re-processed later.
    """
    allowed = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Upload a PDF or DOCX.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Optionally push to Supabase Storage
    storage_path: str | None = None
    if settings.storage_enabled:
        storage_path = await _upload_to_supabase(data, user_id, file.filename or "resume.pdf")

    try:
        resume_text = extract_resume_text(data)
        store = get_store()
        result = _process_resume_text(store, user_id, resume_text, storage_path=storage_path)
        result["storage_path"] = storage_path
        return result
    except Exception as e:
        logging.exception("upload_resume failed")
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {e}")


def _process_resume_text(
    store: Storage, user_id: str, resume_text: str, storage_path: str | None = None
) -> dict:
    """Create/update profile + embedding from resume text. Returns response dict."""
    profile = store.get_profile_by_user_id(user_id)
    if profile:
        profile_id = profile["profile_id"]
        store.update_profile(
            profile_id=profile_id,
            raw_resume_text=resume_text,
            resume_storage_path=storage_path,
        )
    else:
        profile_id = secrets.token_urlsafe(16)
        store.create_profile(
            profile_id=profile_id,
            user_id=user_id,
            raw_resume_text=resume_text,
        )
        if storage_path:
            store.update_profile(profile_id=profile_id, resume_storage_path=storage_path)

    embedder: EmbedderProtocol = Embedder(EmbedderConfig())
    preprocessed = preprocess_resume_text(resume_text)
    embedding = embedder.embed_resume(preprocessed)
    store.upsert_candidate_embedding(
        profile_id=profile_id,
        model_name=embedder.model_name,
        embedding=embedding,
    )
    return {"status": "ok", "profile_id": profile_id, "message": "Resume processed successfully"}


async def _download_from_supabase(storage_path: str) -> bytes:
    """Download file bytes from Supabase Storage. storage_path is e.g. resumes/{user_id}/resume.pdf."""
    url = f"{settings.supabase_url}/storage/v1/object/{storage_path}"
    headers = {"Authorization": f"Bearer {settings.supabase_service_key}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=30.0)
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to fetch resume from storage: {resp.status_code} {resp.text[:200]}",
            )
    return resp.content


async def _upload_to_supabase(data: bytes, user_id: str, filename: str) -> str:
    """Upload file bytes to Supabase Storage and return the storage path."""
    ext = Path(filename).suffix or ".pdf"
    path = f"resumes/{user_id}/resume{ext}"
    url = f"{settings.supabase_url}/storage/v1/object/resumes/{user_id}/resume{ext}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.put(url, content=data, headers=headers, timeout=30.0)
        if resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=502,
                detail=f"Supabase Storage upload failed: {resp.status_code} {resp.text}",
            )
    return path


# ---------------------------------------------------------------------------
# Matching endpoints
# ---------------------------------------------------------------------------


@app.post("/api/profile/reset-ratings")
def reset_ratings(user_id: str = Depends(get_current_user)):
    """Reset job interactions and taste profile for the current user (for testing)."""
    store = get_store()
    result = store.reset_profile_ratings(user_id)
    return result


@app.post("/api/profile/compute-taste")
def compute_taste(user_id: str = Depends(get_current_user)):
    """Build / refresh the taste-profile embedding from Interested/Not Interested ratings."""
    store = get_store()
    profile = store.get_profile_by_user_id(user_id)
    if not profile:
        raise HTTPException(
            status_code=404, detail="No profile found. Please process your resume first."
        )
    result = MatchingService(store).compute_and_store_taste(
        profile_id=profile["profile_id"], user_id=user_id
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=400, detail=result.get("reason", "Failed to compute taste profile")
        )
    return result


@app.get("/api/matches")
def get_matches(
    exclude_interacted: bool = True,
    exclude_rated_only: bool = False,
    top_k: int = 25,
    offset: int = 0,
    min_similarity: float = 0.0,
    max_days_old: int | None = None,
    mode: str = "resume",
    session_id: str | None = None,
    user_id: str = Depends(get_current_user),
):
    """Get job matches for the current user.

    *mode* is ``resume`` (default) or ``taste``.
    *exclude_rated_only*: when True, only exclude interested/not_interested (for Discover).
    When False, exclude all interactions (viewed, dismissed, etc.).
    """
    store = get_store()
    if mode not in ("resume", "taste"):
        raise HTTPException(status_code=400, detail="mode must be 'resume' or 'taste'")
    if not 0.0 <= min_similarity <= 1.0:
        raise HTTPException(status_code=400, detail="min_similarity must be between 0.0 and 1.0")
    if max_days_old is not None and max_days_old <= 0:
        max_days_old = None  # Treat invalid/zero as no filter
    if offset < 0:
        offset = 0

    profile = store.get_profile_by_user_id(user_id)
    if not profile:
        raise HTTPException(
            status_code=404, detail="No profile found. Please process your resume first."
        )

    profile_id = profile["profile_id"]
    svc = MatchingService(store)

    if mode == "taste":
        taste_emb = store.get_taste_embedding(profile_id)
        if not taste_emb:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No taste profile found. Go to Resume, rate some jobs, "
                    "then click Update Taste Profile."
                ),
            )
        matches, total, new_session_id = svc.match_taste_to_jobs(
            profile_id=profile_id,
            top_k=top_k,
            offset=offset,
            exclude_rated=exclude_interacted,
            user_id=user_id,
            min_similarity=min_similarity,
            max_days_old=max_days_old,
            session_id=session_id,
        )
    else:
        # exclude_rated_only: only interested/not_interested (Discover). Else all interactions.
        matches, total, new_session_id = svc.match_candidate_to_jobs(
            profile_id=profile_id,
            top_k=top_k,
            offset=offset,
            exclude_interacted=exclude_interacted,
            exclude_rated_only=exclude_rated_only,
            user_id=user_id,
            min_similarity=min_similarity,
            max_days_old=max_days_old,
            session_id=session_id,
        )

    has_more = offset + len(matches) < total
    return {
        "matches": matches,
        "total": total,
        "has_more": has_more,
        "mode": mode,
        "session_id": new_session_id,
    }


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/cors-check")
def cors_check(request: Request):
    """Debug: returns request origin and whether it's in ALLOWED_ORIGINS.

    Use this to verify CORS is configured correctly when upload fails with
    'CORS missing Allow Origin'. Call from the browser console:
    fetch('https://your-api.railway.app/api/cors-check').then(r=>r.json()).then(console.log)
    """
    origin = request.headers.get("origin", "(none)")
    allowed = settings.cors_origins
    return {
        "request_origin": origin,
        "allowed_origins": allowed,
        "origin_allowed": origin in allowed,
    }
