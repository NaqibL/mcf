"""Quick script to check active/inactive job counts in Supabase."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from mcf.api.config import settings

url = settings.database_url
if not url:
    print("DATABASE_URL not set in .env")
    sys.exit(1)

import psycopg2

conn = psycopg2.connect(url)
cur = conn.cursor()

mcf_filter = "WHERE (job_source = 'mcf' OR job_source IS NULL)"

# Active vs inactive
cur.execute(f"SELECT is_active, COUNT(*) FROM jobs {mcf_filter} GROUP BY is_active")
rows = cur.fetchall()
print("Jobs by is_active (MCF only):")
for r in rows:
    status = "active" if r[0] else "inactive"
    print(f"  {status}: {r[1]:,}")

# Total
cur.execute(f"SELECT COUNT(*) FROM jobs {mcf_filter}")
print(f"\nTotal MCF jobs: {cur.fetchone()[0]:,}")

# Sample inactive if any
cur.execute(f"SELECT job_uuid, title, last_seen_at FROM jobs {mcf_filter} AND is_active = FALSE LIMIT 5")
inactive = cur.fetchall()
print(f"\nSample inactive jobs (first 5): {len(inactive)}")
for r in inactive:
    title = (r[1] or "")[:40]
    print(f"  {r[0][:24]}... | {title}... | last_seen={r[2]}")

# Job run status (added/maintained/removed)
cur.execute("""
    SELECT jrs.status, COUNT(*)
    FROM job_run_status jrs
    JOIN jobs j ON j.job_uuid = jrs.job_uuid
    WHERE (j.job_source = 'mcf' OR j.job_source IS NULL)
    GROUP BY jrs.status
""")
rows = cur.fetchall()
print("\nJob run status counts (MCF jobs):")
for r in rows:
    print(f"  {r[0]}: {r[1]:,}")

# Cross-check: jobs marked 'removed' in job_run_status - are they is_active=FALSE in jobs?
cur.execute("""
    SELECT j.is_active, COUNT(*)
    FROM job_run_status jrs
    JOIN jobs j ON j.job_uuid = jrs.job_uuid
    WHERE jrs.status = 'removed'
      AND (j.job_source = 'mcf' OR j.job_source IS NULL)
    GROUP BY j.is_active
""")
rows = cur.fetchall()
print("\n(Removal events in job_run_status - same job can be removed in one run, re-added in another)")
print("Jobs with status='removed' in job_run_status, by current is_active in jobs table:")
for r in rows:
    status = "still active (re-added later?)" if r[0] else "correctly inactive"
    print(f"  is_active={r[0]} ({status}): {r[1]:,}")

conn.close()
print("\nDone")
