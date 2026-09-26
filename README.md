# Atlas Ekonomi Sabah

**An evidence atlas of Sabah's 27 district economies.** Official statistics, transparent diagnostics, structural peers across all 160 Malaysian districts, nowcasts and projections with calibrated uncertainty, and a cited AI Analyst, built for planners and researchers who need numbers they can defend.

> Every number on screen has a source and a year. Every modelled number has an uncertainty range. Every AI sentence has a citation. If the atlas cannot back a claim, it does not make it.

## What's inside

| Layer | What it does |
|---|---|
| **Pipeline** (`pipelines/`) | Bulk-downloads OpenDOSM datasets into immutable, checksummed bronze snapshots with the publisher's metadata; harmonises names through a strict alias table; flags boundary changes (Membakut, Kalabakan, Telupid); validates with pandera (including a 27-district completeness gate); writes gold tables and a versioned data release. |
| **Analytics** (`ml/`) | Rule-based scorecard vs structural peers · shift-share decomposition · PCA + k-means typology with nearest-neighbour peers and positive deviance · ridge/LightGBM driver analysis with SHAP · GDP nowcasts from state sector data with reconciliation · income projections · split-conformal intervals. Every layer has a model card. |
| **API** (`apps/api/`) | FastAPI, versioned under `/v1`, ETags keyed to the data release, CSV export, OpenAPI docs. |
| **Web** (`apps/web/`) | Next.js. Explore map, 27 district profiles, compare, forecasts, methodology rendered from live model cards, data downloads, cite-this-view. The *Tenun Data* design system is inspired by the structure of Sabah textiles. |
| **Infra** (`infra/`) | Docker Compose for local dev (Postgres + PostGIS + pgvector); Bicep for Azure Container Apps + PostgreSQL Flexible Server. |

## Quick start

Needs Docker, [uv](https://docs.astral.sh/uv/) and pnpm. On macOS LightGBM also needs OpenMP: `brew install libomp`.
Night lights need a free NASA Earthdata token (`EARTHDATA_TOKEN` in `.env`); without one they are skipped.

```bash
docker compose up -d db          # Postgres 16 + PostGIS + pgvector on :5433
uv sync                          # Python workspace
uv run atlas build               # ingest → harmonise → gold → models → publish → load
uv run uvicorn atlas_api.main:app --port 8000
pnpm --dir apps/web install && pnpm --dir apps/web dev   # http://localhost:3000
```

Run the checks with `uv run pytest`, `uv run ruff check .`, and `pnpm --dir apps/web lint`.

## Data and licences

- Sources: Department of Statistics Malaysia via [OpenDOSM](https://open.dosm.gov.my) (CC BY 4.0); boundaries from [geoBoundaries](https://www.geoboundaries.org) (CC BY 3.0).
- Data releases: CC BY 4.0 where source licences allow. Each release ships a manifest with SHA-256 checksums and a `CITATION.cff`.
- Code: MIT.

## Honest limits

District-level survey data starts in 2019 and arrives every two to three years; district GDP is published only to 2020. The atlas trains on all 160 districts, nowcasts from published state data, shows intervals, and says plainly when evidence is thin. See `/methodology` for backtests, coverage checks and known limitations.

## Corrections

Open an issue. Errata are logged in `packages/core/src/atlas_core/reference/errata.yaml` and published on the methodology page.
