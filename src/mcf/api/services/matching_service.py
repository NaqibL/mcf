"""Matching service for bidirectional job-candidate matching."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

import numpy as np

from mcf.lib.storage.base import Storage

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

    def _build_session(
        self,
        embedding: list[float],
        mode: str,
        user_id: str,
        exclude_interacted: bool,
        exclude_rated_only: bool,
        min_similarity: float,
        max_days_old: int | None,
    ) -> tuple[str, list[str]]:
        """Run the cheap vector query, score, filter, and create a session.
        Returns (session_id, ranked_ids). ranked_ids are "uuid:score" strings.
        Use 2k pool: applicants typically apply to ~200 max; 2k gives 10x headroom for filters and Load More."""
        ranked_with_meta = self.store.get_active_job_ids_ranked(embedding, limit=2000)
        if not ranked_with_meta:
            return ("", [])

        interacted_jobs: set[str] = set()
        if exclude_interacted and user_id:
            if exclude_rated_only:
                interacted_jobs = set(self.store.get_interested_job_uuids(user_id)) | set(
                    self.store.get_not_interested_job_uuids(user_id)
                )
            else:
                interacted_jobs = self.store.get_interacted_jobs(user_id)

        scored: list[tuple[float, str]] = []
        for job_uuid, distance, last_seen_at in ranked_with_meta:
            if job_uuid in interacted_jobs:
                continue
            similarity = 1.0 - distance

            if min_similarity > 0 and similarity < min_similarity:
                continue

            if max_days_old is not None and last_seen_at:
                ts = last_seen_at if last_seen_at.tzinfo else last_seen_at.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - ts).days > max_days_old:
                    continue

            days_old = 0
            if last_seen_at:
                ts = last_seen_at if last_seen_at.tzinfo else last_seen_at.replace(tzinfo=timezone.utc)
                days_old = max(0, (datetime.now(timezone.utc) - ts).days)
            recency_factor = max(_RECENCY_FLOOR, 1.0 - _RECENCY_DECAY_PER_DAY * days_old)
            combined_score = similarity * recency_factor
            scored.append((combined_score, job_uuid))

        scored.sort(reverse=True, key=lambda x: x[0])
        ranked_entries = [f"{uuid}:{score:.6f}" for score, uuid in scored]
        session_id = self.store.create_match_session(
            user_id=user_id, mode=mode, ranked_ids=ranked_entries
        )
        return session_id, ranked_entries

    def _parse_ranked_entries(self, entries: list[str]) -> list[tuple[str, float]]:
        """Parse 'uuid:score' strings to (uuid, score) tuples."""
        result = []
        for entry in entries:
            if ":" in entry:
                uuid, score_str = entry.rsplit(":", 1)
                try:
                    result.append((uuid, float(score_str)))
                except ValueError:
                    result.append((uuid, 0.0))
            else:
                result.append((entry, 0.0))
        return result

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
        session_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int, str]:
        """Find top matching jobs for a candidate using semantic similarity."""
        candidate_emb = self.store.get_candidate_embedding(profile_id)
        if not candidate_emb:
            return ([], 0, "")

        profile = self.store.get_profile_by_profile_id(profile_id)
        if exclude_interacted and user_id is None and profile:
            user_id = profile.get("user_id")

        ranked_entries: list[str] = []
        total = 0

        if session_id and user_id:
            session = self.store.get_match_session(session_id, user_id)
            if session:
                ranked_entries = session["ranked_ids"]
                total = session["total"]

        if not ranked_entries:
            session_id, ranked_entries = self._build_session(
                candidate_emb,
                "resume",
                user_id or "",
                exclude_interacted,
                exclude_rated_only,
                min_similarity,
                max_days_old,
            )
            total = len(ranked_entries)

        parsed = self._parse_ranked_entries(ranked_entries)
        page = parsed[offset : offset + top_k]
        page_ids = [uuid for uuid, _ in page]
        scores_by_uuid = {uuid: score for uuid, score in page}

        jobs_map = {j["job_uuid"]: j for j in self.store.get_jobs_by_uuids(page_ids)}

        results = []
        for job_uuid in page_ids:
            job = jobs_map.get(job_uuid)
            if not job:
                continue
            combined_score = scores_by_uuid.get(job_uuid, 0.0)
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
                    "title": job.get("title"),
                    "company_name": job.get("company_name"),
                    "location": job.get("location"),
                    "job_url": job.get("job_url"),
                    "similarity_score": combined_score,
                    "semantic_score": combined_score,
                    "job_skills": job.get("skills") or [],
                    "last_seen_at": job.get("last_seen_at"),
                }
            )

        return (results, total, session_id or "")

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
        session_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int, str]:
        """Find top jobs matching the user's taste-profile embedding."""
        taste_emb = self.store.get_taste_embedding(profile_id)
        if not taste_emb:
            return ([], 0, "")

        ranked_entries: list[str] = []
        total = 0

        if session_id and user_id:
            session = self.store.get_match_session(session_id, user_id)
            if session:
                ranked_entries = session["ranked_ids"]
                total = session["total"]

        if not ranked_entries:
            session_id, ranked_entries = self._build_session(
                taste_emb,
                "taste",
                user_id or "",
                exclude_rated,
                True,  # taste always excludes only interested/not_interested
                min_similarity,
                max_days_old,
            )
            total = len(ranked_entries)

        parsed = self._parse_ranked_entries(ranked_entries)
        page = parsed[offset : offset + top_k]
        page_ids = [uuid for uuid, _ in page]
        scores_by_uuid = {uuid: score for uuid, score in page}

        jobs_map = {j["job_uuid"]: j for j in self.store.get_jobs_by_uuids(page_ids)}

        results = []
        for job_uuid in page_ids:
            job = jobs_map.get(job_uuid)
            if not job:
                continue
            combined_score = scores_by_uuid.get(job_uuid, 0.0)
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
                    "title": job.get("title"),
                    "company_name": job.get("company_name"),
                    "location": job.get("location"),
                    "job_url": job.get("job_url"),
                    "similarity_score": combined_score,
                    "job_skills": job.get("skills") or [],
                    "last_seen_at": job.get("last_seen_at"),
                }
            )

        return (results, total, session_id or "")
