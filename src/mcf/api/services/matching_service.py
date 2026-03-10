"""Matching service for bidirectional job-candidate matching."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any

import numpy as np

from mcf.lib.storage.base import Storage

logger = logging.getLogger(__name__)

# Pure semantic matching — skills keyword overlap removed.
# Skills data is too noisy and inconsistently populated to be a reliable signal.
_SEMANTIC_WEIGHT = 1.0
_SKILLS_WEIGHT = 0.0

# Recency factor: gentle penalty for older jobs (0.5% per day, floor 0.5).
# Balances relevance with freshness without filtering out old jobs.
_RECENCY_DECAY_PER_DAY = 0.005
_RECENCY_FLOOR = 0.5


class MatchingService:
    """Service for matching candidates to jobs and vice versa."""

    def __init__(self, store: Storage) -> None:
        self.store = store

    @staticmethod
    def _skills_overlap_score(job_skills: list[str], resume_text_lower: str) -> float:
        """Fraction of a job's skills that appear (as substrings) in the resume.

        Returns a value in [0, 1].  Returns 0 if either input is empty so that
        jobs without skills data do not receive an artificial skills bonus.
        """
        if not job_skills or not resume_text_lower:
            return 0.0
        hits = sum(1 for skill in job_skills if skill.lower() in resume_text_lower)
        return hits / len(job_skills)

    def match_candidate_to_jobs(
        self,
        profile_id: str,
        top_k: int = 25,
        offset: int = 0,
        exclude_interacted: bool = True,
        exclude_rated_only: bool = False,
        user_id: str | None = None,
        min_similarity: float = 0.0,
        max_days_old: int | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Find top matching jobs for a candidate using semantic similarity.

        Score is cosine similarity between the resume embedding and each job embedding
        (both L2-normalised, so dot-product == cosine similarity).

        Args:
            profile_id: Candidate profile ID
            top_k: Number of top matches to return
            exclude_interacted: If True, filter out jobs user has interacted with
            exclude_rated_only: If True, only exclude interested/not_interested (for Discover)
            user_id: User ID for interaction filtering (defaults to profile's user_id)
            min_similarity: Minimum similarity threshold (0.0 to 1.0)
            max_days_old: Maximum age of job posting in days (None = no limit)
        """
        candidate_emb = self.store.get_candidate_embedding(profile_id)
        if not candidate_emb:
            return ([], 0)

        # Pass candidate embedding + limit for pgvector fast path (Postgres only).
        # Use a large pool (60000) so matches keep coming as users rate more jobs.
        # With ~60k jobs, the nearest N by similarity are often already rated; we need
        # to fetch beyond that into less-similar (but unrated) jobs. Use full pool.
        vector_limit = 60000
        logger.debug("match_candidate_to_jobs_entry vector_limit=%s top_k=%s offset=%s", vector_limit, top_k, offset)
        job_embeddings = self.store.get_active_job_embeddings(
            query_embedding=candidate_emb, limit=vector_limit
        )
        logger.debug(
            "match_candidate_to_jobs_after_fetch len_job_embeddings=%s store_type=%s",
            len(job_embeddings) if job_embeddings else 0,
            type(self.store).__name__,
        )
        if not job_embeddings:
            return ([], 0)

        # Load the candidate profile to resolve user_id for interaction filtering
        profile = self.store.get_profile_by_profile_id(profile_id)

        # Resolve user_id for interaction filtering
        if exclude_interacted and user_id is None and profile:
            user_id = profile.get("user_id")

        interacted_jobs: set[str] = set()
        if exclude_interacted and user_id:
            if exclude_rated_only:
                interacted_jobs = set(self.store.get_interested_job_uuids(user_id)) | set(
                    self.store.get_not_interested_job_uuids(user_id)
                )
            else:
                interacted_jobs = self.store.get_interacted_jobs(user_id)

        candidate_vec = np.array(candidate_emb, dtype=np.float32)
        scored: list[tuple[float, str, str, datetime | None, dict]] = []

        for job_uuid, title, job_emb, job_details in job_embeddings:
            if exclude_interacted and job_uuid in interacted_jobs:
                continue

            # Semantic similarity (cosine – embeddings are L2-normalised)
            job_vec = np.array(job_emb, dtype=np.float32)
            semantic_score = float(np.dot(candidate_vec, job_vec))

            # At threshold 0, allow all scores including negative (cosine can be negative)
            effective_min = min_similarity if min_similarity > 0 else -1.0
            if semantic_score < effective_min:
                continue

            last_seen_at = job_details.get("last_seen_at")
            # Hard filter: only when user explicitly sets max_days_old
            if max_days_old is not None and last_seen_at:
                if last_seen_at.tzinfo is None:
                    last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - last_seen_at).days > max_days_old:
                    continue

            # Recency-weighted score: balance relevance with freshness (never filter by default)
            days_old = 0
            if last_seen_at:
                ts = last_seen_at if last_seen_at.tzinfo else last_seen_at.replace(tzinfo=timezone.utc)
                days_old = max(0, (datetime.now(timezone.utc) - ts).days)
            recency_factor = max(_RECENCY_FLOOR, 1.0 - _RECENCY_DECAY_PER_DAY * days_old)
            combined_score = semantic_score * recency_factor

            scored.append((combined_score, semantic_score, job_uuid, title, last_seen_at, job_details))

        # Sort: combined score descending, then recency descending as tie-breaker
        def sort_key(x: tuple) -> tuple:
            combined, _, _, _, last_seen, _ = x
            date_for_sort = last_seen if last_seen else datetime(1970, 1, 1, tzinfo=timezone.utc)
            return (combined, date_for_sort)

        scored.sort(reverse=True, key=sort_key)
        total_available = len(scored)
        top_matches = scored[offset : offset + top_k]

        logger.debug(
            "match_candidate_to_jobs_exit len_scored=%s total_available=%s len_top_matches=%s len_interacted_jobs=%s",
            len(scored), total_available, len(top_matches), len(interacted_jobs),
        )

        results = []
        for combined_score, semantic_score, job_uuid, title, _, job_details in top_matches:
            match_id = secrets.token_urlsafe(16)
            self.store.record_match(
                match_id=match_id,
                profile_id=profile_id,
                job_uuid=job_uuid,
                similarity_score=combined_score,
                match_type="candidate_initiated",
            )
            results.append(
                {
                    "job_uuid": job_uuid,
                    "title": title,
                    "company_name": job_details.get("company_name"),
                    "location": job_details.get("location"),
                    "job_url": job_details.get("job_url"),
                    "similarity_score": combined_score,
                    "semantic_score": semantic_score,
                    "job_skills": job_details.get("skills") or [],
                    "last_seen_at": job_details.get("last_seen_at"),
                }
            )

        return (results, total_available)

    # ------------------------------------------------------------------
    # Taste-profile methods
    # ------------------------------------------------------------------

    def compute_and_store_taste(self, profile_id: str, user_id: str) -> dict:
        """Build a taste-profile embedding from the user's Interested/Not Interested ratings.

        Algorithm:
            positive  = mean embedding of all "interested" jobs
            negative  = mean embedding of all "not_interested" jobs  (may be empty)
            taste_raw = positive - 0.3 * negative
            taste_vec = L2_normalize(taste_raw)

        The result is stored via ``store.upsert_taste_embedding`` and also
        returned as a dict so the caller can surface stats to the frontend.

        Returns ``{"ok": True, "rated_count": N, "interested": P, "not_interested": Q}``
        or ``{"ok": False, "reason": "..."}`` if not enough data.
        """
        interested_uuids = self.store.get_interested_job_uuids(user_id)
        not_interested_uuids = self.store.get_not_interested_job_uuids(user_id)

        if not interested_uuids:
            return {"ok": False, "reason": "No 'interested' ratings yet. Rate at least one job as Interested first."}

        pos_pairs = self.store.get_job_embeddings_for_uuids(interested_uuids)
        if not pos_pairs:
            return {"ok": False, "reason": "Interested jobs have no embeddings yet."}

        pos_matrix = np.array([emb for _, emb in pos_pairs], dtype=np.float32)
        positive_mean = pos_matrix.mean(axis=0)

        taste_raw = positive_mean.copy()

        if not_interested_uuids:
            neg_pairs = self.store.get_job_embeddings_for_uuids(not_interested_uuids)
            if neg_pairs:
                neg_matrix = np.array([emb for _, emb in neg_pairs], dtype=np.float32)
                negative_mean = neg_matrix.mean(axis=0)
                taste_raw = taste_raw - 0.3 * negative_mean

        # L2 normalise so dot-product == cosine similarity during matching
        norm = float(np.linalg.norm(taste_raw))
        if norm > 0:
            taste_vec = (taste_raw / norm).tolist()
        else:
            taste_vec = positive_mean.tolist()

        model_name = self.store.get_embedding_model_name() or "BAAI/bge-small-en-v1.5"

        self.store.upsert_taste_embedding(
            profile_id=profile_id,
            model_name=model_name,
            embedding=taste_vec,
        )

        return {
            "ok": True,
            "interested": len(pos_pairs),
            "not_interested": len(not_interested_uuids),
            "rated_count": len(interested_uuids) + len(not_interested_uuids),
        }

    def match_taste_to_jobs(
        self,
        profile_id: str,
        top_k: int = 25,
        offset: int = 0,
        exclude_rated: bool = True,
        user_id: str | None = None,
        min_similarity: float = 0.0,
        max_days_old: int | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Find top jobs matching the user's taste-profile embedding.

        Pure semantic matching — no skills overlap (taste already encodes
        the user's demonstrated preferences directly).
        """
        taste_emb = self.store.get_taste_embedding(profile_id)
        if not taste_emb:
            return ([], 0)

        vector_limit = 60000
        job_embeddings = self.store.get_active_job_embeddings(
            query_embedding=taste_emb, limit=vector_limit
        )
        if not job_embeddings:
            return ([], 0)

        # Exclude already-rated (interested / not_interested) jobs
        rated_uuids: set[str] = set()
        if exclude_rated and user_id:
            rated_uuids = set(self.store.get_interested_job_uuids(user_id)) | set(
                self.store.get_not_interested_job_uuids(user_id)
            )

        taste_vec = np.array(taste_emb, dtype=np.float32)
        scored: list[tuple[float, str, str, datetime | None, dict]] = []  # (combined_score, uuid, title, last_seen, details)

        for job_uuid, title, job_emb, job_details in job_embeddings:
            if exclude_rated and job_uuid in rated_uuids:
                continue

            job_vec = np.array(job_emb, dtype=np.float32)
            semantic_score = float(np.dot(taste_vec, job_vec))

            effective_min = min_similarity if min_similarity > 0 else -1.0
            if semantic_score < effective_min:
                continue

            last_seen_at = job_details.get("last_seen_at")
            if max_days_old is not None and last_seen_at:
                if last_seen_at.tzinfo is None:
                    last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - last_seen_at).days > max_days_old:
                    continue

            # Recency-weighted score (same as resume matching)
            days_old = 0
            if last_seen_at:
                ts = last_seen_at if last_seen_at.tzinfo else last_seen_at.replace(tzinfo=timezone.utc)
                days_old = max(0, (datetime.now(timezone.utc) - ts).days)
            recency_factor = max(_RECENCY_FLOOR, 1.0 - _RECENCY_DECAY_PER_DAY * days_old)
            combined_score = semantic_score * recency_factor

            scored.append((combined_score, job_uuid, title, last_seen_at, job_details))

        def sort_key(x: tuple) -> tuple:
            combined, _, _, last_seen, _ = x
            date_for_sort = last_seen if last_seen else datetime(1970, 1, 1, tzinfo=timezone.utc)
            return (combined, date_for_sort)

        scored.sort(reverse=True, key=sort_key)
        total_available = len(scored)
        top_matches = scored[offset : offset + top_k]

        results = []
        for combined_score, job_uuid, title, _, job_details in top_matches:
            match_id = secrets.token_urlsafe(16)
            self.store.record_match(
                match_id=match_id,
                profile_id=profile_id,
                job_uuid=job_uuid,
                similarity_score=combined_score,
                match_type="taste",
            )
            results.append(
                {
                    "job_uuid": job_uuid,
                    "title": title,
                    "company_name": job_details.get("company_name"),
                    "location": job_details.get("location"),
                    "job_url": job_details.get("job_url"),
                    "similarity_score": combined_score,
                    "job_skills": job_details.get("skills") or [],
                    "last_seen_at": job_details.get("last_seen_at"),
                }
            )

        return (results, total_available)
