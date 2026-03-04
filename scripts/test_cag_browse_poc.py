#!/usr/bin/env python3
"""POC: Test if Algolia Browse API works for Careers@Gov to fetch >1000 jobs.

Run: uv run python scripts/test_cag_browse_poc.py

1. First runs the standard query API to show nbHits (total index size)
2. Then tries the Browse API — requires 'browse' ACL on the API key
"""

import httpx

_ALGOLIA_APP_ID = "3OW7D8B4IZ"
_ALGOLIA_INDEX = "job_index"
_ALGOLIA_QUERY_URL = (
    f"https://{_ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/{_ALGOLIA_INDEX}/query"
)
_ALGOLIA_BROWSE_URL = (
    f"https://{_ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/{_ALGOLIA_INDEX}/browse"
)
_ALGOLIA_HEADERS = {
    "x-algolia-application-id": _ALGOLIA_APP_ID,
    "x-algolia-api-key": "32fa71d8b0bc06be1e6395bf8c430107",
    "Referer": "https://jobs.careers.gov.sg/",
    "Content-Type": "application/json",
}


def main() -> None:
    print("=" * 60)
    print("Careers@Gov Algolia POC: Can we fetch >1000 jobs?")
    print("=" * 60)
    print()

    # Step 1: Query API — what does it report as total?
    print("1. Query API (current method) — first page:")
    with httpx.Client(headers=_ALGOLIA_HEADERS, timeout=60.0) as client:
        query_resp = client.post(
            _ALGOLIA_QUERY_URL,
            json={
                "query": "",
                "hitsPerPage": 1000,
                "page": 0,
                "attributesToRetrieve": ["objectID"],
            },
        )
        query_resp.raise_for_status()
        query_data = query_resp.json()

    nb_hits = query_data.get("nbHits", 0)
    nb_pages = query_data.get("nbPages", 1)
    hits_count = len(query_data.get("hits", []))
    print(f"   nbHits (total in index): {nb_hits}")
    print(f"   nbPages: {nb_pages}")
    print(f"   hits returned: {hits_count}")
    print()

    # Step 2: Browse API
    print("2. Browse API (cursor-based, no 1000 limit):")
    browse_ok = False
    total = 0
    try:
        job_ids: list[str] = []
        cursor: str | None = None
        page_num = 0

        with httpx.Client(headers=_ALGOLIA_HEADERS, timeout=60.0) as client:
            while True:
                payload: dict = {
                    "query": "",
                    "hitsPerPage": 1000,
                    "attributesToRetrieve": ["objectID"],
                }
                if cursor:
                    payload["cursor"] = cursor

                response = client.post(_ALGOLIA_BROWSE_URL, json=payload)
                response.raise_for_status()
                data = response.json()

                hits = data.get("hits", [])
                for hit in hits:
                    oid = hit.get("objectID")
                    if oid:
                        job_ids.append(oid)

                page_num += 1
                print(f"   Page {page_num}: {len(hits)} hits (total: {len(job_ids)})")

                cursor = data.get("cursor")
                if not cursor:
                    break

        total = len(job_ids)
        browse_ok = total > 1000
        print()
        print(f"   RESULT: Fetched {total} jobs via Browse API")
        if browse_ok:
            print("   SUCCESS: Browse API works! Can scrape full index.")
        else:
            print("   (Index may have <=1000 jobs total)")

    except httpx.HTTPStatusError as e:
        print(f"   FAILED: {e.response.status_code} {e.response.reason_phrase}")
        print("   The public API key does not have 'browse' ACL.")
        print("   We cannot fetch more than 1000 jobs with the current key.")
    print()
    print("=" * 60)
    print("SUMMARY:")
    print(f"  - Index reports {nb_hits} total jobs (nbHits)")
    print(f"  - Query API returns max 1000 (Algolia pagination limit)")
    if browse_ok:
        print(f"  - Browse API: WORKS — fetched {total} jobs")
    else:
        print("  - Browse API: 403 — key lacks browse permission")
    print("=" * 60)


if __name__ == "__main__":
    main()
