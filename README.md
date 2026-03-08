# mcf

MyCareersFuture job crawler and matcher for Singapore - local personal use.

**Deployed app?** See [USER_GUIDE.md](USER_GUIDE.md) for a simple checklist of what you need to do (Supabase, Railway, Vercel) — no coding required.

## Features

- **Job Scraping**: Incremental crawling of MyCareersFuture job listings
- **Resume Matching**: Match your resume against scraped jobs using semantic similarity
- **Interaction Tracking**: Track which jobs you've viewed, applied to, or dismissed
- **Local Database**: DuckDB for local storage (no cloud required)
- **Web Dashboard**: Simple localhost UI for viewing matches and managing interactions

## Quick Start

### 1. Install Dependencies

```bash
# Install Python dependencies
uv sync

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Place Your Resume

Create a `resume/` folder and place your resume file there:

```bash
mkdir resume
# Place your resume as: resume/resume.pdf (or .docx, .txt, .md)
```

Supported formats: `.pdf`, `.docx`, `.txt`, `.md`

### 3. Process Your Resume

```bash
# Process resume and create profile
uv run mcf process-resume
```

This will:
- Extract text from your resume
- Create a profile
- Generate an embedding for matching

### 4. Crawl Jobs

```bash
# Crawl new jobs (run this daily)
uv run mcf crawl-incremental
```

This will:
- Fetch new jobs from MyCareersFuture
- Generate embeddings for job descriptions
- Store basic info + URLs (descriptions not stored to save space)

### 5. Find Matches

**Via CLI:**
```bash
# Find matching jobs
uv run mcf match-jobs
```

**Via Web Dashboard:**
```bash
# Start API server (terminal 1)
uv run uvicorn mcf.api.server:app --reload --port 8000

# Start frontend (terminal 2)
cd frontend
npm run dev
```

Open http://localhost:3000 and click "Find Matches"

## Usage

### Commands Reference

**Crawling:**
```bash
# Careers@Gov only (~2000 jobs, keyword partitioning)
uv run mcf crawl-incremental --source cag

# MyCareersFuture only
uv run mcf crawl-incremental --source mcf

# Both sources
uv run mcf crawl-incremental --source all

# Test with limit
uv run mcf crawl-incremental --source cag --limit 50

# MCF with category filter
uv run mcf crawl-incremental --source mcf --categories "Information Technology"

# Custom database path
uv run mcf crawl-incremental --db path/to/custom.duckdb
```

**Web dashboard:**
```bash
# Terminal 1: API server
uv run uvicorn mcf.api.server:app --reload --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev

# Open http://localhost:3000
```

**Resume & matching:**
```bash
# Process resume
uv run mcf process-resume
uv run mcf process-resume --resume path/to/resume.pdf

# Find matches (CLI)
uv run mcf match-jobs
uv run mcf match-jobs --top-k 50 --include-interacted
```

**Interactions:**
```bash
uv run mcf mark-interaction <job-uuid> --type viewed
uv run mcf mark-interaction <job-uuid> --type applied
uv run mcf mark-interaction <job-uuid> --type dismissed
uv run mcf mark-interaction <job-uuid> --type saved
```

### CLI Commands (detailed)

**Process resume:**
```bash
mcf process-resume
# Or specify custom path:
mcf process-resume --resume path/to/resume.pdf
```

**Crawl jobs:**
```bash
# Default: uses data/mcf.duckdb
mcf crawl-incremental

# Custom database path:
mcf crawl-incremental --db path/to/database.duckdb

# Limit for testing:
mcf crawl-incremental --limit 100
```

**Find job matches:**
```bash
# Find top 25 matches (excludes interacted jobs)
mcf match-jobs

# Include interacted jobs:
mcf match-jobs --include-interacted

