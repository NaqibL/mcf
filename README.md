# mcf

MyCareersFuture job crawler for Singapore.

## Features

- **Job Scraping**: Incremental crawling of MyCareersFuture job listings
- **Automatic Scheduling**: Daily crawls via GitHub Actions
- **Online Database**: PostgreSQL (Neon) for cloud storage
- **Web Dashboard**: Simple localhost UI for viewing crawl stats and jobs

## Quick Start

**📖 For detailed step-by-step setup instructions, see [SETUP.md](SETUP.md)**

### Quick Summary:

1. **Neon Database**: Create account → Create project → Copy connection string → Run `scripts/schema.sql`
2. **GitHub Actions**: Add `DATABASE_URL` secret → Test workflow manually → Verify it runs daily

### 3. Local Development

#### Backend API

```bash
# Install dependencies
uv sync

# Set environment variables
export DATABASE_URL=postgresql://user:password@host/database

# Run API server
uvicorn mcf.api.server:app --reload --port 8000
```

#### Frontend Dashboard

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Usage

### CLI Commands

**Incremental crawl with PostgreSQL:**
```bash
mcf crawl-incremental --db-url "postgresql://user:password@host/database"
```

**Incremental crawl with DuckDB (legacy):**
```bash
mcf crawl-incremental --db data/mcf.duckdb
```

**Full crawl to parquet (for one-time exports):**
```bash
mcf crawl --output data/jobs
```

### API Endpoints

- `GET /api/jobs` - List jobs with optional filters (`?limit=100&offset=0&keywords=...`)
- `GET /api/jobs/{job_uuid}` - Get job details by UUID
- `GET /api/crawl/stats` - Get crawl statistics and recent runs
- `GET /api/health` - Health check

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js 14 (React, TypeScript)
- **Database**: PostgreSQL (Neon) - free tier: 3GB
- **Scheduling**: GitHub Actions - free tier: 2000 minutes/month

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

## Cost

- **Neon**: Free tier (3GB database)
- **GitHub Actions**: Free tier (2000 minutes/month)
- **Total**: $0/month

## Future Enhancements

The codebase is designed to be modular. You can easily add:
- Embeddings and semantic search
- LLM-powered features
- Matching algorithms
- Authentication (if needed)

## License

MIT
