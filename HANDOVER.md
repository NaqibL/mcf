# MCF Job Matcher — Team handover

Welcome. This repo is a **Singapore job market crawler and matcher**: it pulls listings from **MyCareersFuture (MCF)** and optionally **Careers@Gov (CAG)**, stores them in **DuckDB** (local) or **Postgres/Supabase** (hosted), embeds job text and resumes with **BGE**, and serves a **Next.js** UI for resume/taste matching and a **dashboard** of market stats.

It is **not** a job board — it aggregates public listings and helps a signed-in user find fits.

---

## Who should read what

| Stakeholder | Start here | Then |
|-------------|------------|------|
| **New developer** | This file → [docs/TECH_STACK.md](docs/TECH_STACK.md) → [docs/REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md) | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [PROJECT_STATUS.md](PROJECT_STATUS.md) |
| **DevOps / deploy** | [DEPLOYMENT.md](DEPLOYMENT.md), [USER_GUIDE.md](USER_GUIDE.md) | GitHub Actions secrets (see below), [docs/RUNTIME_FLOWS.md](docs/RUNTIME_FLOWS.md) |
| **AI coding agent** | [AGENTS.md](AGENTS.md), [docs/INDEX.md](docs/INDEX.md) | [.cursor/rules/](.cursor/rules/), `mcf db-context` when touching the DB |

---

## Local development (minimal path)

1. Copy [`.env.example`](.env.example) to `.env` and adjust if needed (leave `DATABASE_URL` unset for local DuckDB).
2. **Backend:** `uv sync` then `uv run uvicorn mcf.api.server:app --reload --port 8000`
3. **Frontend:** `cd frontend && npm install && npm run dev`
4. Open `http://localhost:3000`

Without Supabase env vars, the API can run in anonymous local mode (`ALLOW_ANONYMOUS_LOCAL=true` in `.env` if needed).

---

## Production shape (typical)

- **Vercel**: Next.js frontend (`frontend/`).
- **Railway** (or similar): FastAPI API ([`Dockerfile.api`](Dockerfile.api)).
- **Supabase**: Postgres, Auth, Storage for resumes.

Details: [DEPLOYMENT.md](DEPLOYMENT.md). Non-developer checklist: [USER_GUIDE.md](USER_GUIDE.md).

---

## Core data flow (one paragraph)

External job APIs → **incremental crawl** (`src/mcf/lib/pipeline/incremental_crawl.py`) → **Storage** (`PostgresStore` / `DuckDBStore`) → **embeddings** (BGE) → **matching** (`MatchingService`) → **FastAPI** → browser. Some dashboard and match traffic goes through **Next.js Route Handlers** that cache responses — see [docs/RUNTIME_FLOWS.md](docs/RUNTIME_FLOWS.md).

---

## Design facts new owners must know

1. **Matching is pure semantic** (cosine similarity + recency decay). Skills overlap exists in code but **weight is 0** — not hybrid scoring.
2. **Caching stacks**: embeddings LRU/DB, optional active-jobs pool cache, optional FastAPI matches/response caches, Next.js `unstable_cache` on some routes. See [docs/RUNTIME_FLOWS.md](docs/RUNTIME_FLOWS.md).
3. **Careers@Gov** uses a **hardcoded Algolia search key** in `src/mcf/lib/sources/cag_source.py`. If CAG crawl breaks with HTTP errors, that key may have rotated — update in code.
4. **Taste embeddings** use a naming convention: `candidate_embeddings.profile_id` can be `<uuid>:taste` alongside the resume row for the same user.
5. **Job UUIDs**: MCF uses the raw API id; other sources prefix (e.g. `cag:...`). Dashboard queries often filter `job_source = 'mcf'`.

---

## Operational gaps (honest)

- **No automated tests** in-repo (pytest is a dev dependency but unused). Smoke tests are a good first addition.
- **GitHub Actions daily crawl** only injects `DATABASE_URL` by default. **Post-crawl webhook** to Vercel (cache invalidation) needs `CRON_SECRET` + `CRAWL_WEBHOOK_URL` as secrets and workflow changes — see [DEPLOYMENT.md](DEPLOYMENT.md) §4.1b.
- **First API request after deploy** may take **30–60s**: the BGE model downloads at runtime ([`Dockerfile.api`](Dockerfile.api)).
- **CLI `mark-interaction`** is **DuckDB-only**; hosted DB uses the HTTP API.

---

## Reading order

1. [HANDOVER.md](HANDOVER.md) (this file)  
2. [docs/TECH_STACK.md](docs/TECH_STACK.md)  
3. [docs/REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md)  
4. [docs/RUNTIME_FLOWS.md](docs/RUNTIME_FLOWS.md)  
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
6. [PROJECT_STATUS.md](PROJECT_STATUS.md)  
7. [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) — **pending work and to-do list**  

Full map: [docs/INDEX.md](docs/INDEX.md).
