# Caching Architecture Limits

## Vercel (Next.js) Serverless

| Limit | Impact |
|-------|--------|
| **Process-local cache** | `unstable_cache` is per-instance; not shared across serverless functions |
| **Cold starts** | Cache is empty after new deployment or idle timeout |
| **Cache eviction** | Under memory pressure, Vercel may evict cache entries |
| **No Redis** | No built-in shared cache; consider Vercel KV for high traffic |

**Mitigation**: Crawl webhook invalidates via `revalidateTag`; cache repopulates on next request. For consistent cache across instances, use Vercel KV or external Redis.

---

## FastAPI Multi-Instance

| Limit | Impact |
|-------|--------|
| **In-memory only** | `response_cache`, `matches_cache`, `active_jobs_pool_cache` are process-local |
| **No shared state** | Each worker/instance has its own cache; invalidation only affects the instance that receives the webhook |
| **Webhook target** | Crawl webhook calls one FastAPI URL; only that instance's caches are invalidated |

**Mitigation**: Run single FastAPI instance, or extend caches with Redis backend. See `docs/MATCHES_CACHE.md` for Redis example.

---

## Cache Invalidation on Crawl

When crawl completes, the webhook invalidates:

- **Next.js**: `revalidateTag('dashboard-stats')` — affects all instances via tag
- **FastAPI**: Pool, matches, dashboard, job caches — only the instance that receives the HTTP request

If FastAPI runs behind a load balancer, ensure the webhook URL reaches a consistent instance, or use a broadcast mechanism (e.g. Redis pub/sub) to invalidate all instances.
