# SabahKu cold-start changes

Verified on 1 October 2026, Asia/Kuching, on branch `claude/website-slow-load-ac036c`.

The API now uses the default `api` target of `apps/api/Dockerfile`. Both dependency-install steps select `--package atlas-api`, so the image includes `atlas-api`, `atlas-core` and their dependencies. The source copy excludes `ml/` and `pipelines/`. The separate `pipeline` target retains the full locked workspace, `infra/db`, OpenMP and expat, with `atlas build` as its default command.

A search of all `apps/api/src` imports, including function-local imports and dynamic-import references, found no use of `atlas_ml` or `atlas_pipelines`. The API's shared runtime imports are `atlas_core.settings` and `atlas_core.catalog`. No package code needed moving or lazy-import changes. The slim image imports `atlas_api.main` cleanly; `atlas_ml`, `atlas_pipelines`, `lightgbm`, `shap` and `rasterio` are absent. The pipeline image imports those packages successfully, and `atlas --help` exposes the build command.

Bicep now has a `pipelineImage` parameter with the same quickstart default as `apiImage`. Only the pipeline job uses it. `deploy.sh` builds and pushes both explicit Docker targets and passes all three image parameters on initial and subsequent deployments. Compose selects the API target and the `atlas-api:beta` tag. The existing web cache-directory ownership fix is preserved.

The web has server-component loading boundaries for the homepage, overview, compare, forecasts, methodology, data downloads, analyst, district profiles and district briefs. They reuse the shared header, Bricolage typography, theme tokens, bead-dot loading indicator and static skeletons. The map is a small inline SVG simplified from the existing district GeoJSON. Loading components make no API calls and add no client components or map runtime.

Scaling, instance sizes, page fetching, `force-dynamic` and cache policy are unchanged. No deployment script or Azure operation was run. No push or PR was created.

## Image sizes

All images were built and loaded locally with `docker buildx build --platform linux/amd64 --load`. Sizes below are Docker's reported `.Size` in decimal MB, compared using the same local engine and base images. The before images use Dockerfile snapshots from the starting commit `93dde08`. Before the split, the pipeline used the full API image.

| Image | Before, bytes | After, bytes | Before, MB | After, MB |
| --- | ---: | ---: | ---: | ---: |
| API | 458132291 | 191267514 | 458.13 | 191.27 |
| Pipeline | 458132291, shared API image | 458123858 | 458.13 | 458.12 |
| Web | 74755973 | 74776310 | 74.76 | 74.78 |

The API shrank by 266.86 MB, or 58.25%. This is a local image measurement, not a measured Azure cold-start latency improvement.

Both web builds used these arguments, as requested:

```sh
--build-arg ATLAS_API_URL=http://localhost:8000
--build-arg NEXT_PUBLIC_SITE_URL=https://sabah-ku.com
--build-arg ATLAS_RELEASES_BASE_URL=http://localhost/releases
```

## Required checks

| Check | Result |
| --- | --- |
| `uv run pytest` | Pass. First run: 24 passed, 23 skipped because the worktree had no local fixtures/database access. After starting the database: 32 passed, 15 fixture skips. Final run with `ATLAS_LAKE_DIR=/Users/hamboii/code/sabah-atlas/data/lake`: all 47 passed, no skips. Existing gold/model files were read without modification. Six existing FastAPI ORJSONResponse deprecation warnings. |
| `uv run ruff check .` | Pass. |
| `pnpm --dir apps/web lint` | Pass on final source. |
| `pnpm --dir apps/web typecheck` | Pass on final source. |
| `pnpm --dir apps/web build` | Pass on final source. |
| API image build, `linux/amd64` | Pass, `atlas-api:beta`, target `api`. |
| Pipeline image build, `linux/amd64` | Pass, `atlas-pipeline:beta`, target `pipeline`. |
| Web image build, `linux/amd64` | Pass, `atlas-web:beta`, with the URL arguments above. An intermediate rebuild failed in the existing Next Google-font import mapping; the final rebuild succeeded. |
| Slim-image import | Pass: `python -c 'import atlas_api.main'`, running as the image's `atlas` user. |
| Web cache write | Pass: UID 10001, username `atlas`, created and removed `/app/.next/cache/write-check` in the final image. |
| Local database | Started with `docker compose up -d db`; existing populated local database used. |
| Slim API endpoint checks | All five returned HTTP 200; details below. |
| Delayed-API loading screens | Pass on all nine page routes, with shared header visible before data. |
| Screenshots | Captured and visually checked for night/day themes, mobile layout and compare. |

Additional checks passed: `bash -n infra/azure/deploy.sh`, `docker compose config --quiet`, `git diff --check`, pipeline CLI and heavy dependency imports.

The slim API container ran on the Compose network with `ATLAS_DATABASE_URL=postgresql+psycopg://atlas:atlas@db:5432/atlas`. Requests were made to its actual HTTP server, with no mocked database or responses.

| Endpoint | HTTP status |
| --- | ---: |
| `/healthz` | 200 |
| `/v1/meta` | 200 |
| `/v1/districts?scope=sabah` | 200 |
| `/v1/compare?ids=tawau,ranau` | 200 |
| `/v1/lights` | 200 |

## Browser evidence

A fresh headless Chrome profile visited the final production web build on localhost. A loopback-only reverse proxy delayed each real API GET by 15 seconds before forwarding it to the slim API container. A unique API URL prefix prevented earlier verification cache entries from masking the delay. No application fetch/cache code was changed.

All nine route-specific loading states appeared in 46–204 ms, with the site header and navigation visible. The homepage loading state then disappeared and the real map and district list appeared after 30.57 seconds, reflecting the existing sequential data requests. Detailed timings are in `loading-checks.json`.

The 390-pixel mobile viewport had no horizontal overflow, and was checked with reduced motion enabled. The light theme was selected through the application's saved-theme setting. These local timings establish that the fallback streams before the data; they do not predict Azure network or container startup times.

Evidence files:

- `home-loading-night.png`
- `home-loading-day.png`
- `home-loading-mobile.png`
- `compare-loading-night.png`
- `loading-checks.json`

Temporary verification servers and test containers were stopped after the checks. The local database and built images were retained.
