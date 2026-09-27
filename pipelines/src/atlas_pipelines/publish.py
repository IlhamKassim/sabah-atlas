"""Write a versioned, citable data release and the web app's static data.

Release layout (data/releases/<version>/), also copied to the web app for download:
  observations.{csv,parquet}  every value with source_id, period, flags, ranks
  districts.csv + districts.geojson
  indicators.csv, sources.csv, gdp_sector.csv
  typology.csv, scorecard.csv, shift_share.csv, forecasts.csv
  model_cards.json, errata.yaml, CITATION.cff, README.md, manifest.json (sha256 per file)
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import date
from importlib.resources import files
from pathlib import Path

import geopandas as gpd
import pandas as pd

from atlas_core.catalog import indicators
from atlas_core.settings import REPO_ROOT, get_settings
from atlas_pipelines.lake import read_table

RELEASES = REPO_ROOT / "data" / "releases"
REPO_URL = "https://github.com/IlhamKassim/sabah-atlas"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _content_hash(gold: Path) -> str:
    h = hashlib.sha256()
    for name in ["observation.parquet", "analytics.parquet", "gdp_sector.parquet",
                 "source.parquet", "district.parquet"]:
        df = pd.read_parquet(gold / name)
        if name == "source.parquet":  # retrieval timestamps must not change the hash
            df = df.drop(columns=["retrieved_at"])
        h.update(pd.util.hash_pandas_object(df, index=False).values.tobytes())
    return h.hexdigest()


def _flatten_analytics(an: pd.DataFrame) -> dict[str, pd.DataFrame]:
    out: dict[str, list] = {"scorecard": [], "shift_share": [], "forecasts": []}
    for r in an.itertuples():
        p = json.loads(r.payload)
        if r.kind == "scorecard":
            for i in p["items"]:
                out["scorecard"].append({"district_id": r.district_id, **{
                    k: i[k] for k in ["indicator", "period", "value", "peer_median", "gap", "level",
                                      "trend", "trend_per_year", "verdict", "source_id"]},
                    "model_version": r.model_version})
        elif r.kind == "shift_share":
            for w in p["windows"]:
                out["shift_share"].append({"district_id": r.district_id, "t0": w["t0"],
                                           "t1": w["t1"], "benchmark": w["benchmark"],
                                           **w["total"], "model_version": r.model_version})
        elif r.kind == "forecast":
            for code, s in p["indicators"].items():
                for seg, pts in [("nowcast", s["nowcast"])] + [
                        (f"projection:{k}", v) for k, v in s["projection"].items()]:
                    for pt in pts:
                        out["forecasts"].append({"district_id": r.district_id, "indicator": code,
                                                 "segment": seg, **pt, "unit": s["unit"],
                                                 "model_version": r.model_version})
    return {k: pd.DataFrame(v) for k, v in out.items()}


def _geojson(geo: gpd.GeoDataFrame, reg: pd.DataFrame, tolerance: float, path: Path) -> None:
    g = geo.merge(reg[["district_id", "slug", "display_name", "state", "division"]],
                  on="district_id")
    g["geometry"] = g.geometry.simplify(tolerance, preserve_topology=True)
    g = g.rename(columns={"district_id": "id", "display_name": "name"})
    g[["id", "slug", "name", "state", "division", "area_km2", "lon", "lat", "geometry"]].to_file(
        path, driver="GeoJSON", COORDINATE_PRECISION=4)


def _citation(version: str) -> str:
    return f"""cff-version: 1.2.0
message: "If you use this data, please cite it as below."
title: "SabahKu — district economic data release {version}"
type: dataset
authors:
  - family-names: Kassim
    given-names: Ilham
version: "{version}"
date-released: "{date.today():%Y-%m-%d}"
license: CC-BY-4.0
repository-code: "{REPO_URL}"
url: "{REPO_URL}"
abstract: >-
  Harmonised district-level indicators for Sabah's 27 districts with national
  (160-district) context, compiled from DOSM (OpenDOSM) and geoBoundaries, plus
  rule-based diagnostics, typology, driver analysis, nowcasts and projections.
  Source datasets remain under their own licences (DOSM: CC BY 4.0; geoBoundaries: CC BY 3.0).
