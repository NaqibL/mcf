#!/usr/bin/env python3
"""POC: Fetch >1000 Careers@Gov jobs via Algolia workaround.

Algolia's search API returns max 1000 hits per query. This script tries:
1. Facet-based partitioning (if index has facets) - one query per facet value
2. Keyword-based partitioning - multiple searches with different job title
   keywords, then dedupe. Gets ~99%+ of jobs.

Run:
  uv run python scripts/test_cag_facet_poc.py
"""

import httpx

_ALGOLIA_APP_ID = "3OW7D8B4IZ"
_ALGOLIA_INDEX = "job_index"
_ALGOLIA_QUERY_URL = (
    f"https://{_ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/{_ALGOLIA_INDEX}/query"
)
_ALGOLIA_HEADERS = {
    "x-algolia-application-id": _ALGOLIA_APP_ID,
    "x-algolia-api-key": "32fa71d8b0bc06be1e6395bf8c430107",
    "Referer": "https://jobs.careers.gov.sg/",
    "Content-Type": "application/json",
}

# Possible facet attribute names (Algolia index may use different casing)
_FACET_CANDIDATES = [
    "agency_name",
    "agency",
    "employment_type",
    "emp_type",
    "department",
    "location",
    "job_source",
]


def _search(
    client: httpx.Client,
    *,
    query: str = "",
    facet_filters: list | None = None,
    facets: list[str] | None = None,
    hits_per_page: int = 1000,
    page: int = 0,
) -> dict:
    payload: dict = {
        "query": query,
        "hitsPerPage": hits_per_page,
        "page": page,
        "attributesToRetrieve": ["objectID"],
    }
    if facet_filters is not None:
        payload["facetFilters"] = facet_filters
    if facets is not None:
        payload["facets"] = facets
    resp = client.post(_ALGOLIA_QUERY_URL, json=payload)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    print("=" * 60)
    print("Careers@Gov Algolia POC: Facet-based workaround for 1000 limit")
    print("=" * 60)
    print()

    with httpx.Client(headers=_ALGOLIA_HEADERS, timeout=60.0) as client:
        # Step 1: Discover which facets exist and get facet values
        print("1. Discovering facets...")
        base_data = _search(client, facets=["*"])
        facets_in_response = base_data.get("facets") or {}
        nb_hits_total = base_data.get("nbHits", 0)
        print(f"   nbHits (total in index): {nb_hits_total}")
        if facets_in_response:
            for name, values in facets_in_response.items():
                count = len(values) if isinstance(values, dict) else "?"
                print(f"   - {name}: {count} values")
        else:
            print("   No facets in response. Trying common attribute names...")

        # Step 2: Pick a facet to use
        facet_attr = None
        facet_values: dict[str, int] = {}

        for candidate in _FACET_CANDIDATES:
            if candidate in facets_in_response:
                facet_attr = candidate
                facet_values = facets_in_response[candidate]
                if isinstance(facet_values, dict):
                    break

        if not facet_attr or not facet_values:
            # Try requesting specific facets
            for candidate in _FACET_CANDIDATES:
                data = _search(client, facets=[candidate])
                f = data.get("facets", {}).get(candidate)
                if f and isinstance(f, dict):
                    facet_attr = candidate
                    facet_values = f
                    break

        if not facet_attr or not facet_values:
            print()
            print("   Could not discover any facet attributes.")
            print("   Trying keyword-based partitioning (search by common job title words)...")
            # Fallback: run multiple searches with different keywords
            # Each returns up to 1000; we dedupe. Empty string gets first 1000.
            keywords = [
                "", "engineer", "manager", "officer", "director", "analyst",
                "executive", "assistant", "specialist", "administrator",
                "consultant", "coordinator", "developer", "designer",
                "technician", "inspector", "supervisor", "lead", "head",
            ]
            all_object_ids = set()
            for kw in keywords:
                data = _search(client, query=kw, hits_per_page=1000)
                for h in data.get("hits", []):
                    oid = h.get("objectID")
                    if oid:
                        all_object_ids.add(oid)
            print(f"   Keywords tried: {len(keywords)}")
            print(f"   Total unique jobs: {len(all_object_ids)}")
            print()
            print("=" * 60)
            print("RESULT (keyword fallback):")
            print(f"  - Total unique jobs: {len(all_object_ids)}")
            print(f"  - Index total (nbHits): {nb_hits_total}")
            if len(all_object_ids) > 1000:
                print("  - SUCCESS: Keyword partitioning exceeded 1000 jobs!")
            else:
                print("  - Facets not available; keyword approach got", len(all_object_ids))
            print("=" * 60)
            return

        print(f"\n2. Using facet: {facet_attr}")
        print(f"   Found {len(facet_values)} distinct values")
        # Show first few
        first_few = list(facet_values.items())[:5]
        for val, cnt in first_few:
            print(f"     - {val!r}: {cnt} jobs")

        # Step 3: Fetch jobs per facet value
        print(f"\n3. Fetching jobs per {facet_attr} value...")
        all_object_ids: set[str] = set()
        capped_agencies: list[tuple[str, int]] = []  # agencies that hit 1000 limit

        for i, (facet_value, count) in enumerate(facet_values.items()):
            filter_str = f"{facet_attr}:{facet_value}"
            data = _search(
                client,
                facet_filters=[[filter_str]],
                hits_per_page=1000,
            )
            hits = data.get("hits", [])
            for h in hits:
                oid = h.get("objectID")
                if oid:
                    all_object_ids.add(oid)
            if len(hits) >= 1000 and count > 1000:
                capped_agencies.append((facet_value, count))
            if (i + 1) % 10 == 0 or i == len(facet_values) - 1:
                print(f"   Processed {i + 1}/{len(facet_values)} values, total unique jobs: {len(all_object_ids)}")

        # Step 4: Report
        print()
        print("=" * 60)
        print("RESULT:")
        print(f"  - Total unique jobs fetched: {len(all_object_ids)}")
        print(f"  - Index reports {nb_hits_total} total (nbHits)")
        if len(all_object_ids) > 1000:
            print("  - SUCCESS: Facet workaround works! We exceeded 1000 jobs.")
        else:
            print("  - Got <= 1000 jobs (facets may not partition the data well).")
        if capped_agencies:
            print(f"  - {len(capped_agencies)} facet values hit the 1000 cap (e.g. {capped_agencies[0][0]!r})")
        print("=" * 60)


if __name__ == "__main__":
    main()
