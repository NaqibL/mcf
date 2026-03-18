# AI Agent Quick Reference — MCF Job Matcher

For AI agents working on this codebase. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for feature status, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flow.

---

## Quick Reference: Key Files by Domain

| Domain | Key Files |
|--------|-----------|
| **API** | `src/mcf/api/server.py` — FastAPI app, routes, lifespan |
| **Auth** | `src/mcf/api/auth.py`, `frontend/app/components/AuthGate.tsx` |
| **Matching** | `src/mcf/api/services/matching_service.py` — hybrid semantic + skills |
| **Storage** | `src/mcf/lib/storage/base.py` (interface), `postgres_store.py`, `duckdb_store.py` |
| **Crawl** | `src/mcf/lib/pipeline/incremental_crawl.py`, `lib/sources/mcf_source.py`, `cag_source.py` |
| **Embeddings** | `src/mcf/lib/embeddings/embedder.py`, `resume.py`, `job_text.py` |
| **CLI** | `src/mcf/cli/cli.py` |
| **Frontend** | `frontend/app/page.tsx`, `frontend/app/dashboard/page.tsx`, `frontend/lib/api.ts` |
| **Schema** | `scripts/schema.sql`, `scripts/migrations/` |

---

## Common Tasks

### Add a dashboard metric
1. Add method to `Storage` in `base.py` (abstract)
2. Implement in `postgres_store.py` and `duckdb_store.py`
3. Add route in `server.py` (dashboard section ~line 150+)
4. Add API call in `frontend/lib/api.ts` (dashboardApi)
5. Use in `frontend/app/dashboard/page.tsx`

### Add a new API endpoint
1. Add route in `src/mcf/api/server.py`
2. Add corresponding function in `frontend/lib/api.ts` if frontend needs it

### Modify matching logic
1. `matching_service.py` — scoring, filters, session creation
2. `store.get_active_job_ids_ranked()` — vector pool + ranking (Postgres uses pgvector when available; DuckDB does full scan)
3. **Skill**: `.cursor/skills/matching-algorithm/` — use when changing fit scores, recency, taste formula, or vector ranking

### Change crawl behavior
1. `incremental_crawl.py` — main pipeline
2. `mcf_source.py` / `cag_source.py` — job listing and detail fetch
3. `cli/cli.py` — CLI args for crawl commands

### Backfill or migrations
- See [scripts/BACKFILL_README.md](scripts/BACKFILL_README.md) for rich fields backfill
- Schema: `scripts/schema.sql`, migrations in `scripts/migrations/`

---

## Database Context (for agents)

When building features that touch the database, run `mcf db-context` first to get schema + sample data from Supabase:

```bash
uv run mcf db-context          # schema + 3 sample rows per table
uv run mcf db-context -s 5     # 5 sample rows
uv run mcf db-context -o docs/db_context.md  # write to file
```

Requires `DATABASE_URL` (Postgres). Output is markdown with tables, columns, types, row counts, and sample rows.

---

## Gotchas

| Issue | Details |
|-------|---------|
| **Matches cache** | Next.js uses `unstable_cache` (15 min TTL). Invalidate via `POST /api/revalidate-matches` after resume/rating. Alternative: `ENABLE_MATCHES_CACHE=1` on FastAPI when bypassing Next.js. See [docs/MATCHES_CACHE.md](docs/MATCHES_CACHE.md). |
| **Active jobs pool cache** | `ENABLE_ACTIVE_JOBS_POOL_CACHE=1` caches (job_uuid, embedding, last_seen_at) for 15 min. Invalidate via `POST /api/admin/invalidate-pool` after crawl. See [docs/ACTIVE_JOBS_POOL_CACHE.md](docs/ACTIVE_JOBS_POOL_CACHE.md). |
| **Vector pool size** | `get_active_job_ids_ranked(limit=20000)` — 20k pool balances load-more coverage vs query performance. Too large → timeout. |
| **DuckDB vs Postgres** | DuckDB has no vector search; does full scan. Postgres uses pgvector when `scripts/migrations/001_add_pgvector.sql` is applied. |
| **Storage selection** | `_make_store()` in server.py: `DATABASE_URL` → PostgresStore, else DuckDBStore. |
| **Dashboard source filter** | Dashboard shows MCF only (`by_source=mcf`); CAG hidden. Filter "Unknown" from category/employment/position charts. |
| **mark-interaction** | CLI `mark-interaction` is DuckDB only (no `--db-url`). Web app uses API which supports Postgres. |
| **Resume re-process** | When local file missing, fetches from Supabase Storage via `resume_storage_path`. |

---

## Related Docs

- [PROJECT_STATUS.md](PROJECT_STATUS.md) — implemented vs planned, known bugs
- [IMPROVEMENTS_SUMMARY.md](IMPROVEMENTS_SUMMARY.md) — historical changelog
- [scripts/BACKFILL_README.md](scripts/BACKFILL_README.md) — backfill rich job fields
- [scripts/LOCAL_CRAWL_WORKFLOW.md](scripts/LOCAL_CRAWL_WORKFLOW.md) — local crawl + export
- [docs/ACTIVE_JOBS_POOL_CACHE.md](docs/ACTIVE_JOBS_POOL_CACHE.md) — active jobs pool cache
- [DEPLOYMENT.md](DEPLOYMENT.md) — deploy checklist
