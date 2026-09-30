# Build context: repo root. The default target is the slim API;
# --target pipeline retains the full workspace for the weekly atlas build job.
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
# Build as the runtime user to avoid duplicating the venv in a chown layer.
RUN useradd --uid 10001 --create-home atlas && mkdir /app && chown atlas /app
USER atlas
WORKDIR /app
COPY --chown=atlas pyproject.toml uv.lock ./
COPY --chown=atlas packages/core/pyproject.toml packages/core/
COPY --chown=atlas pipelines/pyproject.toml pipelines/
COPY --chown=atlas ml/pyproject.toml ml/
COPY --chown=atlas apps/api/pyproject.toml apps/api/
ENV PATH="/app/.venv/bin:$PATH"

FROM base AS pipeline
USER root
# Only the pipeline needs OpenMP (LightGBM) and expat (rasterio/GDAL).
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libexpat1 && rm -rf /var/lib/apt/lists/*
USER atlas
RUN --mount=type=cache,target=/home/atlas/.cache/uv,uid=10001 \
    mkdir -p packages/core/src/atlas_core pipelines/src/atlas_pipelines ml/src/atlas_ml apps/api/src/atlas_api \
 && uv sync --frozen --no-dev --no-install-workspace
COPY --chown=atlas packages packages
COPY --chown=atlas pipelines pipelines
COPY --chown=atlas ml ml
COPY --chown=atlas apps/api apps/api
COPY --chown=atlas infra/db infra/db
RUN --mount=type=cache,target=/home/atlas/.cache/uv,uid=10001 uv sync --frozen --no-dev
CMD ["atlas", "build"]

FROM base AS api
RUN --mount=type=cache,target=/home/atlas/.cache/uv,uid=10001 \
    mkdir -p packages/core/src/atlas_core apps/api/src/atlas_api \
 && uv sync --frozen --no-dev --package atlas-api --no-install-workspace
COPY --chown=atlas packages/core packages/core
COPY --chown=atlas apps/api apps/api
RUN --mount=type=cache,target=/home/atlas/.cache/uv,uid=10001 uv sync --frozen --no-dev --package atlas-api
EXPOSE 8000
CMD ["uvicorn", "atlas_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
