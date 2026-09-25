from __future__ import annotations

import json

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


@app.command()
def build(skip_ingest: bool = False) -> None:
    """Run the whole pipeline end to end."""
    if not skip_ingest:
        ingest(None)
    harmonise()
    gold()
    model()
    publish()
    load()
