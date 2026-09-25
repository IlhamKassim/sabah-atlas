"""Silver -> gold: derived indicators, ranks and percentiles, then validation.

Gold `observation` columns:
  district_id, indicator, period, value, source_id, quality_flag, is_modelled,
  rank_sabah, n_sabah, pct_sabah, pct_national
Percentiles are "share of districts this one is better than", direction-aware, so
100 is always best for up/down indicators; neutral indicators use raw ascending order.
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd

from atlas_core.catalog import indicators
from atlas_core.registry import districts
from atlas_core.settings import get_settings
from atlas_pipelines.lake import read_table, write_table
from atlas_pipelines.validate import validate_gold


def _cagr(a: pd.Series, b: pd.Series, years: pd.Series | int) -> pd.Series:
    return 100 * ((b / a) ** (1 / years) - 1)


def _merge_flags(*flags: pd.Series) -> pd.Series:
    df = pd.concat(flags, axis=1)
    return df.apply(lambda r: "; ".join(sorted({x for x in r if isinstance(x, str)})) or pd.NA,
                    axis=1)


def derive(obs: pd.DataFrame, sect: pd.DataFrame, geo: pd.DataFrame) -> pd.DataFrame:
    wide = obs.pivot_table(index=["district_id", "period"], columns="indicator", values="value")
    flags = obs.pivot_table(index=["district_id", "period"], columns="indicator",
                            values="quality_flag", aggfunc="first")
    rows: list[pd.DataFrame] = []

    def emit(values: pd.Series, code: str, flag: pd.Series | None = None) -> None:
        v = values.dropna()
        df = v.rename("value").reset_index()
        df["indicator"] = code
        df["source_id"] = "derived"
        df["quality_flag"] = (flag.reindex(v.index).values if flag is not None else pd.NA)
        rows.append(df)

    # GDP per capita (only years with both GDP and population: 2020).
    if {"gdp_real", "population"} <= set(wide.columns):
        gpc = wide.gdp_real * 1e6 / (wide.population * 1e3)
        f = pd.Series(pd.NA, index=gpc.index, dtype="object")
        kl = gpc.index.get_level_values("district_id") == "kul-kuala-lumpur"
        f[kl] = "note:includes Putrajaya output, excludes Putrajaya population"
        emit(gpc, "gdp_per_capita", f)

    # Sector shares. DOSM nulls sector values < RM5 mil: treat as 0 share, flagged.
    s = sect.pivot_table(index=["district_id", "period"], columns="sector", values="value",
                         dropna=False)
    total = wide["gdp_real"].reindex(s.index)
    for sector in s.columns:
        col = s[sector]
        f = pd.Series(pd.NA, index=s.index, dtype="object")
        f[col.isna()] = "suppressed:below RM5 mil, shown as 0"
        emit((100 * col.fillna(0) / total).where(total.notna()), f"share_{sector}", f)

    # Density.
    area = geo.set_index("district_id").area_km2
    pop = wide["population"].dropna()
    dens = pop * 1e3 / area.reindex(pop.index.get_level_values("district_id")).values
    emit(dens, "pop_density")

    # Growth rates between endpoints, stamped on the end period.
    def growth(code: str, src: str, start: int | None) -> None:
        if src not in wide:
            return
        v = wide[src].dropna().reset_index()
        fl = flags[src].reset_index() if src in flags else None
        out, fout = {}, {}
        for did, g in v.groupby("district_id"):
            g = g.sort_values("period")
            first = g[g.period == start] if start is not None else g.iloc[:0]
            if first.empty:
                first = g.iloc[[0]]
            last = g.iloc[[-1]]
            p0, p1 = int(first.period.iloc[0]), int(last.period.iloc[0])
            if p1 <= p0:
                continue
            out[(did, p1)] = float(_cagr(first[src].iloc[0], last[src].iloc[0], p1 - p0))
            if fl is not None:
                fs = fl[(fl.district_id == did) & fl.period.isin([p0, p1])][src]
                fs = sorted({x for x in fs if isinstance(x, str)})
                note = f"window:{p0}-{p1}"
                fout[(did, p1)] = "; ".join(fs + [note])
            else:
                fout[(did, p1)] = f"window:{p0}-{p1}"
        idx = pd.MultiIndex.from_tuples(list(out), names=["district_id", "period"])
        emit(pd.Series(list(out.values()), index=idx), code,
             pd.Series(list(fout.values()), index=idx))

    growth("gdp_growth", "gdp_real", 2015)
    growth("income_growth", "income_median", 2019)
    growth("population_growth", "population", 2020)

    derived = pd.concat(rows, ignore_index=True)
    return derived


def rank(obs: pd.DataFrame) -> pd.DataFrame:
    reg = districts()
    kind = obs.district_id.map(reg.kind)
    state = obs.district_id.map(reg.state)
    cat = indicators()
    direction = obs.indicator.map(lambda c: cat[c].direction if c in cat else "neutral")
    obs = obs.assign(_kind=kind, _state=state, _dir=direction)
    obs["_score"] = np.where(obs._dir == "down", -obs.value, obs.value)
    ranked = obs._kind.isin(["district", "successor"])
    obs["pct_national"] = np.nan
    obs["pct_sabah"] = np.nan
    obs["rank_sabah"] = pd.array([pd.NA] * len(obs), dtype="Int64")
    obs["n_sabah"] = pd.array([pd.NA] * len(obs), dtype="Int64")
    g = obs[ranked].groupby(["indicator", "period"])._score
    obs.loc[ranked, "pct_national"] = 100 * (g.rank(method="average") - 1) / (g.transform("count") - 1)
    sab = ranked & (obs._state == "Sabah")
    gs = obs[sab].groupby(["indicator", "period"])._score
    obs.loc[sab, "pct_sabah"] = 100 * (gs.rank(method="average") - 1) / (gs.transform("count") - 1)
    obs.loc[sab, "rank_sabah"] = gs.rank(method="min", ascending=False).astype("Int64")
    obs.loc[sab, "n_sabah"] = gs.transform("count").astype("Int64")
    return obs.drop(columns=["_kind", "_state", "_dir", "_score"])


def run() -> dict:
    obs = read_table("silver", "observation")
    sect = read_table("silver", "gdp_sector")
    geo = gpd.read_parquet(get_settings().silver / "geometry.parquet")
    derived = derive(obs, sect, geo)
    full = pd.concat([obs, derived], ignore_index=True)
    full["is_modelled"] = False
    full = rank(full)
    full["value"] = full.value.astype(float)
    report = validate_gold(full)
    write_table("gold", "observation", full)
    write_table("gold", "gdp_sector", sect)
    write_table("gold", "source", read_table("silver", "source"))
    geo.to_parquet(get_settings().gold / "geometry.parquet", index=False)
    reg = districts().reset_index(drop=True)
    area = geo.set_index("district_id")[["area_km2", "lon", "lat"]]
    write_table("gold", "district", reg.join(area, on="district_id"))
    return {"rows": len(full), "derived": len(derived), **report}
