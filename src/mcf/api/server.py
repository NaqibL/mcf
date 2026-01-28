"""FastAPI server."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from mcf.api.config import settings
from mcf.lib.storage.base import Storage
from mcf.lib.storage.postgres_store import PostgresStore

# Global store instance
_store: Storage | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI."""
    global _store
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    _store = PostgresStore(settings.database_url)
    yield
    if _store:
        _store.close()


app = FastAPI(title="MCF Job Crawler API", version="0.1.0", lifespan=lifespan)

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
@app.get("/api/jobs")
def list_jobs(limit: int = 100, offset: int = 0, category: str | None = None, keywords: str | None = None):
    """List jobs with optional filters."""
    store = get_store()
    jobs = store.search_jobs(limit=limit, offset=offset, category=category, keywords=keywords)
    return {"jobs": jobs, "total": len(jobs)}


@app.get("/api/jobs/{job_uuid}")
def get_job(job_uuid: str):
    """Get job details by UUID."""
    store = get_store()
    job = store.get_job(job_uuid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# Crawl stats endpoints
@app.get("/api/crawl/stats")
def get_crawl_stats(limit: int = 10):
    """Get recent crawl run statistics."""
    store = get_store()
    runs = store.get_recent_runs(limit=limit)
    active_count = store.get_active_job_count()
    return {
        "active_job_count": active_count,
        "recent_runs": runs,
    }


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}
