"""PostgreSQL-backed storage for incremental crawling and embeddings.

Uses psycopg2. All JSON fields are stored as TEXT for portability (matching
the DuckDB store), so no pgvector or JSONB extension is required.

The DATABASE_URL must be a libpq-style connection string, e.g.:
  postgresql://user:password@host:5432/dbname?sslmode=require
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Iterable, Sequence

import psycopg2
import psycopg2.extras
from psycopg2.extras import execute_values

from mcf.lib.storage.base import RunStats, Storage


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PostgresStore(Storage):
    """PostgreSQL-backed persistence layer — mirrors DuckDBStore API exactly."""

    def __init__(self, database_url: str) -> None:
        self._url = database_url
        self._con = psycopg2.connect(database_url)
        self._con.autocommit = True
        self._job_emb_select: str | None = None  # cached: "e.embedding_json" or "e.embedding::text"
        self._job_emb_has_vector: bool | None = None  # cached: True if embedding column exists

    def close(self) -> None:
        self._con.close()

    def _cur(self) -> psycopg2.extensions.cursor:
        return self._con.cursor()

    def _job_embedding_schema(self) -> tuple[str, bool]:
        """Return (select_expr, has_vector) for job_embeddings.
        select_expr: "e.embedding_json" or "e.embedding::text" for SELECT.
        has_vector: True if embedding column exists (for vector search).
        """
        if self._job_emb_select is not None and self._job_emb_has_vector is not None:
            return (self._job_emb_select, self._job_emb_has_vector)
        with self._cur() as cur:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'job_embeddings' AND column_name IN ('embedding_json', 'embedding')"
            )
            cols = {r[0] for r in cur.fetchall()}
        has_json = "embedding_json" in cols
        has_vec = "embedding" in cols
        if has_json:
            self._job_emb_select = "e.embedding_json"
        elif has_vec:
            self._job_emb_select = "e.embedding::text"
        else:
            raise RuntimeError("job_embeddings has neither embedding_json nor embedding column")
        self._job_emb_has_vector = has_vec
        return (self._job_emb_select, self._job_emb_has_vector)

    # === Crawl runs ===

    def begin_run(self, *, kind: str, categories: Sequence[str] | None) -> RunStats:
        started_at = _utcnow()
        run_id = started_at.strftime("%Y%m%dT%H%M%S.%fZ")
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO crawl_runs(run_id, started_at, finished_at, kind, categories_json,
                                      total_seen, added, maintained, removed)
                VALUES (%s, %s, NULL, %s, %s, 0, 0, 0, 0)
                """,
                [run_id, started_at, kind, json.dumps(list(categories) if categories else [])],
            )
        return RunStats(
            run_id=run_id,
            started_at=started_at,
            finished_at=None,
            total_seen=0,
            added=0,
            maintained=0,
            removed=0,
        )

    def finish_run(
        self, run_id: str, *, total_seen: int, added: int, maintained: int, removed: int
    ) -> None:
        with self._cur() as cur:
            cur.execute(
                """
                UPDATE crawl_runs
                   SET finished_at = %s,
                       total_seen = %s,
                       added = %s,
                       maintained = %s,
                       removed = %s
                 WHERE run_id = %s
                """,
                [_utcnow(), total_seen, added, maintained, removed, run_id],
            )

    def get_recent_runs(self, limit: int = 10) -> list[dict]:
        with self._cur() as cur:
            cur.execute(
                """
                SELECT run_id, started_at, finished_at, total_seen, added, maintained, removed
                FROM crawl_runs
                WHERE finished_at IS NOT NULL
                ORDER BY finished_at DESC
                LIMIT %s
                """,
                [limit],
            )
            rows = cur.fetchall()
        return [
            {
                "run_id": r[0],
                "started_at": r[1],
                "finished_at": r[2],
                "total_seen": r[3],
                "added": r[4],
                "maintained": r[5],
                "removed": r[6],
            }
            for r in rows
        ]

    # === Job lifecycle ===

    def existing_job_uuids(self) -> set[str]:
        with self._cur() as cur:
            cur.execute("SELECT job_uuid FROM jobs")
            return {r[0] for r in cur.fetchall()}

    def active_job_uuids(self) -> set[str]:
        with self._cur() as cur:
            cur.execute("SELECT job_uuid FROM jobs WHERE is_active = TRUE")
            return {r[0] for r in cur.fetchall()}

    def active_job_uuids_for_source(self, job_source: str) -> set[str]:
        with self._cur() as cur:
            if job_source == "mcf":
                cur.execute(
                    "SELECT job_uuid FROM jobs WHERE is_active = TRUE AND (job_source = 'mcf' OR job_source IS NULL)"
                )
            else:
                cur.execute(
                    "SELECT job_uuid FROM jobs WHERE is_active = TRUE AND job_source = %s",
                    [job_source],
                )
            return {r[0] for r in cur.fetchall()}

    def record_statuses(
        self,
        run_id: str,
        *,
        added: Iterable[str],
        maintained: Iterable[str],
        removed: Iterable[str],
    ) -> None:
        rows: list[tuple[str, str, str]] = []
        rows.extend((run_id, uuid, "added") for uuid in added)
        rows.extend((run_id, uuid, "maintained") for uuid in maintained)
        rows.extend((run_id, uuid, "removed") for uuid in removed)
        if not rows:
            return
        with self._cur() as cur:
            execute_values(
                cur,
                """
                INSERT INTO job_run_status(run_id, job_uuid, status) VALUES %s
                ON CONFLICT (run_id, job_uuid) DO UPDATE SET status = EXCLUDED.status
                """,
                rows,
            )

    def touch_jobs(self, *, run_id: str, job_uuids: Iterable[str]) -> None:
        now = _utcnow()
        rows = [(run_id, now, uuid) for uuid in job_uuids]
        if not rows:
            return
        with self._cur() as cur:
            cur.executemany(
                "UPDATE jobs SET last_seen_run_id = %s, last_seen_at = %s, is_active = TRUE WHERE job_uuid = %s",
                rows,
            )

    def deactivate_jobs(self, *, run_id: str, job_uuids: Iterable[str]) -> None:
        now = _utcnow()
        rows = [(run_id, now, uuid) for uuid in job_uuids]
        if not rows:
            return
        with self._cur() as cur:
            cur.executemany(
                "UPDATE jobs SET last_seen_run_id = %s, last_seen_at = %s, is_active = FALSE WHERE job_uuid = %s",
                rows,
            )

    def upsert_new_job_detail(
        self,
        *,
        run_id: str,
        job_uuid: str,
        title: str | None,
        company_name: str | None,
        location: str | None,
        job_url: str | None,
        job_source: str = "mcf",
        skills: list[str] | None = None,
        raw_json: dict | None = None,
    ) -> None:
        now = _utcnow()
        skills_json_str = json.dumps(skills) if skills else None
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO jobs(job_uuid, job_source, first_seen_run_id, last_seen_run_id,
                                 is_active, first_seen_at, last_seen_at,
                                 title, company_name, location, job_url, skills_json)
                VALUES (%s, %s, %s, %s, TRUE, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (job_uuid) DO UPDATE SET
                  job_source       = COALESCE(EXCLUDED.job_source, jobs.job_source),
                  last_seen_run_id = EXCLUDED.last_seen_run_id,
                  is_active        = TRUE,
                  last_seen_at     = EXCLUDED.last_seen_at,
                  title            = COALESCE(EXCLUDED.title, jobs.title),
                  company_name     = COALESCE(EXCLUDED.company_name, jobs.company_name),
                  location         = COALESCE(EXCLUDED.location, jobs.location),
                  job_url          = COALESCE(EXCLUDED.job_url, jobs.job_url),
                  skills_json      = COALESCE(EXCLUDED.skills_json, jobs.skills_json)
                """,
                [
                    job_uuid, job_source, run_id, run_id,
                    now, now, title, company_name, location, job_url, skills_json_str,
                ],
            )

    def get_job(self, job_uuid: str) -> dict | None:
        with self._cur() as cur:
            cur.execute(
                """
                SELECT job_uuid, title, company_name, location, job_url,
                       is_active, first_seen_at, last_seen_at
                FROM jobs WHERE job_uuid = %s
                """,
                [job_uuid],
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "job_uuid": row[0], "title": row[1], "company_name": row[2],
            "location": row[3], "job_url": row[4], "is_active": row[5],
            "first_seen_at": row[6], "last_seen_at": row[7],
        }

    def search_jobs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        category: str | None = None,
        keywords: str | None = None,
    ) -> list[dict]:
        sql = "SELECT job_uuid, title, company_name, location, job_url FROM jobs WHERE is_active = TRUE"
        params: list = []
        if keywords:
            sql += " AND (title ILIKE %s OR company_name ILIKE %s OR location ILIKE %s)"
            params.extend([f"%{keywords}%", f"%{keywords}%", f"%{keywords}%"])
        sql += " ORDER BY last_seen_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        with self._cur() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [
            {"job_uuid": r[0], "title": r[1], "company_name": r[2], "location": r[3], "job_url": r[4]}
            for r in rows
        ]

    def get_active_job_count(self) -> int:
        with self._cur() as cur:
            cur.execute("SELECT COUNT(*) FROM jobs WHERE is_active = TRUE")
            row = cur.fetchone()
        return row[0] if row else 0

    # === Job embeddings ===

    def upsert_embedding(
        self, *, job_uuid: str, model_name: str, embedding: Sequence[float]
    ) -> None:
        now = _utcnow()
        emb_list = [float(x) for x in embedding]
        emb_str = json.dumps(emb_list)
        with self._cur() as cur:
            # Try with pgvector column first (after 001_add_pgvector migration)
            try:
                cur.execute(
                    """
                    INSERT INTO job_embeddings(job_uuid, model_name, embedding_json, embedding, dim, embedded_at)
                    VALUES (%s, %s, %s, %s::vector, %s, %s)
                    ON CONFLICT (job_uuid) DO UPDATE SET
                      model_name     = EXCLUDED.model_name,
                      embedding_json = EXCLUDED.embedding_json,
                      embedding      = EXCLUDED.embedding,
                      dim            = EXCLUDED.dim,
                      embedded_at    = EXCLUDED.embedded_at
                    """,
                    [job_uuid, model_name, emb_str, emb_str, len(emb_list), now],
                )
            except psycopg2.ProgrammingError as e:
                if "embedding" in str(e) or "column" in str(e).lower():
                    # pgvector migration not run yet — use json only
                    cur.execute(
                        """
                        INSERT INTO job_embeddings(job_uuid, model_name, embedding_json, dim, embedded_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (job_uuid) DO UPDATE SET
                          model_name     = EXCLUDED.model_name,
                          embedding_json = EXCLUDED.embedding_json,
                          dim            = EXCLUDED.dim,
                          embedded_at    = EXCLUDED.embedded_at
                        """,
                        [job_uuid, model_name, emb_str, len(emb_list), now],
                    )
                else:
                    raise

    def get_active_job_embeddings(
        self,
        query_embedding: Sequence[float] | None = None,
        limit: int | None = None,
    ) -> list[tuple[str, str, list[float], dict]]:
        emb_select, has_vector = self._job_embedding_schema()

        # Use pgvector similarity search when query_embedding, limit, and vector column exist
        if (
            query_embedding is not None
            and limit is not None
            and limit > 0
            and has_vector
        ):
            emb_str = json.dumps([float(x) for x in query_embedding])
            try:
                with self._cur() as cur:
                    cur.execute(
                        f"""
                        SELECT j.job_uuid, j.title, {emb_select},
                               j.company_name, j.location, j.job_url,
                               j.first_seen_at, j.last_seen_at, j.skills_json
                          FROM jobs j
                          JOIN job_embeddings e ON e.job_uuid = j.job_uuid
                         WHERE j.is_active = TRUE
                           AND e.embedding IS NOT NULL
                         ORDER BY e.embedding <=> %s::vector ASC
                         LIMIT %s
                        """,
                        [emb_str, limit],
                    )
                    rows = cur.fetchall()
                out: list[tuple[str, str, list[float], dict]] = []
                for uuid, title, emb_json, company_name, location, job_url, first_seen_at, last_seen_at, skills_json in rows:
                    job_details = {
                        "company_name": company_name,
                        "location": location,
                        "job_url": job_url,
                        "first_seen_at": first_seen_at,
                        "last_seen_at": last_seen_at,
                        "skills": json.loads(skills_json) if skills_json else [],
                    }
                    out.append((uuid, title or "", json.loads(emb_json), job_details))
                return out
            except psycopg2.ProgrammingError:
                pass  # Fall through to full scan

        # Full scan (no vector search or pgvector not migrated)
        with self._cur() as cur:
            cur.execute(
                f"""
                SELECT j.job_uuid, j.title, {emb_select},
                       j.company_name, j.location, j.job_url,
                       j.first_seen_at, j.last_seen_at, j.skills_json
                  FROM jobs j
                  JOIN job_embeddings e ON e.job_uuid = j.job_uuid
                 WHERE j.is_active = TRUE
                """
            )
            rows = cur.fetchall()
        out = []
        for uuid, title, emb_json, company_name, location, job_url, first_seen_at, last_seen_at, skills_json in rows:
            job_details = {
                "company_name": company_name,
                "location": location,
                "job_url": job_url,
                "first_seen_at": first_seen_at,
                "last_seen_at": last_seen_at,
                "skills": json.loads(skills_json) if skills_json else [],
            }
            out.append((uuid, title or "", json.loads(emb_json), job_details))
        return out

    def get_all_active_jobs(self) -> list[dict]:
        with self._cur() as cur:
            cur.execute("SELECT job_uuid, title, skills_json FROM jobs WHERE is_active = TRUE")
            rows = cur.fetchall()
        return [
            {
                "job_uuid": r[0],
                "title": r[1] or "",
                "skills": json.loads(r[2]) if r[2] else [],
            }
            for r in rows
        ]

    def get_job_embeddings_for_uuids(
        self, uuids: list[str]
    ) -> list[tuple[str, list[float]]]:
        if not uuids:
            return []
        emb_select, _ = self._job_embedding_schema()
        col = emb_select.replace("e.", "")  # "embedding_json" or "embedding::text"
        with self._cur() as cur:
            cur.execute(
                f"SELECT job_uuid, {col} FROM job_embeddings WHERE job_uuid = ANY(%s)",
                [uuids],
            )
            rows = cur.fetchall()
        return [(r[0], json.loads(r[1])) for r in rows]

    def get_embedding_model_name(self) -> str | None:
        with self._cur() as cur:
            cur.execute("SELECT model_name FROM job_embeddings LIMIT 1")
            row = cur.fetchone()
        return row[0] if row else None

    # === Users ===

    def get_user_by_id(self, user_id: str) -> dict | None:
        with self._cur() as cur:
            cur.execute(
                "SELECT user_id, email, role, created_at, last_login FROM users WHERE user_id = %s",
                [user_id],
            )
            row = cur.fetchone()
        if not row:
            return None
        return {"user_id": row[0], "email": row[1], "role": row[2], "created_at": row[3], "last_login": row[4]}

    def upsert_user(self, *, user_id: str, email: str, role: str = "candidate") -> None:
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO users(user_id, email, role, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                  email = EXCLUDED.email,
                  role  = EXCLUDED.role
                """,
                [user_id, email, role, _utcnow()],
            )

    # === Profiles ===

    def create_profile(
        self,
        *,
        profile_id: str,
        user_id: str,
        raw_resume_text: str | None = None,
        expanded_profile_json: dict | None = None,
        skills_json: list[str] | None = None,
        experience_json: list[dict] | None = None,
    ) -> None:
        now = _utcnow()
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO candidate_profiles(profile_id, user_id, raw_resume_text,
                    expanded_profile_json, skills_json, experience_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    profile_id, user_id, raw_resume_text,
                    json.dumps(expanded_profile_json) if expanded_profile_json else None,
                    json.dumps(skills_json) if skills_json else None,
                    json.dumps(experience_json) if experience_json else None,
                    now, now,
                ],
            )

    def get_profile_by_user_id(self, user_id: str) -> dict | None:
        with self._cur() as cur:
            cur.execute(
                """
                SELECT profile_id, user_id, raw_resume_text, expanded_profile_json,
                       skills_json, experience_json, created_at, updated_at
                FROM candidate_profiles WHERE user_id = %s
                """,
                [user_id],
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "profile_id": row[0], "user_id": row[1], "raw_resume_text": row[2],
            "expanded_profile_json": json.loads(row[3]) if row[3] else None,
            "skills_json": json.loads(row[4]) if row[4] else None,
            "experience_json": json.loads(row[5]) if row[5] else None,
            "created_at": row[6], "updated_at": row[7],
        }

    def get_profile_by_profile_id(self, profile_id: str) -> dict | None:
        with self._cur() as cur:
            cur.execute(
                """
                SELECT profile_id, user_id, raw_resume_text, expanded_profile_json,
                       skills_json, experience_json, created_at, updated_at
                FROM candidate_profiles WHERE profile_id = %s
                """,
                [profile_id],
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "profile_id": row[0], "user_id": row[1], "raw_resume_text": row[2],
            "expanded_profile_json": json.loads(row[3]) if row[3] else None,
            "skills_json": json.loads(row[4]) if row[4] else None,
            "experience_json": json.loads(row[5]) if row[5] else None,
            "created_at": row[6], "updated_at": row[7],
        }

    def update_profile(
        self,
        *,
        profile_id: str,
        raw_resume_text: str | None = None,
        expanded_profile_json: dict | None = None,
        skills_json: list[str] | None = None,
        experience_json: list[dict] | None = None,
        resume_storage_path: str | None = None,
    ) -> None:
        now = _utcnow()
        updates = []
        values: list = []
        if raw_resume_text is not None:
            updates.append("raw_resume_text = %s")
            values.append(raw_resume_text)
        if expanded_profile_json is not None:
            updates.append("expanded_profile_json = %s")
            values.append(json.dumps(expanded_profile_json))
        if skills_json is not None:
            updates.append("skills_json = %s")
            values.append(json.dumps(skills_json))
        if experience_json is not None:
            updates.append("experience_json = %s")
            values.append(json.dumps(experience_json))
        if resume_storage_path is not None:
            updates.append("resume_storage_path = %s")
            values.append(resume_storage_path)
        updates.append("updated_at = %s")
        values.append(now)
        values.append(profile_id)
        with self._cur() as cur:
            cur.execute(
                f"UPDATE candidate_profiles SET {', '.join(updates)} WHERE profile_id = %s",
                values,
            )

    # === Candidate embeddings ===

    def upsert_candidate_embedding(
        self, *, profile_id: str, model_name: str, embedding: Sequence[float]
    ) -> None:
        now = _utcnow()
        emb_list = [float(x) for x in embedding]
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO candidate_embeddings(profile_id, model_name, embedding_json, dim, embedded_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (profile_id) DO UPDATE SET
                  model_name     = EXCLUDED.model_name,
                  embedding_json = EXCLUDED.embedding_json,
                  dim            = EXCLUDED.dim,
                  embedded_at    = EXCLUDED.embedded_at
                """,
                [profile_id, model_name, json.dumps(emb_list), len(emb_list), now],
            )

    def get_candidate_embedding(self, profile_id: str) -> list[float] | None:
        with self._cur() as cur:
            cur.execute(
                "SELECT embedding_json FROM candidate_embeddings WHERE profile_id = %s",
                [profile_id],
            )
            row = cur.fetchone()
        return json.loads(row[0]) if row else None

    def upsert_taste_embedding(
        self, *, profile_id: str, model_name: str, embedding: Sequence[float]
    ) -> None:
        taste_key = f"{profile_id}:taste"
        now = _utcnow()
        emb_list = [float(x) for x in embedding]
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO candidate_embeddings(profile_id, model_name, embedding_json, dim, embedded_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (profile_id) DO UPDATE SET
                  model_name     = EXCLUDED.model_name,
                  embedding_json = EXCLUDED.embedding_json,
                  dim            = EXCLUDED.dim,
                  embedded_at    = EXCLUDED.embedded_at
                """,
                [taste_key, model_name, json.dumps(emb_list), len(emb_list), now],
            )

    def get_taste_embedding(self, profile_id: str) -> list[float] | None:
        taste_key = f"{profile_id}:taste"
        with self._cur() as cur:
            cur.execute(
                "SELECT embedding_json FROM candidate_embeddings WHERE profile_id = %s",
                [taste_key],
            )
            row = cur.fetchone()
        return json.loads(row[0]) if row else None

    # === Interactions ===

    def record_interaction(
        self, *, user_id: str, job_uuid: str, interaction_type: str
    ) -> None:
        now = _utcnow()
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO job_interactions(user_id, job_uuid, interaction_type, interacted_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, job_uuid, interaction_type)
                DO UPDATE SET interacted_at = EXCLUDED.interacted_at
                """,
                [user_id, job_uuid, interaction_type, now],
            )

    def get_interacted_jobs(self, user_id: str) -> set[str]:
        with self._cur() as cur:
            cur.execute(
                "SELECT DISTINCT job_uuid FROM job_interactions WHERE user_id = %s",
                [user_id],
            )
            return {r[0] for r in cur.fetchall()}

    def get_interested_job_uuids(self, user_id: str) -> list[str]:
        with self._cur() as cur:
            cur.execute(
                "SELECT job_uuid FROM job_interactions WHERE user_id = %s AND interaction_type = 'interested'",
                [user_id],
            )
            return [r[0] for r in cur.fetchall()]

    def get_not_interested_job_uuids(self, user_id: str) -> list[str]:
        with self._cur() as cur:
            cur.execute(
                "SELECT job_uuid FROM job_interactions WHERE user_id = %s AND interaction_type = 'not_interested'",
                [user_id],
            )
            return [r[0] for r in cur.fetchall()]

    # === Discover ===

    def get_discover_jobs(self, user_id: str, limit: int = 20) -> list[dict]:
        with self._cur() as cur:
            cur.execute(
                """
                SELECT j.job_uuid, j.title, j.company_name, j.location, j.job_url,
                       j.last_seen_at, j.skills_json
                  FROM jobs j
                  JOIN job_embeddings e ON e.job_uuid = j.job_uuid
                 WHERE j.is_active = TRUE
                   AND NOT EXISTS (
                         SELECT 1 FROM job_interactions i
                          WHERE i.user_id = %s
                            AND i.job_uuid = j.job_uuid
                            AND i.interaction_type IN ('interested', 'not_interested')
                       )
                 ORDER BY j.last_seen_at DESC
                 LIMIT %s
                """,
                [user_id, limit],
            )
            rows = cur.fetchall()
        return [
            {
                "job_uuid": r[0], "title": r[1], "company_name": r[2],
                "location": r[3], "job_url": r[4], "last_seen_at": r[5],
                "skills": json.loads(r[6]) if r[6] else [],
            }
            for r in rows
        ]

    def get_discover_stats(self, user_id: str) -> dict:
        with self._cur() as cur:
            cur.execute(
                """
                SELECT
                  COUNT(*) FILTER (WHERE interaction_type = 'interested')     AS interested,
                  COUNT(*) FILTER (WHERE interaction_type = 'not_interested')  AS not_interested
                FROM job_interactions
                WHERE user_id = %s
                """,
                [user_id],
            )
            row = cur.fetchone()
        interested = row[0] if row else 0
        not_interested = row[1] if row else 0

        with self._cur() as cur:
            cur.execute(
                """
                SELECT COUNT(*)
                  FROM jobs j
                  JOIN job_embeddings e ON e.job_uuid = j.job_uuid
                 WHERE j.is_active = TRUE
                   AND NOT EXISTS (
                         SELECT 1 FROM job_interactions i
                          WHERE i.user_id = %s
                            AND i.job_uuid = j.job_uuid
                            AND i.interaction_type IN ('interested', 'not_interested')
                       )
                """,
                [user_id],
            )
            unrated_row = cur.fetchone()
        unrated = unrated_row[0] if unrated_row else 0

        return {
            "interested": interested,
            "not_interested": not_interested,
            "unrated": unrated,
            "total_rated": interested + not_interested,
        }

    # === Match recording ===

    def record_match(
        self,
        *,
        match_id: str,
        profile_id: str,
        job_uuid: str,
        similarity_score: float,
        match_type: str,
    ) -> None:
        with self._cur() as cur:
            cur.execute(
                """
                INSERT INTO matches(match_id, profile_id, job_uuid, similarity_score, match_type, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                [match_id, profile_id, job_uuid, similarity_score, match_type, _utcnow()],
            )
