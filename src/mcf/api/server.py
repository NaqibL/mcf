"""FastAPI server."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from mcf.api.config import settings
from mcf.api.services.matching_service import MatchingService
from mcf.lib.embeddings.base import EmbedderProtocol
from mcf.lib.embeddings.embedder import Embedder, EmbedderConfig
from mcf.lib.embeddings.resume import extract_resume_text
from mcf.lib.storage.base import Storage
from mcf.lib.storage.duckdb_store import DuckDBStore

# Global store instance
_store: Storage | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI."""
    global _store
    # Ensure data directory exists
    db_path = Path(settings.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _store = DuckDBStore(settings.db_path)
    yield
    if _store:
        _store.close()


app = FastAPI(title="Job Matcher API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_store() -> Storage:
    """Get storage instance."""
    if _store is None:
        raise RuntimeError("Store not initialized")
    return _store


# Job endpoints
@app.post("/api/jobs/{job_uuid}/interact")
def mark_interaction(
    job_uuid: str,
    interaction_type: str = Query(..., description="Interaction type: viewed, dismissed, applied, saved, interested, not_interested"),
):
    """Mark a job as interacted with."""
    store = get_store()
    user_id = settings.default_user_id

    valid_types = {"viewed", "dismissed", "applied", "saved", "interested", "not_interested"}
    if interaction_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid interaction type. Must be one of: {', '.join(sorted(valid_types))}")

    # Verify job exists
    job = store.get_job(job_uuid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    store.record_interaction(user_id=user_id, job_uuid=job_uuid, interaction_type=interaction_type)
    return {"status": "ok", "job_uuid": job_uuid, "interaction_type": interaction_type}


# Discover endpoints
@app.get("/api/discover/stats")
def get_discover_stats():
    """Return counts of interested, not_interested, and unrated jobs."""
    store = get_store()
    if not isinstance(store, DuckDBStore):
        raise HTTPException(status_code=500, detail="DuckDB store required")
    user_id = settings.default_user_id
    return store.get_discover_stats(user_id=user_id)


# Profile endpoints
@app.get("/api/profile")
def get_profile():
    """Get current user profile and resume status."""
    store = get_store()
    user_id = settings.default_user_id
    
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
def process_resume():
    """Process resume from file path and create/update profile."""
    store = get_store()
    user_id = settings.default_user_id
    resume_path = Path(settings.resume_path)

    if not resume_path.exists():
        raise HTTPException(status_code=404, detail=f"Resume file not found at {resume_path}")

    try:
        import secrets as _secrets

        resume_text = extract_resume_text(resume_path)

        profile = store.get_profile_by_user_id(user_id)
        if profile:
            profile_id = profile["profile_id"]
            store.update_profile(profile_id=profile_id, raw_resume_text=resume_text)
        else:
            profile_id = _secrets.token_urlsafe(16)
            store.create_profile(
                profile_id=profile_id,
                user_id=user_id,
                raw_resume_text=resume_text,
            )

        # Use embed_query (BGE query-side prefix) for the resume
        embedder: EmbedderProtocol = Embedder(EmbedderConfig())
        embedding = embedder.embed_query(resume_text)
        store.upsert_candidate_embedding(
            profile_id=profile_id,
            model_name=embedder.model_name,
            embedding=embedding,
        )

        return {
            "status": "ok",
            "profile_id": profile_id,
            "message": "Resume processed successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")


@app.post("/api/profile/compute-taste")
def compute_taste():
    """Compute and store a taste-profile embedding from the user's Interested/Not Interested ratings."""
    store = get_store()
    if not isinstance(store, DuckDBStore):
        raise HTTPException(status_code=500, detail="DuckDB store required")
    user_id = settings.default_user_id

    profile = store.get_profile_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found. Please process your resume first.")

    profile_id = profile["profile_id"]
    matching_service = MatchingService(store)
    result = matching_service.compute_and_store_taste(profile_id=profile_id, user_id=user_id)

    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("reason", "Failed to compute taste profile"))

    return result


# Matching endpoints
@app.get("/api/matches")
def get_matches(
    exclude_interacted: bool = True,
    top_k: int = 25,
    min_similarity: float = 0.0,
    max_days_old: int | None = None,
    mode: str = "resume",
):
    """Get job matches for the current user.

    Args:
        mode: ``resume`` uses the resume embedding (default);
              ``taste`` uses the taste-profile embedding built from ratings.
        exclude_interacted: Filter out jobs the user has already interacted with.
        top_k: Number of top matches to return.
        min_similarity: Minimum similarity threshold (0.0 to 1.0).
        max_days_old: Maximum age of job posting in days (None = no limit).
    """
    store = get_store()
    user_id = settings.default_user_id

    if mode not in ("resume", "taste"):
        raise HTTPException(status_code=400, detail="mode must be 'resume' or 'taste'")
    if not 0.0 <= min_similarity <= 1.0:
        raise HTTPException(status_code=400, detail="min_similarity must be between 0.0 and 1.0")
    if max_days_old is not None and max_days_old < 0:
        raise HTTPException(status_code=400, detail="max_days_old must be a positive integer")

    profile = store.get_profile_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found. Please process your resume first.")

    profile_id = profile["profile_id"]
    matching_service = MatchingService(store)

    if mode == "taste":
        if not isinstance(store, DuckDBStore):
            raise HTTPException(status_code=500, detail="DuckDB store required for taste mode")
        taste_emb = store.get_taste_embedding(profile_id)
        if not taste_emb:
            raise HTTPException(
                status_code=400,
                detail="No taste profile found. Go to Discover, rate some jobs, then click 'Update Taste Profile'.",
            )
        matches = matching_service.match_taste_to_jobs(
            profile_id=profile_id,
            top_k=top_k,
            exclude_rated=exclude_interacted,
            user_id=user_id,
            min_similarity=min_similarity,
            max_days_old=max_days_old,
        )
    else:
        matches = matching_service.match_candidate_to_jobs(
            profile_id=profile_id,
            top_k=top_k,
            exclude_interacted=exclude_interacted,
            user_id=user_id,
            min_similarity=min_similarity,
            max_days_old=max_days_old,
        )

    return {"matches": matches, "total": len(matches), "mode": mode}


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}
