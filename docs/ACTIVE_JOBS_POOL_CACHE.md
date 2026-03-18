# Active Jobs Pool Cache

The matching service uses an **active jobs pool** — `(job_uuid, embedding, last_seen_at)` for all active jobs with embeddings — to compute vector similarity. Without caching, each match request triggers a DB round-trip to fetch this pool.

## Overview

- **What**: In-memory cache of the full active jobs pool
- **TTL**: 15 minutes (same as matches cache)
- **When used**: When `ENABLE_ACTIVE_JOBS_POOL_CACHE=1` and matching service builds a session

## Setup

```bash
ENABLE_ACTIVE_JOBS_POOL_CACHE=1
```

## Invalidation

1. **Automatic**: TTL expires after 15 minutes
2. **Crawl completion (same process)**: `run_incremental_crawl` calls `invalidate()` when it finishes
3. **Crawl completion (separate process)**: Call `POST /api/admin/invalidate-pool` after a CLI crawl

When crawl runs via `mcf crawl-incremental` (separate process from API), add a post-crawl step:

```bash
# After crawl
curl -X POST https://your-api.railway.app/api/admin/invalidate-pool
```

## Flow

1. Match request → `get_pool_or_fetch(store)`
2. If cache hit → use cached pool
3. If cache miss → `store.get_active_jobs_pool()` → cache → return
4. `compute_ranked_from_pool(pool, query_embedding, limit)` computes cosine distances in memory

## Limitations

- **In-memory**: Lost on process restart; not shared across workers
- **Single instance**: Best for one FastAPI process (Railway, VPS)
