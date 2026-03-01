"""Matching service for bidirectional job-candidate matching."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

import numpy as np

from mcf.lib.storage.duckdb_store import DuckDBStore

# Weights for the hybrid score: semantic similarity + skills keyword overlap.
# Semantic embedding captures overall role alignment; skills overlap is a hard
# signal that specific technologies/tools appear in the resume.
_SEMANTIC_WEIGHT = 0.65
_SKILLS_WEIGHT = 0.35


class MatchingService:
    """Service for matching candidates to jobs and vice versa."""

    def __init__(self, store: DuckDBStore) -> None:
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
        exclude_interacted: bool = True,
        user_id: str | None = None,
        min_similarity: float = 0.0,
        max_days_old: int | None = None,
    ) -> list[dict[str, Any]]:
        """Find top matching jobs for a candidate using a hybrid score.

        The final score is a weighted combination of:
          • semantic similarity  (embedding dot-product, 65 %)
          • skills keyword overlap  (job skills found in resume text, 35 %)

        Args:
            profile_id: Candidate profile ID
            top_k: Number of top matches to return
            exclude_interacted: If True, filter out jobs user has already interacted with
            user_id: User ID for interaction filtering (defaults to profile's user_id)
            min_similarity: Minimum *hybrid* score threshold (0.0 to 1.0)
            max_days_old: Maximum age of job posting in days (None = no limit)
        """
        candidate_emb = self.store.get_candidate_embedding(profile_id)
        if not candidate_emb:
            return []

        job_embeddings = self.store.get_active_job_embeddings()
        if not job_embeddings:
            return []

        # Load the candidate profile once to get resume text for skills matching
        profile = self.store.get_profile_by_profile_id(profile_id)
        resume_text_lower = (profile.get("raw_resume_text") or "").lower() if profile else ""

        # Resolve user_id for interaction filtering
        if exclude_interacted and user_id is None and profile:
            user_id = profile.get("user_id")

        interacted_jobs: set[str] = set()
        if exclude_interacted and user_id:
            interacted_jobs = self.store.get_interacted_jobs(user_id)

        candidate_vec = np.array(candidate_emb, dtype=np.float32)
        # tuple: (hybrid_score, semantic_score, skills_score, job_uuid, title, last_seen_at, job_details)
        scored: list[tuple[float, float, float, str, str, datetime | None, dict]] = []

        for job_uuid, title, job_emb, job_details in job_embeddings:
            if exclude_interacted and job_uuid in interacted_jobs:
                continue

            # Semantic similarity (cosine – embeddings are L2-normalised)
            job_vec = np.array(job_emb, dtype=np.float32)
            semantic_score = float(np.dot(candidate_vec, job_vec))

            # Skills keyword overlap
            job_skills: list[str] = job_details.get("skills") or []
            skills_score = self._skills_overlap_score(job_skills, resume_text_lower)

            # Hybrid score
            hybrid_score = _SEMANTIC_WEIGHT * semantic_score + _SKILLS_WEIGHT * skills_score

            if hybrid_score < min_similarity:
                continue

            last_seen_at = job_details.get("last_seen_at")
            if max_days_old is not None and last_seen_at:
                if last_seen_at.tzinfo is None:
                    last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - last_seen_at).days > max_days_old:
                    continue

            scored.append((hybrid_score, semantic_score, skills_score, job_uuid, title, last_seen_at, job_details))

        # Sort: hybrid score descending, then recency descending as tie-breaker
        def sort_key(x: tuple) -> tuple:
            hybrid, _, _, _, _, last_seen, _ = x
            date_for_sort = last_seen if last_seen else datetime(1970, 1, 1, tzinfo=timezone.utc)
            return (hybrid, date_for_sort)

        scored.sort(reverse=True, key=sort_key)
        top_matches = scored[:top_k]

        results = []
        for hybrid_score, semantic_score, skills_score, job_uuid, title, _, job_details in top_matches:
            match_id = secrets.token_urlsafe(16)
            self.store.record_match(
                match_id=match_id,
                profile_id=profile_id,
                job_uuid=job_uuid,
                similarity_score=hybrid_score,
                match_type="candidate_initiated",
            )
            results.append(
                {
                    "job_uuid": job_uuid,
                    "title": title,
                    "company_name": job_details.get("company_name"),
                    "location": job_details.get("location"),
                    "job_url": job_details.get("job_url"),
                    "similarity_score": hybrid_score,
                    "semantic_score": semantic_score,
                    "skills_overlap_score": skills_score,
                    "matched_skills": [
                        s for s in (job_details.get("skills") or [])
                        if s.lower() in resume_text_lower
                    ],
                    "job_skills": job_details.get("skills") or [],
                    "last_seen_at": job_details.get("last_seen_at"),
                }
            )

        return results

    def match_job_to_candidates(self, job_uuid: str, top_k: int = 25) -> list[dict[str, Any]]:
        """Find top matching candidates for a job."""
        job_embeddings = self.store.get_active_job_embeddings()
        job_emb = None
        for uuid, _, emb, _ in job_embeddings:
            if uuid == job_uuid:
                job_emb = emb
                break

        if not job_emb:
            return []

        candidate_embeddings = self.store.get_candidate_embeddings()
        if not candidate_embeddings:
            return []

        job_vec = np.array(job_emb, dtype=np.float32)
        scored: list[tuple[float, str]] = []

        for profile_id, cand_emb in candidate_embeddings:
            cand_vec = np.array(cand_emb, dtype=np.float32)
            score = float(np.dot(job_vec, cand_vec))
            scored.append((score, profile_id))

        scored.sort(reverse=True, key=lambda x: x[0])
        top_matches = scored[:top_k]

        # Get profile details
        results = []
        for score, profile_id in top_matches:
            profile = self.store.get_profile_by_user_id(
                self.store.get_profile_by_user_id(profile_id)["user_id"] if profile_id else None
            )
            if profile:
                match_id = secrets.token_urlsafe(16)
                self.store.record_match(
                    match_id=match_id,
                    profile_id=profile_id,
                    job_uuid=job_uuid,
                    similarity_score=score,
                    match_type="recruiter_search",
                )
                results.append(
                    {
                        "profile_id": profile_id,
                        "skills": profile.get("skills_json", []),
                        "experience": profile.get("experience_json", []),
                        "summary": profile.get("expanded_profile_json", {}).get("summary", ""),
                        "similarity_score": score,
                    }
                )

        return results

    def search_candidates_by_skills(
        self, skills: list[str], top_k: int = 25
    ) -> list[dict[str, Any]]:
        """Search candidates by skills (keyword + semantic matching)."""
        # Get all candidate embeddings
        candidate_embeddings = self.store.get_candidate_embeddings()
        if not candidate_embeddings:
            return []

        # Simple keyword matching for now (can be enhanced with embeddings)
        results = []
        skills_lower = [s.lower() for s in skills]

        for profile_id, _ in candidate_embeddings:
            profile = self.store.get_profile_by_profile_id(profile_id)
            if not profile:
                continue

            profile_skills = profile.get("skills_json", [])
            profile_skills_lower = [s.lower() for s in profile_skills]

            # Count matching skills
            matches = sum(1 for skill in skills_lower if any(skill in ps for ps in profile_skills_lower))
            if matches > 0:
                score = matches / len(skills) if skills else 0
                results.append(
                    {
                        "profile_id": profile_id,
                        "skills": profile_skills,
                        "experience": profile.get("experience_json", []),
                        "summary": profile.get("expanded_profile_json", {}).get("summary", ""),
                        "match_score": score,
                        "matched_skills": matches,
                    }
                )

        results.sort(reverse=True, key=lambda x: x["match_score"])
        return results[:top_k]
