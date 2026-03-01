"""Base job source interface and normalized job model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence


@dataclass(frozen=True)
class NormalizedJob:
    """Normalized job representation for storage and embedding.

    All job sources map their API responses to this structure so the rest
    of the pipeline (embedding, matching, storage) is source-agnostic.
    """

    source_id: str
    external_id: str
    title: str | None
    company_name: str | None
    location: str | None
    job_url: str | None
    skills: list[str]
    description_snippet: str | None

    @property
    def job_uuid(self) -> str:
        """Unique job identifier (source:external_id for cross-source uniqueness)."""
        return f"{self.source_id}:{self.external_id}" if self.source_id != "mcf" else self.external_id


class JobSource(Protocol):
    """Protocol for job data sources.

    Implement this to add a new job source (e.g. LinkedIn, Indeed).
    """

    @property
    def source_id(self) -> str:
        """Unique identifier for this source (e.g. 'mcf', 'linkedin')."""
        ...

    def list_job_ids(
        self,
        *,
        categories: Sequence[str] | None = None,
        limit: int | None = None,
        on_progress=None,
    ) -> list[str]:
        """List job IDs (external IDs) from this source."""
        ...

    def get_job_detail(self, external_id: str) -> NormalizedJob:
        """Fetch job detail and return as NormalizedJob."""
        ...