# Get more matches:
mcf match-jobs --top-k 50
```

**Mark job interaction:**
```bash
mcf mark-interaction <job-uuid> --type viewed
mcf mark-interaction <job-uuid> --type applied
mcf mark-interaction <job-uuid> --type dismissed
mcf mark-interaction <job-uuid> --type saved
```

**Local crawl then export to Supabase:**
```bash
uv run mcf crawl-incremental --db data/mcf.duckdb --source cag
uv run mcf export-to-postgres --db data/mcf.duckdb --db-url $DATABASE_URL
```
See [scripts/LOCAL_CRAWL_WORKFLOW.md](scripts/LOCAL_CRAWL_WORKFLOW.md) for the full workflow.

### API Endpoints

- `GET /api/profile` - Get profile and resume status
- `POST /api/profile/process-resume` - Process resume from file
- `GET /api/matches` - Get job matches for your resume
- `GET /api/jobs` - List jobs (excludes interacted by default)
- `GET /api/jobs/{job_uuid}` - Get job basic info
- `POST /api/jobs/{job_uuid}/interact` - Mark job as interacted
- `GET /api/health` - Health check

### Daily Workflow

1. **Morning**: Run `mcf crawl-incremental` to fetch new jobs
2. **Afternoon**: Open dashboard at http://localhost:3000
3. **Click "Find Matches"**: See new jobs matching your resume
4. **Interact with jobs**: Click "Viewed", "Applied", "Dismissed", or "Save"
5. **Next day**: Only new/unviewed jobs will appear (interacted jobs are filtered out)

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js 14 (React, TypeScript)
- **Database**: DuckDB (local) **or** PostgreSQL / Supabase (hosted)
- **Auth**: Supabase email+password (optional — local dev works without it)
- **Storage**: Only stores embeddings + basic info + URLs (no full descriptions)

## Configuration

Copy `.env.example` to `.env` and fill in the values.  For local dev the defaults work out of the box.

Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `DB_PATH` | `data/mcf.duckdb` | Local DuckDB path |
| `DATABASE_URL` | *(unset)* | Postgres URL — activates hosted mode |
| `RESUME_PATH` | `resume/resume.pdf` | Local resume path (dev fallback) |
| `SUPABASE_JWT_SECRET` | *(unset)* | Enables auth when set |
| `SUPABASE_URL` | *(unset)* | Enables file storage when set |
| `SUPABASE_SERVICE_KEY` | *(unset)* | Required with `SUPABASE_URL` |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |

## Deployment (~$5/month)

This stack runs for ~$5/month using free-tier services plus Railway Hobby.

| Service | Cost | Purpose |
|---|---|---|
| **Supabase** | Free | Postgres DB + Auth + File Storage |
| **Railway Hobby** | $5/mo | Python API (always-on, 8 GB RAM) |
| **Vercel** | Free | Next.js frontend |
| **GitHub Actions** | Free | Daily crawl cron |

### Steps

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
   - Run `scripts/schema.sql` in the SQL editor
   - Copy the Postgres connection string, URL, and service key (see USER_GUIDE for auth setup)

2. **Deploy the API to Railway**
   - Connect your GitHub repo, select `Dockerfile.api`
   - Set environment variables: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ALLOWED_ORIGINS`

3. **Deploy the frontend to Vercel**
   - Set `NEXT_PUBLIC_API_URL` to your Railway API URL
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. **Add GitHub Actions secret**
   - In your repo settings → Secrets, add `DATABASE_URL` (same Supabase Postgres URL)
   - The daily crawl will run at 02:00 UTC every day

5. **Add users**
   - Users can self-signup (email+password) or you create them in Supabase Dashboard. See [USER_GUIDE.md](USER_GUIDE.md) Part 5.

## Development Guide

### How to Add New Packages

To add a new production dependency:
```bash
uv add requests
```

To add a new development dependency:
```bash
uv add --dev ipdb
```

After adding dependencies, always re-generate requirements.txt:
```bash
uv pip compile pyproject.toml -o requirements.txt
```

## File Structure

```
mcf-main/
├── resume/              # Place your resume here (gitignored)
├── data/               # Database files (gitignored)
├── src/mcf/
│   ├── api/            # FastAPI server
│   ├── cli/            # CLI commands
│   ├── lib/
│   │   ├── crawler/    # Job crawler
│   │   ├── storage/    # DuckDB storage
│   │   ├── embeddings/ # Embedding generation
│   │   └── pipeline/   # Crawl pipeline
└── frontend/           # Next.js dashboard
```

## Notes

- Job descriptions are **not stored** in the database to save space
- Only embeddings, basic info (title, company, location), and URLs are stored
- Click job URLs to see full descriptions on MyCareersFuture
- Jobs you've interacted with won't appear in future matches (unless you include them)
- Matches are sorted by similarity score, then by recency (newest first)

## License

MIT
