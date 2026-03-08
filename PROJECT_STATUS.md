# MCF Job Matcher — Project Status

A detailed rundown of what is implemented vs. what was discussed but not yet done. Use this to scope and prioritize next work.

---

## 1. Currently Implemented

### Auth & Users
| Feature | Status | Notes |
|---------|--------|------|
| Email + password sign-in/sign-up | Done | `AuthGate.tsx` — no magic links, no Resend |
| Supabase JWT verification | Done | API uses JWKS from Supabase URL |
| Session persistence | Done | Supabase client handles it |
| Local dev without auth | Done | `allow_anonymous_local` or no Supabase config |

### Job Data & Crawling
| Feature | Status | Notes |
|---------|--------|------|
| Incremental crawl (MCF + Careers@Gov) | Done | `mcf crawl-incremental` — list IDs, diff, fetch detail, embed |
| DuckDB storage | Done | Default `data/mcf.duckdb` |
| Postgres/Supabase storage | Done | Via `DATABASE_URL` or `--db-url` |
| Category segmentation (5 runs) | Done | See `CRAWL_RUNS.md` |
| GitHub Actions daily crawl | Done | `.github/workflows/daily-crawl.yml` — 6h timeout |
| Job embeddings (BGE) | Done | One-by-one in crawl loop; batched in `re-embed` |

### Resume & Profile
| Feature | Status | Notes |
|---------|--------|------|
| Resume upload (PDF/DOCX) | Done | Via API; stored in Supabase Storage when configured |
| Resume text extraction | Done | `extract_resume_text` |
| Profile creation/update | Done | `candidate_profiles` + `candidate_embeddings` |
| Resume embedding | Done | BGE query-side with task prefix |
| Taste profile | Done | Discover ratings → `computeTaste` → `profile_id:taste` embedding |

### Matching & API
| Feature | Status | Notes |
|---------|--------|------|
| Hybrid matching (semantic + skills) | Done | `MatchingService` |
| Resume mode / Taste mode | Done | Filter by profile embedding type |
| Filters (similarity, recency, top_k) | Done | `min_similarity`, `max_days_old`, `top_k` |
| Interaction tracking | Done | `interested`, `not_interested` etc. |
| Optimized N+1 fix | Done | Single query for job embeddings (IMPROVEMENTS_SUMMARY) |

### Frontend
| Feature | Status | Notes |
|---------|--------|------|
| Discover tab | Done | Rate jobs, build taste profile |
| Matches tab | Done | Filter by mode, similarity, recency |
| Job cards (color-coded scores, days ago) | Done | IMPROVEMENTS_SUMMARY |
| Toast notifications | Done | `react-hot-toast` |
| Optimistic updates (dismiss) | Done | IMPROVEMENTS_SUMMARY |
| Replace resume | Done | Upload new file |
| Re-process button | Done | Fetches from Supabase Storage when local file missing |

### CLI
| Command | Status | Notes |
|---------|--------|------|
| `mcf crawl-incremental` | Done | MCF, CAG, or both |
| `mcf process-resume` | Done | Local file only |
| `mcf match-jobs` | Done | CLI matching |
| `mcf mark-interaction` | Done | DuckDB only (no `--db-url`) |
| `mcf re-embed` | Done | Batch re-embed all jobs |
| `mcf export-to-postgres` | Done | Export DuckDB crawl data to Supabase |

### Infrastructure
| Component | Status | Notes |
|-----------|--------|------|
| Supabase (DB, Auth, Storage) | Done | |
| Railway API | Done | `Dockerfile.api` |
| Vercel frontend | Done | Root: `frontend` |
| Schema | Done | `scripts/schema.sql` — JSON embeddings; pgvector optional via `scripts/migrations/001_add_pgvector.sql` |
| DuckDB → Postgres export | Done | `mcf export-to-postgres` — bulk upload crawl data to Supabase |

---

## 2. Discussed but Not Implemented

### High Impact

| Item | Status | Notes |
|------|--------|------|
| **Re-process from Supabase Storage** | Done | When local file missing, fetches from profile's `resume_storage_path` via Supabase Storage. |
| **pgvector migration** | Done | `scripts/migrations/001_add_pgvector.sql` created. PostgresStore uses vector column for fast similarity search when available. |
| **Batch embeddings in incremental crawl** | Done | Crawl now batches embeddings (like `re-embed`); ~10–30x faster with GPU. |

### Medium Impact

| Item | Source | Description |
|------|--------|-------------|
| **`--skip-embeddings` for crawl** | Local crawl plan | Crawl job details only; run `mcf re-embed` separately. Useful for crawl without GPU, embed later. |
| **`mark-interaction` with Postgres** | CLI | `mark-interaction` uses DuckDB only; no `--db-url` support. |

### Lower Priority / Docs

| Item | Source | Description |
|------|--------|-------------|
| **USER_GUIDE language** | USER_GUIDE | Refers to "the developer" as separate from reader; you are both. Could be rewritten in first person. |

---

## 3. Known Bugs / Limitations

| Issue | Severity | Notes |
|-------|----------|-------|
| Jobs load slowly (without pgvector) | Medium | Run `scripts/migrations/001_add_pgvector.sql` for fast vector search. First request after deploy slow (model load). |
| GitHub Action 6h timeout | Medium | Full MCF dataset may exceed this; CPU-only, no GPU. |
| `mark-interaction` no Postgres | Low | CLI only; web app uses API which supports Postgres. |

---

## 4. Suggested Prioritization

### Phase 1 — Fix Production Issues (Done)
1. ~~**Re-process from Supabase Storage**~~ — Done. Fetches from Storage when local file missing.
2. ~~**Batch embeddings in crawl**~~ — Done. Crawl now batches; ~10–30x faster with GPU.

### Phase 2 — Performance (Done)
3. ~~**pgvector migration**~~ — Done. Run `scripts/migrations/001_add_pgvector.sql` in Supabase. PostgresStore uses vector search when available.
4. **Local crawl workflow** — Done. See `scripts/LOCAL_CRAWL_WORKFLOW.md`. Use `mcf export-to-postgres` to bulk upload DuckDB → Supabase.

### Phase 3 — Polish
5. **USER_GUIDE cleanup** — Remove "developer will" language; make Part 4 conditional on pgvector existing.
6. **`mark-interaction` --db-url** — Add Postgres support for CLI parity.
7. **`scripts/query_db.py`** — Optional query helper; not present. Use Supabase SQL Editor or psql instead.

---

## 5. Quick Reference: Key Files

| Purpose | File |
|---------|------|
| Crawl pipeline | `src/mcf/lib/pipeline/incremental_crawl.py` |
| Embedding (1-by-1 in crawl) | `incremental_crawl.py:76-106` |
| Re-process endpoint | `src/mcf/api/server.py:128-140` |
| Auth gate | `frontend/app/components/AuthGate.tsx` |
| Schema | `scripts/schema.sql` |
| Daily crawl workflow | `.github/workflows/daily-crawl.yml` |
