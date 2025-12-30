"""MCF CLI - Command line interface for MyCareersFuture job crawler."""

from datetime import date
from pathlib import Path
from typing import Annotated, Optional

import polars as pl
import typer
from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)

from mcf.lib.crawler.crawler import CrawlProgress, Crawler

app = typer.Typer(
    name="mcf",
    help="MyCareersFuture job crawler CLI",
    rich_markup_mode="rich",
    invoke_without_command=True,
)


@app.callback()
def callback(ctx: typer.Context) -> None:
    """MyCareersFuture job crawler CLI."""
    if ctx.invoked_subcommand is None:
        raise typer.Exit(ctx.get_help())
console = Console()


@app.command("crawl")
def crawl(
    output: Annotated[
        Path,
        typer.Option(
            "--output",
            "-o",
            help="Output directory for parquet files",
        ),
    ] = Path("data/jobs"),
    rate_limit: Annotated[
        float,
        typer.Option(
            "--rate-limit",
            "-r",
            help="API requests per second",
        ),
    ] = 4.0,
    limit: Annotated[
        Optional[int],
        typer.Option(
            "--limit",
            "-l",
            help="Maximum number of jobs to fetch (for testing)",
        ),
    ] = None,
) -> None:
    """Crawl all jobs from MyCareersFuture and save to parquet."""
    today = date.today()
    output_dir = output.resolve()

    console.print(f"[bold cyan]MCF Crawler[/bold cyan]")
    console.print(f"  Output: [green]{output_dir}[/green]")
    console.print(f"  Rate limit: [yellow]{rate_limit}[/yellow] req/s")
    if limit:
        console.print(f"  Limit: [yellow]{limit}[/yellow] jobs")
    console.print()

    crawler = Crawler(rate_limit=rate_limit)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TextColumn("•"),
        TimeElapsedColumn(),
        TextColumn("•"),
        TimeRemainingColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("[cyan]Crawling...", total=None)

        def on_progress(p: CrawlProgress) -> None:
            progress.update(task, total=p.total_jobs, completed=p.fetched)
            if p.current_category:
                progress.update(
                    task,
                    description=f"[cyan]{p.current_category}[/cyan] ({p.category_index}/{p.total_categories})",
                )

        if limit:
            # Use simple crawl for testing with limit
            result = crawler.crawl(on_progress=on_progress, limit=limit)
        else:
            result = crawler.crawl_all_categories(on_progress=on_progress)

    # Convert to polars DataFrame
    df = pl.from_pandas(result.jobs)

    # Add crawl_date and delete_date columns
    df = df.with_columns(
        pl.lit(today).alias("crawl_date"),
        pl.lit(None).cast(pl.Date).alias("delete_date"),
    )

    # Use native partition_by for hive-style partitioning
    # This writes to output_dir and creates crawl_date=YYYY-MM-DD/ subdirectories automatically
    df.write_parquet(
        str(output_dir),
        partition_by=["crawl_date"],
        compression="zstd",
        compression_level=10,
    )

    # Print summary
    console.print()
    if result.interrupted:
        console.print("[yellow]⚠ Crawl was interrupted[/yellow]")

    console.print(f"[bold green]✓ Crawl complete[/bold green]")
    console.print(f"  Jobs fetched: [cyan]{result.fetched_count:,}[/cyan]")
    console.print(f"  Duration: [cyan]{result.duration_display}[/cyan]")
    console.print(f"  Output: [green]{output_dir}[/green]")


def main() -> None:
    """Main entry point."""
    app()


if __name__ == "__main__":
    main()
