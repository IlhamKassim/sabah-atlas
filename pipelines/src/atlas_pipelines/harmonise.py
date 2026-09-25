"""Bronze -> silver: canonical district ids, long-format observations, flags.

Silver tables
- observation: district_id, indicator, period, value, source_id, quality_flag
- gdp_sector:  district_id, period, sector, value   (RM mil, 2015 prices; incl. Supra)
- geometry:    district_id, geometry (EPSG:4326), area_km2, centroid lon/lat
- source:      one row per source snapshot actually used
"""

from __future__ import annotations

import json

import geopandas as gpd
import pandas as pd

from atlas_core.catalog import errata, sources
from atlas_core.registry import districts, resolve_frame
from atlas_core.settings import get_settings
from atlas_pipelines.lake import latest_bronze, write_table

GDP_SECTORS = {"p1": "agriculture", "p2": "mining", "p3": "manufacturing", "p4": "construction",
               "p5": "services"}

# Boundary lineage relative to the 2020 polygon layer. `polygon_has_child`: whether the
# parent's polygon includes the child's territory. A parent value is flagged in any period
# where the reported area disagrees with the polygon it is drawn on.
LINEAGE = [
    {"child": "sbh-membakut", "parent": "sbh-beaufort", "polygon_has_child": True},
    {"child": "sbh-kalabakan", "parent": "sbh-tawau", "polygon_has_child": False},
    # Telupid was a sub-district of Beluran; absent from LFS 2018-19 and amenities 2016.
    {"child": "sbh-telupid", "parent": "sbh-beluran", "polygon_has_child": False},
]


def _year(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s).dt.year.astype(int)


def _load(source_id: str) -> tuple[pd.DataFrame, dict]:
    path, meta = latest_bronze(source_id)
    return pd.read_parquet(path), meta


def _melt(df: pd.DataFrame, source_id: str, mapping: dict[str, str]) -> pd.DataFrame:
    df = df[df.district != "All Districts"].copy()
    df["district_id"] = resolve_frame(df)
    df["period"] = _year(df.date)
    long = df.melt(id_vars=["district_id", "period"], value_vars=list(mapping),
                   var_name="col", value_name="value")
    long["indicator"] = long.col.map(mapping)
    long["source_id"] = source_id
    return long.drop(columns="col").dropna(subset=["value"])


def _population() -> tuple[pd.DataFrame, str]:
    sid = "dosm_population_district"
    df, _ = _load(sid)
    df["district_id"] = resolve_frame(df)
    df["period"] = _year(df.date)
    both = df[df.sex == "both"]
    total = both[(both.age == "overall") & (both.ethnicity == "overall")]
    total = total.groupby(["district_id", "period"]).population.sum()
    old = both[both.age.isin(["65-69", "70-74", "75-79", "80-84", "85+"]) &
               (both.ethnicity == "overall")].groupby(["district_id", "period"]).population.sum()
    nonc = both[(both.age == "overall") & (both.ethnicity == "other_noncitizen")]
    nonc = nonc.groupby(["district_id", "period"]).population.sum()
    out = pd.concat([
        total.rename("population"),
        (100 * old / total).rename("share_age_65plus"),
        (100 * nonc / total).rename("share_noncitizen"),
    ], axis=1).reset_index().melt(id_vars=["district_id", "period"], var_name="indicator")
    out["source_id"] = sid
    return out.dropna(subset=["value"]), sid


def _gdp() -> tuple[pd.DataFrame, pd.DataFrame]:
    sid = "dosm_gdp_district_real_supply"
    df, _ = _load(sid)
    df = df[df.series == "abs"].copy()
    df["district_id"] = resolve_frame(df)
    df["period"] = _year(df.date)
    total = df[df.sector == "p0"][["district_id", "period", "value"]].assign(
        indicator="gdp_real", source_id=sid)
    sect = df[df.sector.isin(GDP_SECTORS)].assign(sector=lambda d: d.sector.map(GDP_SECTORS))
    # DOSM nulls sector values below RM 5 mil; keep the null distinct from a true zero.
    sect = sect[["district_id", "period", "sector", "value"]]
    return total.dropna(subset=["value"]), sect


def state_series() -> pd.DataFrame:
    """State and national benchmark series: state, indicator, period, value, source_id."""
    parts = []
    sid = "dosm_gdp_state_real_supply"
    g, _ = _load(sid)
    g = g[(g.series == "abs") & g.sector.isin(["p0", *GDP_SECTORS])].copy()
    g["indicator"] = g.sector.map(lambda s: "gdp_real" if s == "p0" else f"gdp_{GDP_SECTORS[s]}")
    parts.append(g.assign(period=_year(g.date), source_id=sid)[
        ["state", "indicator", "period", "value", "source_id"]])
    sid = "dosm_hh_income_state"
    i, _ = _load(sid)
    i = i.melt(id_vars=["state", "date"], value_vars=["income_median", "income_mean"],
               var_name="indicator")
    parts.append(i.assign(period=_year(i.date), source_id=sid)[
        ["state", "indicator", "period", "value", "source_id"]])
    out = pd.concat(parts, ignore_index=True).dropna(subset=["value"])
    out["value"] = out.value.astype(float)
    return out


