"""Incremental crawl pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Sequence

from mcf.lib.embeddings.base import EmbedderProtocol
from mcf.lib.embeddings.embedder import Embedder, EmbedderConfig
from mcf.lib.embeddings.job_text import build_job_text_from_normalized
from mcf.lib.sources.base import NormalizedJob
from mcf.lib.sources.mcf_source import MCFJobSource
from mcf.lib.storage.base import RunStats, Storage

if TYPE_CHECKING:
    from mcf.lib.sources.base import JobSource


@dataclass(frozen=True)
class IncrementalCrawlResult:
    run: RunStats
    total_seen: int
    added: list[str]
    maintained: list[str]
    removed: list[str]


def run_incremental_crawl(
    *,
    store: Storage,
    source: JobSource | None = None,
    embedder: EmbedderProtocol | None = None,
    rate_limit: float = 4.0,
    categories: Sequence[str] | None = None,
    limit: int | None = None,
    on_progress=None,
) -> IncrementalCrawlResult:
    """Run an incremental crawl.

    - Lists job IDs from the source (cheap)
    - Diffs against DB to compute added/maintained/removed
    - Fetches job detail only for newly added jobs
    """
    job_source = source or MCFJobSource(rate_limit=rate_limit)

    try:
        run = store.begin_run(kind="incremental", categories=list(categories) if categories else None)

        seen = job_source.list_job_ids(
            categories=list(categories) if categories else None,
            limit=limit,
            on_progress=on_progress,
        )
        seen_set = set(seen)
        existing = store.existing_job_uuids()
        active = store.active_job_uuids()

        added = sorted(seen_set - existing)
        maintained = sorted(seen_set & existing)
        # Only a *full crawl* can reliably infer removals. For multi-source, only
        # remove jobs from this source that are no longer listed.
        is_full_universe = (categories is None) and (limit is None)
        if is_full_universe and hasattr(store, "active_job_uuids_for_source"):
            active_for_source = store.active_job_uuids_for_source(job_source.source_id)
            removed = sorted(active_for_source - seen_set)
        else:
            removed = sorted(active - seen_set) if is_full_universe else []

        store.record_statuses(run.run_id, added=added, maintained=maintained, removed=removed)
        store.touch_jobs(run_id=run.run_id, job_uuids=maintained)
        if removed:
            store.deactivate_jobs(run_id=run.run_id, job_uuids=removed)

        if added:
            _embedder: EmbedderProtocol = embedder if embedder is not None else Embedder(EmbedderConfig())

            for external_id in added:
                normalized = job_source.get_job_detail(external_id)
                job_uuid = normalized.job_uuid

                job_text = build_job_text_from_normalized(normalized)

                embedding = None
                if job_text:
                    try:
                        embedding = _embedder.embed_text(job_text)
                    except Exception as e:
                        print(f"Warning: Failed to generate embedding for job {job_uuid}: {e}")

                store.upsert_new_job_detail(
                    run_id=run.run_id,
                    job_uuid=job_uuid,
                    title=normalized.title,
                    company_name=normalized.company_name,
                    location=normalized.location,
                    job_url=normalized.job_url,
                    job_source=normalized.source_id,
                    skills=normalized.skills or None,
                    raw_json=None,
                )

                if embedding:
                    store.upsert_embedding(
                        job_uuid=job_uuid,
                        model_name=_embedder.model_name,
                        embedding=embedding,
                    )

        store.finish_run(
            run.run_id,
            total_seen=len(seen_set),
            added=len(added),
            maintained=len(maintained),
            removed=len(removed),
        )

        final_run = RunStats(
            run_id=run.run_id,
            started_at=run.started_at,
            finished_at=None,
            total_seen=len(seen_set),
            added=len(added),
            maintained=len(maintained),
            removed=len(removed),
        )
        return IncrementalCrawlResult(
            run=final_run,
            total_seen=len(seen_set),
            added=added,
            maintained=maintained,
            removed=removed,
        )
    finally:
        pass  # Store cleanup handled by caller

