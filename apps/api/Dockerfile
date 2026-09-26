# Atlas API (FastAPI) — also used by the pipeline job (same image, different command).
FROM python:3.12-slim AS base
# Native runtimes the Linux wheels expect: OpenMP (LightGBM), expat (rasterio/GDAL)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libexpat1 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY packages/core/pyproject.toml packages/core/
COPY pipelines/pyproject.toml pipelines/
COPY ml/pyproject.toml ml/
COPY apps/api/pyproject.toml apps/api/
RUN mkdir -p packages/core/src/atlas_core pipelines/src/atlas_pipelines ml/src/atlas_ml apps/api/src/atlas_api \
 && uv sync --frozen --no-dev --no-install-workspace
COPY packages packages
COPY pipelines pipelines
COPY ml ml
COPY apps/api apps/api
COPY infra/db infra/db
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
RUN useradd --uid 10001 --create-home atlas && chown -R atlas /app
USER atlas
EXPOSE 8000
CMD ["uvicorn", "atlas_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