def boundary_flags(obs: pd.DataFrame) -> pd.Series:
    """Quality flag per observation row for boundary breaks (see LINEAGE)."""
    flag = pd.Series(pd.NA, index=obs.index, dtype="object")
    present = obs.groupby(["source_id", "period"]).district_id.agg(set)
    for rule in LINEAGE:
        for (src, period), ids in present.items():
            if rule["parent"] not in ids:
                continue
            child_reported = rule["child"] in ids
            mismatch = child_reported if rule["polygon_has_child"] else not child_reported
            if mismatch:
                child_name = districts().loc[rule["child"], "display_name"]
                label = (f"boundary_break:excludes {child_name}" if child_reported
                         else f"boundary_break:includes {child_name}")
                m = (obs.source_id == src) & (obs.period == period) & (
                    obs.district_id == rule["parent"])
                flag[m] = label
    return flag


def geometry() -> gpd.GeoDataFrame:
    sid = "geoboundaries_mys_adm2"
    path, _ = latest_bronze(sid)
    g = gpd.read_file(path)
    reg = districts()
    by_geo = {n: i for i, n in zip(reg.district_id, reg.geo_name, strict=True) if n}
    g["district_id"] = g.shapeName.map(by_geo)
    missing = g[g.district_id.isna()].shapeName.tolist()
    if missing:
        raise ValueError(f"boundary names without a registry match: {missing}")
    g = g[["district_id", "geometry"]].dissolve(by="district_id").reset_index()
    g["area_km2"] = g.to_crs("EPSG:6933").area / 1e6
    pts = g.to_crs("EPSG:3857").representative_point().to_crs("EPSG:4326")
    g["lon"], g["lat"] = pts.x.round(5), pts.y.round(5)
    return g


def run() -> dict[str, int]:
    parts: list[pd.DataFrame] = []
    specs = [
        ("dosm_hh_income_district", {"income_median": "income_median", "income_mean": "income_mean"}),
        ("dosm_hh_poverty_district", {"poverty_absolute": "poverty_absolute",
                                      "poverty_relative": "poverty_relative"}),
        ("dosm_hh_inequality_district", {"gini": "gini"}),
        ("dosm_hies_district", {"expenditure_mean": "expenditure_mean"}),
        ("dosm_lfs_district", {"p_rate": "lfpr", "u_rate": "unemployment_rate",
                               "ep_ratio": "employment_ratio", "lf": "labour_force"}),
        ("dosm_hh_access_amenities", {"piped_water": "access_piped_water",
                                      "electricity": "access_electricity",
                                      "sanitation": "access_sanitation"}),
    ]
    for sid, mapping in specs:
        df, _ = _load(sid)
        parts.append(_melt(df, sid, mapping))
    pop, _ = _population()
    gdp_total, gdp_sect = _gdp()
    parts += [pop, gdp_total]
    obs = pd.concat(parts, ignore_index=True)
    obs["value"] = obs.value.astype(float)
    for e in errata():
        m = ((obs.source_id == e["source_id"]) & (obs.district_id == e["district_id"])
             & (obs.period == e["period"]))
        if "indicator" in e:
            m &= obs.indicator == e["indicator"]
        if not m.any():
            raise ValueError(f"erratum no longer matches any row (source fixed?): {e}")
        obs = obs[~m]
    dup =obs.duplicated(["district_id", "indicator", "period"], keep=False)
    if dup.any():
        raise ValueError(f"duplicate observations:\n{obs[dup].head(20)}")
    obs["quality_flag"] = boundary_flags(obs)
    obs = obs[["district_id", "indicator", "period", "value", "source_id", "quality_flag"]]

    src_rows = []
    for sid, s in sources().items():
        _, meta = latest_bronze(sid)
        pm = meta.get("publisher_meta", {})
        src_rows.append({
            "source_id": sid, "publisher": s.publisher, "dataset_id": s.dataset_id,
            "title": s.title, "url": s.page, "download_url": meta["url"], "licence": s.licence,
            "last_updated": pm.get("last_updated"), "data_as_of": pm.get("data_as_of"),
            "retrieved_at": meta["retrieved_at"], "checksum": meta["sha256"],
            "caveat": pm.get("caveat"),
            "publisher_meta": json.dumps(pm, ensure_ascii=False) if pm else None,
        })

    geo = geometry()
    write_table("silver", "state_series", state_series())
    write_table("silver", "observation", obs)
    write_table("silver", "gdp_sector", gdp_sect)
    write_table("silver", "source", pd.DataFrame(src_rows))
    geo.to_parquet(get_settings().silver / "geometry.parquet", index=False)  # GeoParquet
    return {"observation": len(obs), "gdp_sector": len(gdp_sect), "geometry": len(geo),
            "flagged": int(obs.quality_flag.notna().sum())}
