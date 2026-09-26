"""Atlas Ekonomi Sabah read API (v1).

Every read endpoint is a pure function of the loaded data release, so responses
carry a strong ETag derived from the release hash and can be cached aggressively.
"""

from __future__ import annotations

import csv
import io
import os
from typing import Annotated, Literal

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse, StreamingResponse

from atlas_api import queries as q
from atlas_api.analyst_routes import router as analyst_router

app = FastAPI(
    title="Atlas Ekonomi Sabah API",
    version="1.0",
    description=(
        "Open API for district-level economic indicators, diagnostics and projections for "
        "Sabah's 27 districts, with national (160-district) context. Every value carries "
        "its `source_id` and `period`; modelled values are marked `is_modelled`. "
        "Data: CC BY 4.0 where source licences allow. Code: MIT."
    ),
    default_response_class=ORJSONResponse,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ATLAS_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["ETag"],
)

v1 = APIRouter(prefix="/v1")
Scope = Literal["sabah", "national", "all"]


@app.middleware("http")
async def release_etag(request: Request, call_next):
    if request.method != "GET" or not request.url.path.startswith("/v1"):
        return await call_next(request)
    rel = _release_hash()
    etag = f'"{rel}:{hash(str(request.url)) & 0xFFFFFFFF:x}"' if rel else None
    if etag and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response = await call_next(request)
    if etag and response.status_code == 200:
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
    return response


_release_cache: dict[str, str | None] = {}


def _release_hash() -> str | None:
    if "hash" not in _release_cache:
        r = q.release()
        _release_cache["hash"] = r["content_hash"][:16] if r else None
    return _release_cache["hash"]


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"ok": True}


@v1.get("/meta", summary="Release, indicator catalogue and sources")
def meta() -> dict:
    from atlas_core.catalog import errata

    return {"release": q.release(), "indicators": q.indicators(), "sources": q.sources(),
            "errata": errata()}


@v1.get("/districts", summary="All districts with headline indicators")
def districts(scope: Scope = "sabah") -> list[dict]:
    return q.districts(scope)


@v1.get("/districts/{key}", summary="Full district profile")
def district(key: str) -> dict:
    p = q.profile(key)
    if not p:
        raise HTTPException(404, f"unknown district {key!r}")
    return p


@v1.get("/indicators/{code}", summary="One indicator for all districts (powers the choropleth)")
def indicator(code: str, period: int | None = None, scope: Scope = "sabah") -> dict:
    r = q.indicator_values(code, period, scope)
    if not r:
        raise HTTPException(404, f"unknown indicator {code!r}")
    return r


@v1.get("/compare", summary="Aligned indicator series for up to 4 districts")
def compare(ids: Annotated[str, Query(description="Comma-separated ids or slugs")]) -> dict:
    keys = [k for k in ids.split(",") if k][:4]
    if not keys:
        raise HTTPException(400, "ids required")
    return q.compare(keys)


@v1.get("/forecast/{key}", summary="Fan-chart series with model version and backtest error")
def forecast(key: str, indicator: str = "income_median", scenario: str = "baseline") -> dict:
    d = q.resolve_district(key)
    if not d:
        raise HTTPException(404, f"unknown district {key!r}")
    fc = q.analytics(d["id"]).get("forecast", {})
    series = fc.get("indicators", {}).get(indicator)
    if not series:
        raise HTTPException(404, f"no forecast for {indicator!r}")
    return {"district": d, "indicator": indicator, "scenario": scenario,
            "model_version": fc.get("model_version"), **series}


@v1.get("/analytics/{kind}", summary="One analytics layer for every Sabah district")
def analytics_all(kind: Literal["forecast", "scorecard", "typology", "shift_share", "drivers"]) -> list[dict]:
    return q.all_analytics(kind)


@v1.get("/model-cards", summary="Model cards for every analytics layer")
def model_cards() -> list[dict]:
    return q.model_cards()


@v1.get("/export/{key}.csv", summary="Tidy CSV of every observation for a district")
def export_csv(key: str) -> StreamingResponse:
    d = q.resolve_district(key)
    if not d:
        raise HTTPException(404, f"unknown district {key!r}")
    rows = q.series([d["id"]])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["district_id", "district", "indicator", "period", "value", "is_modelled",
                "quality_flag", "source_id"])
    for r in rows:
        w.writerow([d["id"], d["name"], r["indicator_code"], r["period"], r["value"],
                    r["is_modelled"], r["quality_flag"] or "", r["source_id"]])
    rel = q.release()
    buf.write(f"# Atlas Ekonomi Sabah data release {rel['version'] if rel else 'dev'}; "
              "CC BY 4.0; cite sources listed at /v1/meta\n")
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{d["slug"]}.csv"'})


@v1.get("/data/releases", summary="Versioned bulk downloads with checksums")
def releases() -> dict:
    r = q.release()
    if not r:
        raise HTTPException(404, "no release loaded")
    return r


app.include_router(v1)
app.include_router(analyst_router)