"""


def _upload(folder: Path, archive: Path, manifest: dict) -> int:
    """In Azure, push the release to Blob Storage (managed identity); a no-op locally."""
    import os

    container = os.environ.get("ATLAS_RELEASES_CONTAINER_URL")
    if not container:
        return 0
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import ContainerClient

    cc = ContainerClient.from_container_url(container, credential=DefaultAzureCredential())
    n = 0
    for f in [*folder.iterdir(), archive]:
        name = f.name if f == archive else f"{manifest['version']}/{f.name}"
        with f.open("rb") as fh:
            cc.upload_blob(name, fh, overwrite=True)
        n += 1
    cc.upload_blob("latest.json", json.dumps(manifest, indent=2).encode(), overwrite=True)
    return n


def run() -> dict:
    s = get_settings()
    gold = s.gold
    content_hash = _content_hash(gold)
    version = f"{date.today():%Y.%m.%d}"
    out = RELEASES / version
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    obs = read_table("gold", "observation")
    reg = read_table("gold", "district")
    geo = gpd.read_parquet(gold / "geometry.parquet")
    an = pd.read_parquet(gold / "analytics.parquet")

    obs.to_parquet(out / "observations.parquet", index=False)
    obs.to_csv(out / "observations.csv", index=False)
    reg.to_csv(out / "districts.csv", index=False)
    _geojson(geo, reg, 0.001, out / "districts.geojson")
    pd.DataFrame([i.model_dump() for i in indicators().values()]).to_csv(
        out / "indicators.csv", index=False)
    read_table("gold", "source").drop(columns=["publisher_meta"]).to_csv(
        out / "sources.csv", index=False)
    read_table("gold", "gdp_sector").to_csv(out / "gdp_sector.csv", index=False)
    typ = pd.read_parquet(gold / "typology_national.parquet").merge(
        pd.read_parquet(gold / "typology_features.parquet"), on="district_id")
    typ.to_csv(out / "typology.csv", index=False)
    for name, df in _flatten_analytics(an).items():
        df.to_csv(out / f"{name}.csv", index=False)
    shutil.copy(gold / "model_cards.json", out / "model_cards.json")
    shutil.copy(files("atlas_core") / "reference" / "errata.yaml", out / "errata.yaml")
    (out / "CITATION.cff").write_text(_citation(version))
    (out / "README.md").write_text(
        f"# SabahKu data release {version}\n\n"
        f"Content hash: `{content_hash}`\n\n"
        "Every row in `observations.csv` carries `source_id` (see `sources.csv`) and `period`. "
        "`is_modelled` marks derived or modelled values; `quality_flag` marks boundary breaks, "
        "suppressed values and growth windows. Forecasts are in `forecasts.csv` with p10/p50/p90 "
        "(80% interval).\n\nLicence: CC BY 4.0 for the compilation; source datasets keep their "
        f"own licences. Code: MIT, {REPO_URL}.\n")

    manifest_files = []
    for f in sorted(out.iterdir()):
        entry = {"file": f.name, "bytes": f.stat().st_size, "sha256": _sha(f)}
        if f.suffix == ".csv":
            entry["rows"] = sum(1 for _ in f.open()) - 1
        manifest_files.append(entry)
    manifest = {"version": version, "content_hash": content_hash, "created": date.today().isoformat(),
                "licence": "CC BY 4.0", "repository": REPO_URL,
                "model_versions": sorted(an.model_version.unique().tolist()),
                "files": manifest_files}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (gold / "release.json").write_text(json.dumps(manifest, indent=2))
    shutil.make_archive(str(RELEASES / f"atlas-ekonomi-sabah-{version}"), "zip", out)

    # Web static data: map geometry + a copy of the release for direct download.
    web = s.web_public_dir
    (web / "geo").mkdir(parents=True, exist_ok=True)
    sab = reg[(reg.state == "Sabah") & (reg.kind == "district")]
    _geojson(geo[geo.district_id.isin(sab.district_id)], reg, 0.0015, web / "geo" / "sabah.geojson")
    _geojson(geo, reg, 0.006, web / "geo" / "malaysia.geojson")
    rel_web = web / "releases" / version
    if rel_web.exists():
        shutil.rmtree(rel_web)
    shutil.copytree(out, rel_web)
    shutil.copy(RELEASES / f"atlas-ekonomi-sabah-{version}.zip", rel_web.parent)
    (web / "releases" / "latest.json").write_text(json.dumps(manifest, indent=2))
    uploaded = _upload(out, RELEASES / f"atlas-ekonomi-sabah-{version}.zip", manifest)
    return {"uploaded": uploaded, "version": version, "content_hash": content_hash[:16],
            "files": len(manifest_files)}
