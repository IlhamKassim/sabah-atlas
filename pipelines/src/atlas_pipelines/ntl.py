"""Night-time lights: NASA Black Marble VNP46A4 (annual, 15 arc-second ≈ 500 m).

Granules are discovered through NASA CMR (no auth) and downloaded from LAADS with an
Earthdata bearer token (EARTHDATA_TOKEN). Malaysia is covered by tiles h27v08,
h28v08 and h29v08 (Sabah lies entirely in h29v08).

Per district and year:
  radiance_sum     sum of snow-free all-angle radiance (nW·cm⁻²·sr⁻¹) over valid land pixels
  lit_area_km2     area of valid land pixels with radiance > LIT_THRESHOLD
  valid_area_km2   area of land pixels with good-quality retrievals
  land_area_km2    area of all land pixels in the district
  land_px, valid_px  the same as pixel counts
  valid_share      valid_px / land_px (cloud-heavy years in Sabah can fall well below 1)
Masks: water/sea pixels (Land_Water_Mask) are dropped, so offshore platforms and
fishing fleets do not count; pixel radiance is capped at FLARE_CAP to limit the pull of
gas flares and industrial point sources; poor-quality retrievals are excluded.

Each year also yields a small picture of Sabah at night for the web map (`sabah_image`):
the same masked radiance, cropped to Sabah's districts, as a transparent gold PNG on a
fixed log scale so years are comparable.
"""

from __future__ import annotations

import hashlib
import json
import os
import warnings
from datetime import UTC, datetime
from pathlib import Path

import geopandas as gpd
import h5py
import httpx
import numpy as np
import pandas as pd
from rasterio import features
from rasterio.errors import NotGeoreferencedWarning
from rasterio.io import MemoryFile
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
SABAH_TILE = "h29v08"
IMAGE_TOP = 60.0  # nW·cm⁻²·sr⁻¹ that renders as full brightness (KK's core is around here)


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
    with httpx.Client(
        headers={"Authorization": f"Bearer {token}"},
        follow_redirects=True,
        timeout=httpx.Timeout(600, connect=60),
        transport=httpx.HTTPTransport(retries=3),  # retries connection failures only
    ) as c:
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
        okf = ok.astype(float)
        rows.append(
            pd.DataFrame(
                {
                    "zone": np.arange(n),
                    "radiance_sum": np.bincount(z, weights=r, minlength=n),
                    "lit_area_km2": np.bincount(
                        z, weights=a * (ok & (rad[use] > LIT_THRESHOLD)), minlength=n
                    ),
                    "valid_area_km2": np.bincount(z, weights=a * okf, minlength=n),
                    "land_area_km2": np.bincount(z, weights=a, minlength=n),
                    "land_px": np.bincount(z, minlength=n),
                    "valid_px": np.bincount(z, weights=okf, minlength=n),
                }
            )
            .query("zone > 0 and land_px > 0")
            .assign(year=year, tile=tile)
        )
    if not rows:
        return pd.DataFrame(columns=["district_id", "year", *SUMS])
    df = pd.concat(rows)
    df["district_id"] = df.zone.map(lambda i: ids[i - 1])
    return df[["district_id", "year", *SUMS]]


def sabah_image(path: Path) -> tuple[bytes, list[float]]:
    """Sabah at night from one h29v08 granule: an RGBA PNG (gold, transparent where dark,
    off-land, poor quality or outside Sabah) and its [west, south, east, north] in degrees."""
    geo = gpd.read_parquet(get_settings().silver / "geometry.parquet")
    sabah = geo[geo.district_id.str.startswith("sbh-")]
    tr = _tile_transform(SABAH_TILE)
    inside = features.rasterize(((g, 1) for g in sabah.geometry), out_shape=(2400, 2400),
                                transform=tr, fill=0, dtype="uint8")
    w, s, e, n = sabah.total_bounds
    c0, c1 = int((w - 110) / PIX_DEG) - 2, int(np.ceil((e - 110) / PIX_DEG)) + 2
    r0, r1 = int((10 - n) / PIX_DEG) - 2, int(np.ceil((10 - s) / PIX_DEG)) + 2
    rad, good, land = _read(path)
    win = np.s_[r0:r1, c0:c1]
    ok = good[win] & land[win] & (inside[win] == 1)
    v = np.clip(np.log1p(np.where(ok, rad[win], 0.0)) / np.log1p(IMAGE_TOP), 0, 1)
    # Dark amber -> lamp gold -> near white; alpha rises quickly so dim villages still show.
    stops = np.array([[138, 90, 26], [246, 200, 90], [255, 242, 196]], dtype=float)
    t = np.clip(v * 2, 0, 2)
    lo = np.minimum(t.astype(int), 1)
    f = (t - lo)[..., None]
    rgb = stops[lo] * (1 - f) + stops[lo + 1] * f
    alpha = np.clip(v * 1.6, 0, 1) * 255
    img = np.dstack([rgb, alpha]).round().astype("uint8").transpose(2, 0, 1)
    # A plain picture: its bounds travel in JSON, so GDAL's "no geotransform" warning is noise.
    with warnings.catch_warnings(), MemoryFile() as mem:
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with mem.open(driver="PNG", width=img.shape[2], height=img.shape[1], count=4, dtype="uint8") as dst:
            dst.write(img)
        png = mem.read()
    bounds = [110 + c0 * PIX_DEG, 10 - r1 * PIX_DEG, 110 + c1 * PIX_DEG, 10 - r0 * PIX_DEG]
    return png, [round(b, 6) for b in bounds]


