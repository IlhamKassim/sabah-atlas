"""Night-time lights: NASA Black Marble VNP46A4 (annual, 15 arc-second ≈ 500 m).

Granules are discovered through NASA CMR (no auth) and downloaded from LAADS with an
Earthdata bearer token (EARTHDATA_TOKEN). Malaysia is covered by tiles h27v08,
h28v08 and h29v08 (Sabah lies entirely in h29v08).

Per district and year:
  radiance_sum     sum of snow-free all-angle radiance (nW·cm⁻²·sr⁻¹) over valid land pixels
  lit_area_km2     area of valid land pixels with radiance > LIT_THRESHOLD
  valid_share      share of the district's land pixels with good-quality retrievals
Masks: water/sea pixels (Land_Water_Mask) are dropped, so offshore platforms and
fishing fleets do not count; pixel radiance is capped at FLARE_CAP to limit the pull of
gas flares and industrial point sources; poor-quality retrievals are excluded.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import geopandas as gpd
import h5py
import httpx
import numpy as np
import pandas as pd
from rasterio import features
from rasterio.transform import from_origin

from atlas_core.settings import get_settings
from atlas_pipelines.lake import bronze_dir, write_table

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
TILES = ("h27v08", "h28v08", "h29v08")
GRID = "HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields"
RAD = "AllAngle_Composite_Snow_Free"
QUAL = "AllAngle_Composite_Snow_Free_Quality"
LAND = "Land_Water_Mask"
PIX_DEG = 10 / 2400
FLARE_CAP = 500.0  # nW·cm⁻²·sr⁻¹; brightest urban cores in Malaysia sit well below this
LIT_THRESHOLD = 0.5


class NoToken(RuntimeError):
    pass


def granules(first_year: int = 2012) -> list[dict]:
    r = httpx.get(
        CMR,
        params={
            "short_name": "VNP46A4",
            "bounding_box": "99.5,0.8,119.5,7.5",
            "page_size": 200,
            "sort_key": "start_date",
            "temporal": f"{first_year}-01-01T00:00:00Z,",
        },
        timeout=60,
    )
    r.raise_for_status()
    out = []
    for e in r.json()["feed"]["entry"]:
        url = next(
            (
                lk["href"]
                for lk in e.get("links", [])
                if lk["href"].endswith(".h5") and lk["href"].startswith("https")
            ),
            None,
        )
        tile = next((t for t in TILES if url and t in url.rsplit("/", 1)[1]), None)
        if url and tile:
            out.append(
                {"year": int(e["time_start"][:4]), "tile": tile, "url": url, "name": url.rsplit("/", 1)[1]}
            )
    return out


def download(gs: list[dict]) -> list[Path]:
    token = os.environ.get("EARTHDATA_TOKEN")
    if not token:
        raise NoToken("Set EARTHDATA_TOKEN in .env (https://urs.earthdata.nasa.gov → Generate Token).")
    out_dir = bronze_dir("ntl_vnp46a4")
    paths = []
    with httpx.Client(headers={"Authorization": f"Bearer {token}"}, follow_redirects=True, timeout=600) as c:
        for g in gs:
            p = out_dir / g["name"]
            if not p.exists():
                with c.stream("GET", g["url"]) as r:
                    r.raise_for_status()
                    tmp = p.with_suffix(".part")
                    with tmp.open("wb") as f:
                        for chunk in r.iter_bytes(1 << 20):
                            f.write(chunk)
                    tmp.rename(p)
                print(f"  downloaded {g['name']}")
            paths.append(p)
    (out_dir / "manifest.json").write_text(json.dumps(gs, indent=2))
    return paths


def _tile_transform(tile: str):
    h, v = int(tile[1:3]), int(tile[4:6])
    return from_origin(h * 10 - 180, 90 - v * 10, PIX_DEG, PIX_DEG)


def _read(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    with h5py.File(path, "r") as f:
        g = f[GRID]
        rad = g[RAD][:].astype("float64")
        fill = g[RAD].attrs.get("_FillValue", 65535)
        scale = float(np.ravel(g[RAD].attrs.get("scale_factor", 0.1))[0])
        offset = float(np.ravel(g[RAD].attrs.get("add_offset", 0.0))[0])
        fill = float(np.ravel(fill)[0])
        valid = rad != fill
        rad = rad * scale + offset
        qual = g[QUAL][:] if QUAL in g else np.zeros_like(rad, dtype="uint8")
        land = g[LAND][:] if LAND in g else np.ones_like(rad, dtype="uint8")
    good = valid & (qual <= 1)  # 0 good, 1 poor-but-usable; 2 gap-filled, 255 fill excluded
    is_land = land == 1 if (land == 1).any() else land == 0
    return np.minimum(rad, FLARE_CAP), good, is_land


def zonal(paths: list[Path]) -> pd.DataFrame:
    geo = gpd.read_parquet(get_settings().silver / "geometry.parquet")
    rows = []
    shapes_cache: dict[str, np.ndarray] = {}
    ids = list(geo.district_id)
    lat_rows = {}
    for p in sorted(paths):
        tile = next(t for t in TILES if t in p.name)
        year = int(p.name.split(".")[1][1:5])
        tr = _tile_transform(tile)
        if tile not in shapes_cache:
            shapes_cache[tile] = features.rasterize(
                ((geom, i + 1) for i, geom in enumerate(geo.geometry)),
                out_shape=(2400, 2400),
                transform=tr,
                fill=0,
                dtype="int32",
                all_touched=False,
            )
            lats = 90 - int(tile[4:6]) * 10 - (np.arange(2400) + 0.5) * PIX_DEG
            lat_rows[tile] = (111.32 * PIX_DEG) ** 2 * np.cos(np.radians(lats))[:, None]
        zones = shapes_cache[tile]
        if not zones.any():
            continue
        rad, good, land = _read(p)
        area = np.broadcast_to(lat_rows[tile], zones.shape)
        use = (zones > 0) & land
        z = zones[use]
        ok = good[use]
        r = np.where(ok, rad[use], 0.0)
        a = area[use]
        n = len(ids) + 1
        rows.append(
            pd.DataFrame(
                {
                    "zone": np.arange(n),
                    "radiance_sum": np.bincount(z, weights=r, minlength=n),
                    "lit_area_km2": np.bincount(
                        z, weights=a * (ok & (rad[use] > LIT_THRESHOLD)), minlength=n
                    ),
                    "land_px": np.bincount(z, minlength=n),
                    "valid_px": np.bincount(z, weights=ok.astype(float), minlength=n),
                }
            )
            .query("zone > 0 and land_px > 0")
            .assign(year=year, tile=tile)
        )
    df = pd.concat(rows)
    # districts spanning tile edges: sum across tiles
    df = df.groupby(["zone", "year"], as_index=False)[
        ["radiance_sum", "lit_area_km2", "land_px", "valid_px"]
    ].sum()
    df["district_id"] = df.zone.map(lambda i: ids[i - 1])
    df["valid_share"] = df.valid_px / df.land_px
    return df[["district_id", "year", "radiance_sum", "lit_area_km2", "valid_share"]]


def run(keep_raw: bool = False) -> dict:
    """Stream granules one at a time (download → zonal stats → delete), so peak disk use
    is one ~75 MB tile rather than ~3 GB for the full 2012–2025 archive."""
    gs = granules()
    frames = []
    for g in gs:
        [path] = download([g])
        frames.append(zonal([path]))
        if not keep_raw:
            path.unlink(missing_ok=True)
    df = (
        pd.concat(frames)
        .groupby(["district_id", "year"], as_index=False)
        .agg(
            radiance_sum=("radiance_sum", "sum"),
            lit_area_km2=("lit_area_km2", "sum"),
            valid_share=("valid_share", "mean"),
        )
    )
    write_table("silver", "ntl_annual", df)
    return {
        "granules": len(gs),
        "district_years": len(df),
        "years": [int(df.year.min()), int(df.year.max())],
        "sabah_districts": int(df[df.district_id.str.startswith("sbh-")].district_id.nunique()),
    }
