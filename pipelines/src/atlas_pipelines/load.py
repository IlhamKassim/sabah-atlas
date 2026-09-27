"""Load a gold release into Postgres: migrate, then replace all release tables atomically."""

from __future__ import annotations

import json
from importlib.resources import files

import geopandas as gpd
import pandas as pd
import psycopg
from shapely.geometry import MultiPolygon

from atlas_core.catalog import indicators
from atlas_core.settings import REPO_ROOT, get_settings
from atlas_pipelines.lake import read_table

MIGRATIONS = REPO_ROOT / "infra" / "db" / "migrations"

# Replaced wholesale on each load, children before parents.
RELEASE_TABLES = ["analytics", "model_card", "gdp_sector", "observation", "indicator", "source",
                  "district_alias", "district", "release"]


def _dsn() -> str:
    return get_settings().database_url.replace("postgresql+psycopg://", "postgresql://")


def migrate(conn: psycopg.Connection) -> list[str]:
    conn.execute("CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, "
                 "applied_at timestamptz NOT NULL DEFAULT now())")
    done = {r[0] for r in conn.execute("SELECT name FROM schema_migration")}
    applied = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name in done:
            continue
        conn.execute(path.read_text())
        conn.execute("INSERT INTO schema_migration (name) VALUES (%s)", (path.name,))
        applied.append(path.name)
    return applied


def _copy(conn: psycopg.Connection, table: str, df: pd.DataFrame) -> int:
    cols = list(df.columns)
    df = df.astype(object).where(pd.notna(df), None)
    with conn.cursor().copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as cp:
        for row in df.itertuples(index=False):
            cp.write_row(row)
    return len(df)


def _jsonify(v):
    return json.dumps(v, ensure_ascii=False, default=str) if v is not None else None


def run() -> dict:
    gold = get_settings().gold
    district = read_table("gold", "district")
    geo = gpd.read_parquet(gold / "geometry.parquet").set_index("district_id")
    geo["geometry"] = geo.geometry.map(lambda g: g if g.geom_type == "MultiPolygon"
                                       else MultiPolygon([g]))
    district["geom"] = district.district_id.map(lambda i: geo.geometry[i].wkb_hex
                                                if i in geo.index else None)
    district = district.rename(columns={"district_id": "id"})[[
        "id", "slug", "name", "display_name", "state", "state_code", "division", "kind",
        "parent_id", "first_period", "note", "area_km2", "lon", "lat", "geom"]]

    aliases = pd.read_csv(files("atlas_core") / "reference" / "aliases.csv")
    obs = read_table("gold", "observation").rename(columns={"indicator": "indicator_code"})
    src = read_table("gold", "source").rename(columns={"source_id": "id"})
    ind = pd.DataFrame([i.model_dump(exclude={"derived_from"}) for i in indicators().values()])
    manifest_path = gold / "release.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    analytics_path = gold / "analytics.parquet"

    counts = {}
    with psycopg.connect(_dsn()) as conn:
        counts["migrations"] = migrate(conn)
        conn.execute("TRUNCATE " + ", ".join(RELEASE_TABLES))
        if manifest:
            conn.execute("INSERT INTO release (version, content_hash, manifest) VALUES (%s,%s,%s)",
                         (manifest["version"], manifest["content_hash"], _jsonify(manifest)))
        # geometry goes through a text staging column
        d = district.copy()
        geom = d.pop("geom")
        counts["district"] = _copy(conn, "district", d.assign(parent_id=None))
        for did, parent in zip(district.id, district.parent_id, strict=True):
            if isinstance(parent, str):
                conn.execute("UPDATE district SET parent_id=%s WHERE id=%s", (parent, did))
        for did, wkb in zip(district.id, geom, strict=True):
            if isinstance(wkb, str):
                conn.execute("UPDATE district SET geom=ST_GeomFromWKB(decode(%s,'hex'),4326) "
                             "WHERE id=%s", (wkb, did))
        counts["district_alias"] = _copy(conn, "district_alias",
                                         aliases[["state", "alias", "district_id"]])
        counts["source"] = _copy(conn, "source", src)
        counts["indicator"] = _copy(conn, "indicator", ind)
        counts["observation"] = _copy(conn, "observation", obs[[
            "district_id", "indicator_code", "period", "value", "source_id", "is_modelled",
            "quality_flag", "rank_sabah", "n_sabah", "pct_sabah", "pct_national"]])
        counts["gdp_sector"] = _copy(conn, "gdp_sector", read_table("gold", "gdp_sector"))
        if analytics_path.exists():
            an = pd.read_parquet(analytics_path)
            counts["analytics"] = _copy(conn, "analytics", an)
        cards = gold / "model_cards.json"
        if cards.exists():
            mc = pd.DataFrame([{"model_version": c["model_version"], "task": c["task"],
                                "card": _jsonify(c)} for c in json.loads(cards.read_text())])
            counts["model_card"] = _copy(conn, "model_card", mc)
        counts["ntl_image"] = _load_images(conn)
        conn.commit()
    return counts



def _load_images(conn: psycopg.Connection) -> int | None:
    """Sabah-at-night pictures from the night-lights step. Left untouched when this machine
    has none (e.g. a build without EARTHDATA_TOKEN), so an earlier load keeps serving."""
    from atlas_pipelines.ntl import image_dir

    pics = sorted(image_dir().glob("*.png"))
    if not pics:
        return None
    conn.execute("TRUNCATE ntl_image")
    for pic in pics:
        meta = json.loads(pic.with_suffix(".json").read_text())
        conn.execute("INSERT INTO ntl_image (year, png, west, south, east, north) VALUES (%s,%s,%s,%s,%s,%s)",
                     (meta["year"], pic.read_bytes(), *meta["bounds"]))
    return len(pics)
