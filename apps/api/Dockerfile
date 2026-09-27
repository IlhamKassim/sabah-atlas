# Atlas API (FastAPI) — also used by the pipeline job (same image, different command).
FROM python:3.12-slim AS base
# Native runtimes the Linux wheels expect: OpenMP (LightGBM), expat (rasterio/GDAL)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libexpat1 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
# Build as the runtime user so files are owned correctly from the start: a trailing
# `chown -R /app` would store a second full copy of the venv in its own layer.
RUN useradd --uid 10001 --create-home atlas && mkdir /app && chown atlas /app
USER atlas
WORKDIR /app
COPY --chown=atlas pyproject.toml uv.lock ./
COPY --chown=atlas packages/core/pyproject.toml packages/core/
COPY --chown=atlas pipelines/pyproject.toml pipelines/
COPY --chown=atlas ml/pyproject.toml ml/
COPY --chown=atlas apps/api/pyproject.toml apps/api/
# uv's download cache lives in a BuildKit cache mount, so it speeds up rebuilds without landing in the image.
RUN --mount=type=cache,target=/home/atlas/.cache/uv,uid=10001 \
    mkdir -p packages/core/src/atlas_core pipelines/src/atlas_pipelines ml/src/atlas_ml apps/api/src/atlas_api \
 && uv sync --frozen --no-dev --no-install-workspace
COPY --chown=atlas packages packages
COPY --chown=atlas pipelines pipelines
COPY --chown=atlas ml ml
COPY --chown=atlas apps/api apps/api
COPY --chown=atlas infra/db infra/db
RUN --mount=type=cache,target=/home/atlas/.cache/uv,uid=10001 uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "atlas_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
