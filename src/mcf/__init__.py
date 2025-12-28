"""MyCareersFuture API client and CLI.

A Python library and CLI for searching jobs on MyCareersFuture Singapore.

Example:
    >>> from mcf import MCFClient
    >>> client = MCFClient()
    >>> results = client.search_jobs("python developer")
    >>> for job in results.results:
    ...     print(f"{job.title} - {job.salary.display}")
"""

from mcf.lib.api.client import MCFClient, MCFAPIError, MCFClientError, JobPosition
from mcf.lib.models.models import (
    JobPosting,
    JobSearchResponse,
    CommonMetadata,
)

__version__ = "0.1.0"
__all__ = [
    "MCFClient",
    "MCFAPIError",
    "MCFClientError",
    "JobPosition",
    "JobPosting",
    "JobSearchResponse",
    "CommonMetadata",
]
