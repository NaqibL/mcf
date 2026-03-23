# Documentation index

Single map of markdown, SQL, and ops assets. **Audience:** `H` = human developer, `A` = AI agent, `O` = operations/deploy.

---

## Start here

| Doc | Audience | Purpose |
|-----|----------|---------|
| [HANDOVER.md](../HANDOVER.md) | H, O, A | Onboarding, reading order, operational gaps |
| [docs/NEXT_STEPS.md](NEXT_STEPS.md) | H, A | **Living to-do list** — all pending plans with exact steps |
| [AGENTS.md](../AGENTS.md) | A | Shortcuts, gotchas, `mcf db-context` |
| [docs/TECH_STACK.md](TECH_STACK.md) | H, A | Versions, env vars, Docker vs `uv` |
| [docs/REPOSITORY_MAP.md](REPOSITORY_MAP.md) | H, A | Modules, routes, CLI, migrations |
| [docs/RUNTIME_FLOWS.md](RUNTIME_FLOWS.md) | H, A | Auth layers, matches path, webhooks, caches |

---

## Root (`/`)

| File | Audience | Notes |
|------|----------|-------|
| [README.md](../README.md) | H, A | Quick start, CLI; links to handover |
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | H, A | Feature matrix, bugs, backlog |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | O | Supabase, Railway, Vercel, GitHub Actions |
| [USER_GUIDE.md](../USER_GUIDE.md) | O | Non-developer setup checklist |
| [IMPROVEMENTS_SUMMARY.md](../IMPROVEMENTS_SUMMARY.md) | H | Historical changelog (not live status) |
| [CRAWL_RUNS.md](../CRAWL_RUNS.md) | H, A | MCF category segments vs `daily-crawl.yml` |

---

## `docs/`

| File | Audience | Notes |
|------|----------|-------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | H, A | High-level flow + mermaid |
| [TECH_STACK.md](TECH_STACK.md) | H, A | **Canonical** stack + env table |
| [REPOSITORY_MAP.md](REPOSITORY_MAP.md) | H, A | File and route inventory |
| [RUNTIME_FLOWS.md](RUNTIME_FLOWS.md) | H, A | JWT layers, caching, taste profile |
| [MATCHES_CACHE.md](MATCHES_CACHE.md) | H, A | Next.js matches proxy cache |
| [ACTIVE_JOBS_POOL_CACHE.md](ACTIVE_JOBS_POOL_CACHE.md) | H, A | In-memory pool cache |
| [CACHING_LIMITS.md](CACHING_LIMITS.md) | H, A | TTLs and limits |
| [SUPABASE_RPC.md](SUPABASE_RPC.md) | H, A | Optional RPC + `rpc_result_cache` |
| [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) | H | **Snapshot** (dated); bundle sizes |

---

## `scripts/`

| File | Audience | Notes |
|------|----------|-------|
| [BACKFILL_README.md](../scripts/BACKFILL_README.md) | H, A | Rich fields backfill |
| [LOCAL_CRAWL_WORKFLOW.md](../scripts/LOCAL_CRAWL_WORKFLOW.md) | H | DuckDB crawl → export to Postgres |
| [schema.sql](../scripts/schema.sql) | H, A | Base schema |
| [migrations/*.sql](../scripts/migrations/) | H, A | Apply **in numeric order** `001`–`008` |
| [clear_database.sql](../scripts/clear_database.sql) | H | **Destructive** — wipes data |
| [clear_cag_data.sql](../scripts/clear_cag_data.sql) | H | **Destructive** — CAG-related rows |
| [check_inactive.py](../scripts/check_inactive.py) | H | One-off Postgres diagnostic; `sys.path` hack; not CLI |

---

## Ops

| File | Audience | Notes |
|------|----------|-------|
| [.github/workflows/daily-crawl.yml](../.github/workflows/daily-crawl.yml) | O | Scheduled crawl; see DEPLOYMENT §4.1b for webhook secrets |
| [.github/workflows/backfill-rich-fields.yml](../.github/workflows/backfill-rich-fields.yml) | O | Manual backfill |
| [Dockerfile.api](../Dockerfile.api) | O | API image; uses `requirements.txt` |
| [Dockerfile.frontend](../Dockerfile.frontend) | O | Frontend image |
| [docker-compose.yml](../docker-compose.yml) | H | Local API + frontend |

---

## Dependency files

| File | Notes |
|------|-------|
| [pyproject.toml](../pyproject.toml) | **Source of truth** for Python deps (`uv sync`) |
| [uv.lock](../uv.lock) | Locked versions for `uv` |
| [requirements.txt](../requirements.txt) | **Generated**: `uv pip compile pyproject.toml -o requirements.txt`. Used by `Dockerfile.api`; do not hand-edit. |
| [frontend/package.json](../frontend/package.json) | Node / Next.js dependencies |

---

## Optional backlog (not done)

- Split `server.py` into FastAPI `APIRouter` modules.
- Add pytest smoke tests (`/api/health`).
- Promote `scripts/check_inactive.py` to `mcf` CLI or remove.