SUMS = ["radiance_sum", "lit_area_km2", "valid_area_km2", "land_area_km2", "land_px", "valid_px"]


def _lake_container():
    """Blob container holding the zonal cache between cloud runs (the job's disk is ephemeral)."""
    url = os.environ.get("ATLAS_LAKE_CONTAINER_URL")
    if not url:
        return None
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import ContainerClient

    return ContainerClient.from_container_url(url, credential=DefaultAzureCredential())


def image_dir() -> Path:
    """Where the yearly Sabah-at-night pictures live (read by `atlas load`)."""
    d = bronze_dir("ntl_vnp46a4") / "images"
    d.mkdir(exist_ok=True)
    return d


def run(keep_raw: bool = False) -> dict:
    """Stream granules one at a time (download → zonal stats → delete), so peak disk use
    is one ~75 MB tile rather than ~3 GB for the full 2012–2025 archive. Per-granule
    results are cached, so an interrupted run resumes and a weekly run only fetches
    new years."""
    gs = granules()
    cache = bronze_dir("ntl_vnp46a4") / "zonal"
    cache.mkdir(exist_ok=True)
    lake = _lake_container()
    if lake:
        for b in lake.list_blobs(name_starts_with="ntl_zonal/"):
            dest = cache / b.name.split("/", 1)[1]
            if not dest.exists():
                dest.write_bytes(lake.download_blob(b.name).readall())
    images = image_dir()
    if lake:
        for b in lake.list_blobs(name_starts_with="ntl_images/"):
            dest = images / b.name.split("/", 1)[1]
            if not dest.exists():
                dest.write_bytes(lake.download_blob(b.name).readall())
    frames = []
    for i, g in enumerate(gs, 1):
        part = cache / (g["name"].rsplit(".", 1)[0] + ".parquet")
        pic = images / f"{g['year']}.png" if g["tile"] == SABAH_TILE else None
        if not part.exists() or (pic and not pic.exists()):
            [path] = download([g])
            if not part.exists():
                zonal([path]).to_parquet(part, index=False)
                if lake:
                    lake.upload_blob(f"ntl_zonal/{part.name}", part.read_bytes(), overwrite=True)
            if pic and not pic.exists():
                png, bounds = sabah_image(path)
                pic.write_bytes(png)
                pic.with_suffix(".json").write_text(json.dumps({"year": g["year"], "bounds": bounds}))
                if lake:
                    for f in (pic, pic.with_suffix(".json")):
                        lake.upload_blob(f"ntl_images/{f.name}", f.read_bytes(), overwrite=True)
            if not keep_raw:
                path.unlink(missing_ok=True)
            print(f"  [{i}/{len(gs)}] {g['year']} {g['tile']}", flush=True)
        frames.append(pd.read_parquet(part))
    # districts spanning tile edges: sum across tiles
    df = pd.concat(frames).groupby(["district_id", "year"], as_index=False)[SUMS].sum()
    df["valid_share"] = df.valid_px / df.land_px
    write_table("silver", "ntl_annual", df)
    # Bronze metadata in the same shape as tabular sources, for the source registry.
    names = sorted(g["name"] for g in gs)
    digest = hashlib.sha256("\n".join(names).encode()).hexdigest()
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {
        "source_id": "nasa_vnp46a4",
        "url": f"{CMR}?short_name=VNP46A4&bounding_box=99.5,0.8,119.5,7.5",
        "sha256": digest,
        "retrieved_at": now,
        "licence": "NASA open data",
        "file": "zonal",
        "granules": names,
    }
    out = bronze_dir("nasa_vnp46a4") / f"{now[:10]}_{digest[:12]}.meta.json"
    out.write_text(json.dumps(meta, indent=2))
    return {
        "granules": len(gs),
        "district_years": len(df),
        "years": [int(df.year.min()), int(df.year.max())],
        "sabah_districts": int(df[df.district_id.str.startswith("sbh-")].district_id.nunique()),
        "images": len(list(images.glob("*.png"))),
    }
