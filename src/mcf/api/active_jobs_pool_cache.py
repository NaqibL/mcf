"""Active jobs pool cache — caches (job_uuid, embedding, last_seen_at) for matching.

Similar to matches_cache: in-memory, TTL 15 min. Reduces DB round-trips when
get_active_job_ids_ranked is called frequently (e.g. many match requests).

Invalidate when: crawl completes, jobs deactivated, embeddings updated.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from mcf.lib.storage.base import Storage

logger = logging.getLogger(__name__)

ACTIVE_JOBS_POOL_TTL_SECONDS = 900  # 15 minutes

# (pool_data, expires_at)
# pool_data: list of (job_uuid, embedding, last_seen_at)
_cache: tuple[list[tuple[str, list[float], datetime | None]], float] | None = None


def get_cached() -> list[tuple[str, list[float], datetime | None]] | None:
    """Return cached pool if valid, else None."""
    global _cache
    if _cache is None:
        return None
    pool, expires_at = _cache
    if time.monotonic() > expires_at:
        _cache = None
        return None
    return pool


def set_cached(pool: list[tuple[str, list[float], datetime | None]]) -> None:
    """Store pool in cache."""
    global _cache
    expires_at = time.monotonic() + ACTIVE_JOBS_POOL_TTL_SECONDS
    _cache = (pool, expires_at)
    logger.debug("active jobs pool cache set: %d jobs", len(pool))


def invalidate() -> None:
    """Clear the cache. Call when crawl completes or embeddings change."""
    global _cache
    if _cache is not None:
        _cache = None
        logger.debug("active jobs pool cache invalidated")


def compute_ranked_from_pool(
    pool: list[tuple[str, list[float], datetime | None]],
    query_embedding: list[float],
    limit: int | None = None,
) -> list[tuple[str, float, datetime | None]]:
    """Compute (job_uuid, cosine_distance, last_seen_at) sorted by distance ASC.

    Returns all jobs when limit is None (default), so the session covers the full
    active-jobs pool rather than an arbitrary cap.
    """
    if not pool:
        return []
    query_vec = np.array(query_embedding, dtype=np.float32)
    scored = []
    for uuid, emb, last_seen_at in pool:
        emb_arr = np.array(emb, dtype=np.float32)
        cosine_sim = float(np.dot(query_vec, emb_arr))
        distance = 1.0 - cosine_sim
        scored.append((uuid, distance, last_seen_at))
    scored.sort(key=lambda x: x[1])
    return scored[:limit] if limit is not None else scored


def get_pool_or_fetch(store: Storage) -> list[tuple[str, list[float], datetime | None]]:
    """Return cached pool or fetch from store and cache. Uses store.get_active_jobs_pool()."""
    cached = get_cached()
    if cached is not None:
        return cached
    pool = store.get_active_jobs_pool()
    set_cached(pool)
    return pool
