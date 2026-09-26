from __future__ import annotations

import json
import os

import typer

app = typer.Typer(help="Atlas Ekonomi Sabah data pipeline", no_args_is_help=True)


def _show(obj) -> None:
    typer.echo(json.dumps(obj, indent=2, default=str))


@app.command()
def ingest(only: list[str] = typer.Option(None, help="Source ids to fetch")) -> None:
    """Fetch sources into bronze (skips unchanged snapshots)."""
    from atlas_pipelines.ingest import ingest_all

    _show(ingest_all(only))


@app.command()
def harmonise() -> None:
    """Bronze -> silver."""
    from atlas_pipelines import harmonise as h

    _show(h.run())


@app.command()
def gold() -> None:
    """Silver -> gold: derived indicators, ranks, percentiles; then validate."""
    from atlas_pipelines import gold as g

    _show(g.run())


@app.command()
def model() -> None:
    """Fit analytics layers (scorecard, shift-share, typology, drivers, forecasts)."""
    from atlas_ml.run import run_all

    _show(run_all())


@app.command()
def load() -> None:
    """Load gold tables into Postgres."""
    from atlas_pipelines.load import run

    _show(run())


@app.command()
def publish() -> None:
    """Write the versioned data release (CSV/parquet + manifest) and web static data."""
    from atlas_pipelines.publish import run

    _show(run())


@app.command("ntl")
def ntl_cmd() -> None:
    """Night lights: download NASA Black Marble VNP46A4 and compute district zonal stats."""
    from atlas_pipelines.ntl import run

    _show(run())


@app.command("corpus")
def corpus_cmd(embed: bool = True) -> None:
    """Fetch, extract, chunk and index the Analyst's document corpus."""
    from atlas_pipelines.corpus import run

    _show(run(embed=embed))


@app.command()
def embed() -> None:
    """Embed corpus chunks that have no vector yet (resumable; needs ATLAS_EMBED_DEPLOYMENT)."""
    from atlas_pipelines.corpus import embed_missing

    _show(embed_missing())


@app.command()
def briefs(
    district: str = typer.Option(None, help="One district slug; default all 27"),
    force: bool = typer.Option(False, help="Regenerate drafts for this release"),
    replace_reviewed: bool = typer.Option(False, help="Also overwrite briefs a person has reviewed"),
) -> None:
    """Generate AI Analyst district briefs (stored as drafts for human review)."""
    from atlas_api.analyst.briefs import generate_all

    _show(generate_all(only=district, force=force, replace_reviewed=replace_reviewed))


@app.command("review")
def review_cmd(
    district: str,
    approve: bool = typer.Option(True, "--approve/--reject"),
    reviewer: str = typer.Option(..., help="Reviewer name, recorded with the brief"),
    note: str = "",
) -> None:
    """Mark a district's latest brief reviewed (or rejected)."""
    from atlas_api.analyst.briefs import review

    _show(review(district, approve=approve, reviewer=reviewer, note=note))


@app.command("eval")
def eval_cmd(limit: int = typer.Option(None, help="Run only the first N questions")) -> None:
    """Run the Analyst evaluation set and write the report."""
    from atlas_api.analyst.evaluate import run

    _show(run(limit=limit))


@app.command()
def build(skip_ingest: bool = False) -> None:
    """Run the whole pipeline end to end."""
    if not skip_ingest:
        ingest(None)
        if os.environ.get("EARTHDATA_TOKEN"):
            ntl_cmd()
    harmonise()
    gold()
    model()
    publish()
    load()
