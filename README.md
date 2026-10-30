# SabahKu

**The economic atlas of Sabah's 27 districts.** (Formerly *Atlas Ekonomi Sabah*.) Official statistics, transparent diagnostics, structural peers across all 160 Malaysian districts, nowcasts and projections with calibrated uncertainty, and a cited AI Analyst, built for planners and researchers who need numbers they can defend.

**Public beta: [sabah-ku.com](https://sabah-ku.com)**

> Every number on screen has a source and a year. Every modelled number has an uncertainty range. Every AI sentence has a citation. If the atlas cannot back a claim, it does not make it.

## What's inside

| Layer | What it does |
|---|---|
| **Pipeline** (`pipelines/`) | Bulk-downloads OpenDOSM datasets into immutable, checksummed bronze snapshots with the publisher's metadata; harmonises names through a strict alias table; flags boundary changes (Membakut, Kalabakan, Telupid); validates with pandera (including a 27-district completeness gate); writes gold tables and a versioned data release. |
| **Analytics** (`ml/`) | Rule-based scorecard vs structural peers · shift-share decomposition · PCA + k-means typology with nearest-neighbour peers and positive deviance · ridge/LightGBM driver analysis with SHAP · GDP nowcasts from state sector data with reconciliation · income projections · split-conformal intervals. Every layer has a model card. |
| **API** (`apps/api/`) | FastAPI, versioned under `/v1`, ETags keyed to the data release, CSV export, OpenAPI docs. |
| **Web** (`apps/web/`) | Next.js. A full-screen map (pan, zoom, play through the years) with a searchable district list, 27 district profiles, compare, forecasts, methodology rendered from live model cards, data downloads, cite-this-view. Night and day themes in a palette taken from Sabah's landscape. |
| **Infra** (`infra/`, `.github/workflows/deploy.yml`) | Docker Compose for local dev (Postgres + PostGIS + pgvector). In production the site is static files on Cloudflare (Workers Free), rebuilt weekly by GitHub Actions from a Neon Postgres database. |

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

Run the checks with `uv run pytest`, `uv run ruff check .`, `pnpm --dir apps/web lint` and `pnpm --dir apps/web typecheck`.

## Data and licences

- Sources: Department of Statistics Malaysia via [OpenDOSM](https://open.dosm.gov.my) (CC BY 4.0); boundaries from [geoBoundaries](https://www.geoboundaries.org) (CC BY 3.0).
- Data releases: CC BY 4.0 where source licences allow. Each release ships a manifest with SHA-256 checksums and a `CITATION.cff`.
- Code: MIT.

## Honest limits

District-level survey data starts in 2019 and arrives every two to three years; district GDP is published only to 2020. The atlas trains on all 160 districts, nowcasts from published state data, shows intervals, and says plainly when evidence is thin. See `/methodology` for backtests, coverage checks and known limitations.

## Deploying

The public site has no server: a GitHub Actions workflow ([deploy.yml](.github/workflows/deploy.yml)) runs `atlas build` against a [Neon](https://neon.tech) database (free tier, Postgres 16 with PostGIS and pgvector), starts the API inside the runner, saves its responses as static JSON (`python -m atlas_api.snapshot`), builds the Next.js site as a static export and deploys it to Cloudflare Workers static assets (free plan). It runs every Monday, on every push to `main`, and by hand from the Actions tab.

One-time setup: `bash infra/setup.sh` walks you through it (about 15 minutes): a Neon project, a Cloudflare deploy token, the NASA Earthdata token, and the GitHub secrets and variables the workflow reads (`ATLAS_DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EARTHDATA_TOKEN`; `SITE_URL`, `GA_ID`, optionally `ANALYST_URL`). If you have a local database with briefs, copy it up with `bash infra/neon/seed.sh` before the first deploy.

The live AI Analyst needs a server, so on the static site it is paused unless `ANALYST_URL` points at a hosted copy of the API's `/v1/ask`. District briefs are pre-generated and still show.

## AI briefs and review

`uv run atlas briefs` drafts one brief per district; drafts are labelled unreviewed on the site until someone approves them with `uv run atlas review`. See [docs/brief-review.md](docs/brief-review.md) for what the validator already guarantees and what a reviewer should check.

## Corrections

Open an issue. Errata are logged in `packages/core/src/atlas_core/reference/errata.yaml` and published on the methodology page.
