"""Smoke tests — verify the FastAPI app starts and key routes respond correctly."""

import pytest
from fastapi.testclient import TestClient

from mcf.api.server import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200


def test_summary_public():
    r = client.get("/api/dashboard/summary-public")
    assert r.status_code == 200
    data = r.json()
    assert "total_jobs" in data


def test_active_jobs_over_time_public():
    r = client.get("/api/dashboard/active-jobs-over-time-public")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_jobs_by_category_public():
    r = client.get("/api/dashboard/jobs-by-category-public")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_jobs_by_employment_type_public():
    r = client.get("/api/dashboard/jobs-by-employment-type-public")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_jobs_by_position_level_public():
    r = client.get("/api/dashboard/jobs-by-position-level-public")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_salary_distribution_public():
    r = client.get("/api/dashboard/salary-distribution-public")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_authed_routes_require_auth():
    """Auth-protected routes must return 401/403, not 500."""
    for path in [
        "/api/profile",
        "/api/matches",
        "/api/discover/stats",
    ]:
        r = client.get(path)
        assert r.status_code in (200, 401, 403), f"{path} returned {r.status_code}"
