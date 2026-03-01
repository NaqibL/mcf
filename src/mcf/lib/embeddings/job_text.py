"""Structured text builder for job embeddings.

Converts the raw MCF API job response into a compact, signal-rich text string
suitable for retrieval-optimised embedding models.  The key insight is:

* The MCF API already returns a parsed ``skills`` list per job – we use it
  directly instead of hoping the embedding model extracts skills from prose.
* Title + seniority level + skills give more signal per token than boilerplate
  "About us / We are a fast-paced startup" text.
* We only include the first ~100 words of the description to stay within the
  model's token budget while capturing the role summary.
"""

from __future__ import annotations


def build_job_text(raw: dict) -> str:
    """Build a compact, structured text from a raw MCF API job detail dict.

    This is the text that gets embedded for a job (the *passage* side).
    For the candidate/resume side use ``Embedder.embed_query`` instead.
    """
    # Title
    title: str = raw.get("title") or raw.get("jobTitle") or ""

    # Position level(s): list of dicts with a 'position' or 'positionLevel' key
    levels: list[str] = []
    for pl in raw.get("positionLevels", []):
        if isinstance(pl, dict):
            val = pl.get("position") or pl.get("positionLevel")
            if val:
                levels.append(str(val))

    # Skills: list of dicts with a 'skill' key; key skills are surfaced first
    key_skills: list[str] = []
    other_skills: list[str] = []
    for s in raw.get("skills", []):
        if isinstance(s, dict):
            name = s.get("skill")
            if name:
                if s.get("isKeySkill"):
                    key_skills.append(str(name))
                else:
                    other_skills.append(str(name))
    all_skills = key_skills + other_skills

    # Minimum years of experience
    min_years = raw.get("minimumYearsExperience")

    # Employment type (e.g. "Full Time", "Contract")
    emp_types: list[str] = []
    for et in raw.get("employmentTypes", []):
        if isinstance(et, dict):
            val = et.get("employmentType") or et.get("type")
            if val:
                emp_types.append(str(val))

    # Description snippet – first ~100 words only to stay within the token
    # budget while still capturing the opening summary sentence.
    description: str = raw.get("description") or raw.get("jobDescription") or ""
    snippet = " ".join(description.split()[:100]) if description else ""

    parts: list[str] = []
    if title:
        parts.append(f"Job Title: {title}")
    if levels:
        parts.append(f"Level: {', '.join(levels)}")
    if min_years is not None:
        parts.append(f"Experience Required: {min_years}+ years")
    if emp_types:
        parts.append(f"Employment Type: {', '.join(emp_types)}")
    if all_skills:
        parts.append(f"Required Skills: {', '.join(all_skills)}")
    if snippet:
        parts.append(f"Description: {snippet}")

    return "\n".join(parts)


def extract_job_skills(raw: dict) -> list[str]:
    """Extract a clean list of skill name strings from a raw MCF API job detail dict.

    Key skills are returned first; other skills follow.  Returns an empty list
    if the API response has no skills data.
    """
    key_skills: list[str] = []
    other_skills: list[str] = []
    for s in raw.get("skills", []):
        if isinstance(s, dict):
            name = s.get("skill")
            if name:
                if s.get("isKeySkill"):
                    key_skills.append(str(name))
                else:
                    other_skills.append(str(name))
    return key_skills + other_skills
