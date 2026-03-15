"""Storage abstraction interface for job crawler."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Sequence


@dataclass(frozen=True)
class RunStats:
    """Statistics for a crawl run."""

    run_id: str
    started_at: datetime
    finished_at: datetime | None
    total_seen: int
    added: int
    maintained: int
    removed: int


class Storage(ABC):
    """Abstract storage interface.

    Both DuckDBStore (local) and PostgresStore (hosted) implement this interface,
    allowing the entire application to switch backends via a single DATABASE_URL
    environment variable without touching any other code.
    """

    # === Crawl runs ===

    @abstractmethod
    def begin_run(self, *, kind: str, categories: Sequence[str] | None) -> RunStats: ...

    @abstractmethod
    def finish_run(
        self, run_id: str, *, total_seen: int, added: int, maintained: int, removed: int
    ) -> None: ...

    @abstractmethod
    def get_recent_runs(self, limit: int = 10) -> list[dict]: ...

    # === Job lifecycle ===

    @abstractmethod
    def existing_job_uuids(self) -> set[str]: ...

    @abstractmethod
    def active_job_uuids(self) -> set[str]: ...

    @abstractmethod
    def active_job_uuids_for_source(self, job_source: str) -> set[str]: ...

    @abstractmethod
    def record_statuses(
        self,
        run_id: str,
        *,
        added: Iterable[str],
        maintained: Iterable[str],
        removed: Iterable[str],
    ) -> None: ...

    @abstractmethod
    def touch_jobs(self, *, run_id: str, job_uuids: Iterable[str]) -> None: ...

    @abstractmethod
    def deactivate_jobs(self, *, run_id: str, job_uuids: Iterable[str]) -> None: ...

    @abstractmethod
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
        categories: list[str] | None = None,
        employment_types: list[str] | None = None,
        position_levels: list[str] | None = None,
        salary_min: int | None = None,
        salary_max: int | None = None,
        posted_date: str | None = None,
        expiry_date: str | None = None,
        min_years_experience: int | None = None,
    ) -> None: ...

    @abstractmethod
    def update_daily_stats(self, run_id: str) -> None:
        """Recompute job_daily_stats for today from the current active job roster."""
        ...

    def backfill_job_daily_stats(self, limit_days: int = 365) -> dict:
        """One-time backfill of job_daily_stats from jobs table for historical dates.

        Computes active_count, added_count, removed_count per (stat_date, category, employment_type, position_level)
        for each date in the range. Returns {rows_inserted, date_start, date_end}.
        """
        raise NotImplementedError

    @abstractmethod
    def delete_inactive_job_embeddings(self) -> int:
        """Delete embeddings for inactive jobs with no user interactions.
        Returns count of deleted rows."""
        ...

    def get_job_uuids_needing_rich_backfill(self, limit: int | None = None) -> list[str]:
        """Return MCF job UUIDs where categories_json is NULL or empty (need backfill).
        Used by backfill-rich-fields to populate rich metadata from the MCF API."""
        raise NotImplementedError

    @abstractmethod
    def get_job(self, job_uuid: str) -> dict | None: ...

    @abstractmethod
    def get_active_job_count(self) -> int: ...

    # === Job embeddings ===

    @abstractmethod
    def upsert_embedding(
        self, *, job_uuid: str, model_name: str, embedding: Sequence[float]
    ) -> None: ...

    @abstractmethod
    def get_active_job_embeddings(
        self,
        query_embedding: Sequence[float] | None = None,
        limit: int | None = None,
    ) -> list[tuple[str, str, list[float], dict]]: ...

    @abstractmethod
    def get_all_active_jobs(self) -> list[dict]: ...

    @abstractmethod
    def get_job_embeddings_for_uuids(
        self, uuids: list[str]
    ) -> list[tuple[str, list[float]]]: ...

    @abstractmethod
    def get_embedding_model_name(self) -> str | None: ...

    @abstractmethod
    def get_active_job_ids_ranked(
        self,
        query_embedding: Sequence[float],
        limit: int = 5000,
    ) -> list[tuple[str, float, datetime | None]]:
        """Return (job_uuid, cosine_distance, last_seen_at) sorted by distance ASC."""
        ...

    @abstractmethod
    def get_jobs_by_uuids(self, uuids: list[str]) -> list[dict]:
        """Return full job dicts for each uuid; output order matches input order."""
        ...

    @abstractmethod
    def create_match_session(
        self,
        *,
        user_id: str,
        mode: str,
        ranked_ids: list[str],
        ttl_seconds: int = 7200,
    ) -> str:
        """Store ranked_ids, return new session_id."""
        ...

    @abstractmethod
    def get_match_session(self, session_id: str, user_id: str) -> dict | None:
        """Return {session_id, ranked_ids, total} or None if not found/expired."""
        ...

    # === Users ===

    @abstractmethod
    def get_user_by_id(self, user_id: str) -> dict | None: ...

    @abstractmethod
    def upsert_user(self, *, user_id: str, email: str, role: str = "candidate") -> None: ...

    # === Profiles ===

    @abstractmethod
    def create_profile(
        self,
        *,
        profile_id: str,
        user_id: str,
        raw_resume_text: str | None = None,
        expanded_profile_json: dict | None = None,
        skills_json: list[str] | None = None,
        experience_json: list[dict] | None = None,
    ) -> None: ...

    @abstractmethod
    def get_profile_by_user_id(self, user_id: str) -> dict | None: ...

    @abstractmethod
    def get_profile_by_profile_id(self, profile_id: str) -> dict | None: ...

    @abstractmethod
    def update_profile(
        self,
        *,
        profile_id: str,
        raw_resume_text: str | None = None,
        expanded_profile_json: dict | None = None,
        skills_json: list[str] | None = None,
        experience_json: list[dict] | None = None,
        resume_storage_path: str | None = None,
    ) -> None: ...

    # === Candidate embeddings ===

    @abstractmethod
    def upsert_candidate_embedding(
        self, *, profile_id: str, model_name: str, embedding: Sequence[float]
    ) -> None: ...

    @abstractmethod
    def get_candidate_embedding(self, profile_id: str) -> list[float] | None: ...

    @abstractmethod
    def upsert_taste_embedding(
        self, *, profile_id: str, model_name: str, embedding: Sequence[float]
    ) -> None: ...

    @abstractmethod
    def get_taste_embedding(self, profile_id: str) -> list[float] | None: ...

    # === Interactions ===

    @abstractmethod
    def record_interaction(
        self, *, user_id: str, job_uuid: str, interaction_type: str
    ) -> None: ...

    @abstractmethod
    def get_interacted_jobs(self, user_id: str) -> set[str]: ...

    @abstractmethod
    def get_interested_job_uuids(self, user_id: str) -> list[str]: ...

    @abstractmethod
    def get_not_interested_job_uuids(self, user_id: str) -> list[str]: ...

    # === Discover ===

    @abstractmethod
    def get_discover_stats(self, user_id: str) -> dict: ...

    # === Dashboard ===

    @abstractmethod
    def get_dashboard_summary(self) -> dict: ...

    def get_jobs_over_time_posted_and_removed(self, limit_days: int = 90) -> list[dict]:
        """Jobs by posted_date (active) and by last_seen_at (removed). Returns list of {date, posted_count, removed_count, cumulative_posted, cumulative_removed}."""
        raise NotImplementedError

    def get_active_jobs_over_time(self, limit_days: int = 90) -> list[dict]:
        """Total active jobs per day from job_daily_stats. Returns list of {date, active_count}."""
        raise NotImplementedError

    @abstractmethod
    def get_jobs_by_category(self, limit_days: int = 90, limit: int = 30) -> list[dict]: ...

    def get_category_trends(self, category: str, limit_days: int = 90) -> list[dict]:
        """Trend data for a category from job_daily_stats. Returns [{date, active_count, added_count, removed_count}]."""
        raise NotImplementedError

    def get_category_stats(self, category: str) -> dict:
        """Stats for a category: active_count, employment_types, position_levels, salary_buckets, avg_salary, etc."""
        raise NotImplementedError

    @abstractmethod
    def get_jobs_by_employment_type(self, limit_days: int = 90, limit: int = 20) -> list[dict]: ...

    @abstractmethod
    def get_jobs_by_position_level(self, limit_days: int = 90, limit: int = 20) -> list[dict]: ...

    @abstractmethod
    def get_salary_distribution(self) -> list[dict]: ...

    def reset_profile_ratings(self, user_id: str) -> dict:
        """Reset job interactions and taste profile for a user (for testing).
        Returns counts of deleted rows. Override in store implementations."""
        raise NotImplementedError

    # === Match recording ===

    @abstractmethod
    def record_match(
        self,
        *,
        match_id: str,
        profile_id: str,
        job_uuid: str,
        similarity_score: float,
        match_type: str,
    ) -> None: ...

    # === Lifecycle ===

    @abstractmethod
    def close(self) -> None: ...
