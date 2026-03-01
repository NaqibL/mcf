"""Structured text builder for job embeddings."""

from __future__ import annotations

from mcf.lib.sources.base import NormalizedJob


def build_job_text_from_normalized(normalized: NormalizedJob) -> str:
    """Build embedding text from a NormalizedJob (source-agnostic)."""
    parts: list[str] = []
    if normalized.title:
        parts.append(f"Job Title: {normalized.title}")
    if normalized.skills:
        parts.append(f"Required Skills: {', '.join(normalized.skills)}")
    if normalized.description_snippet:
        parts.append(f"Description: {normalized.description_snippet}")
    return "\n".join(parts)
