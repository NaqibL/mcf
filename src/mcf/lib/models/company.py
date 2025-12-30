"""
Company models following the MCF API JSON structure.
"""

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow")


# ==============================================================================
# Company Models
# ==============================================================================


class CompanyLink(_Base):
    href: str


class CompanyLinks(_Base):
    self: CompanyLink | None = None
    jobs: CompanyLink | None = None
    addresses: CompanyLink | None = None
    schemes: CompanyLink | None = None


class Company(_Base):
    """Company from the companies endpoint."""

    uen: str
    name: str | None = None
    description: str | None = None
    ssicCode: str | None = None
    ssicCode2020: str | None = None
    employeeCount: int | None = None
    companyUrl: str | None = None
    lastSyncDate: str | None = None
    logoFileName: str | None = None
    logoUploadPath: str | None = None
    _links: CompanyLinks | None = None


# ==============================================================================
# Company Search Response Models
# ==============================================================================


class CompanySearchLink(_Base):
    href: str


class CompanySearchLinks(_Base):
    next: CompanySearchLink | None = None
    self: CompanySearchLink | None = None
    first: CompanySearchLink | None = None
    last: CompanySearchLink | None = None


class CompanySearchResponse(_Base):
    results: list[Company] = []
    total: int
    _links: CompanySearchLinks | None = None

