# Matches API Caching Strategy

The `/api/matches` endpoint performs expensive operations (vector similarity, hybrid scoring). Two caching approaches are available.

## Requirements

- **Cache key**: `user_id` + `mode` (resume/taste) + query params
- **TTL**: 15 minutes
- **Invalidation**: On resume update or job rating

---

## Approach 1: Next.js `unstable_cache` (Default)

**Use when**: Frontend is on Vercel, matches go through Next.js.

### Flow

1. Frontend calls `matchesApi.get()` → `fetch('/api/matches')` (Next.js route)
2. Next.js route verifies JWT, proxies to FastAPI, caches with `unstable_cache`
3. Cache tag: `matches-${user_id}` for on-demand invalidation
4. After `processResume`, `uploadResume`, `computeTaste`, `markInteraction` → `POST /api/revalidate-matches`

### Setup

- **Env**: `SUPABASE_JWT_SECRET` or `NEXT_PUBLIC_SUPABASE_URL` (for JWKS) in Next.js
- **Frontend**: Uses Next.js `/api/matches` and `/api/revalidate-matches` (already wired in `api.ts`)

### Vercel Limits

| Limit | Impact |
|-------|--------|
| Cache size | Per-deployment; evicted under memory pressure |
| Cold starts | Cache empty after new deployment |
| No Redis | Cache is process-local; not shared across serverless instances |

For high traffic, consider Vercel KV (Redis) or the FastAPI alternative below.

---

## Approach 2: FastAPI In-Memory Cache

**Use when**: Frontend calls FastAPI directly (bypass Next.js), or Vercel cache limits apply.

### Flow

1. Frontend calls FastAPI `/api/matches` directly (set `NEXT_PUBLIC_USE_DIRECT_API=1` or similar to switch)
2. FastAPI checks in-memory cache; on miss, computes and caches
3. Invalidation: `mark_interaction`, `compute_taste`, `_process_resume_text` call `invalidate_user(user_id)`

### Setup

```bash
# In FastAPI env (Railway, VPS, etc.)
ENABLE_MATCHES_CACHE=1
```

### Switching Frontend to Direct FastAPI

If you want to bypass Next.js matches route and use FastAPI cache:

1. In `frontend/lib/api.ts`, change `matchesApi.get()` to use `api.get(\`/api/matches?${params}\`)` (axios to FastAPI)
2. Remove `revalidateMatches()` calls (FastAPI invalidates internally)
3. Set `ENABLE_MATCHES_CACHE=1` on the FastAPI server

### Limitations

- **In-memory**: Lost on process restart; not shared across workers
- **Single instance**: Works well on Railway/VPS with one process
- **Redis extension**: Replace `_cache` dict with Redis client for multi-instance deployments

---

## Redis Alternative (Future)

For production at scale:

```python
# matches_cache.py — Redis backend
import redis
from mcf.api.config import settings

_redis = redis.from_url(settings.redis_url) if settings.redis_url else None

def _key(user_id, mode, params_hash):
    return f"matches:{user_id}:{mode}:{params_hash}"

def get_cached(...):
    if not _redis: return None
    k = _key(user_id, mode, _params_hash(...))
    data = _redis.get(k)
    return json.loads(data) if data else None

def set_cached(..., result):
    if _redis:
        _redis.setex(_key(...), MATCHES_CACHE_TTL_SECONDS, json.dumps(result))

def invalidate_user(user_id):
    if _redis:
        for k in _redis.scan_iter(f"matches:{user_id}:*"):
            _redis.delete(k)
```

---

## Summary

| Scenario | Use |
|----------|-----|
| Vercel + Next.js frontend | Next.js `unstable_cache` (default) |
| FastAPI on Railway/VPS, single instance | FastAPI in-memory (`ENABLE_MATCHES_CACHE=1`) |
| Multi-instance FastAPI | Redis backend (extend `matches_cache.py`) |
