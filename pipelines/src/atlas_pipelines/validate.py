"""Gold validation gates. Any failure stops the pipeline before publish/load."""

from __future__ import annotations

import pandas as pd
import pandera.pandas as pa

from atlas_core.catalog import indicators
from atlas_core.registry import districts, sabah_districts

PCT_UNITS = {"pct"}

# Indicator -> periods where all 27 Sabah districts (2020 polygons) must be present.
# Kalabakan is absent from HIES 2019 and Telupid from LFS 2018-19, so those are excused.
COMPLETENESS = {
    "income_median": {2022: 27, 2024: 27, 2019: 26},
    "poverty_absolute": {2022: 27, 2024: 27},
    "gini": {2022: 27, 2024: 27},
    "gdp_real": {y: 27 for y in range(2015, 2021)},
    "population": {y: 27 for y in range(2020, 2026)},
    "unemployment_rate": {y: 27 for y in range(2021, 2025)},
}


def _schema() -> pa.DataFrameSchema:
    ids = set(districts().district_id)
    return pa.DataFrameSchema({
        "district_id": pa.Column(str, pa.Check.isin(ids)),
        "indicator": pa.Column(str, pa.Check.isin(set(indicators()))),
        "period": pa.Column(int, pa.Check.in_range(2010, 2035)),
        "value": pa.Column(float, nullable=False),
        "source_id": pa.Column(str),
    }, unique=["district_id", "indicator", "period"])


def _range_errors(df: pd.DataFrame) -> list[str]:
    errs = []
    cat = indicators()
    for code, g in df.groupby("indicator"):
        ind = cat[code]
        v = g.value
        if ind.format == "pct" and ind.category != "momentum":
            bad = g[(v < 0) | (v > 100.0001)]
        elif code == "gini":
            bad = g[(v <= 0) | (v >= 1)]
        elif ind.format == "currency" or code in ("population", "gdp_real", "labour_force"):
            bad = g[v <= 0]
        elif ind.category == "momentum":
            bad = g[(v < -50) | (v > 50)]
        else:
            bad = g.iloc[:0]
        if len(bad):
            errs.append(f"{code}: {len(bad)} out of range, e.g. {bad.head(3).to_dict('records')}")
    return errs


def validate_gold(df: pd.DataFrame) -> dict:
    _schema().validate(df, lazy=True)
    errors = _range_errors(df)
    sabah = set(sabah_districts().district_id)
    for code, periods in COMPLETENESS.items():
        for period, expected in periods.items():
            got = df[(df.indicator == code) & (df.period == period) &
                     df.district_id.isin(sabah)].district_id.nunique()
            if got != expected:
                errors.append(f"completeness: {code} {period} has {got}/{expected} Sabah districts")
    # Night lights (optional source) come from 2020 polygons: every year needs all 27.
    ntl = df[(df.indicator == "ntl_radiance_mean") & df.district_id.isin(sabah)]
    for period, g in ntl.groupby("period"):
        if g.district_id.nunique() != 27:
            errors.append(f"completeness: ntl_radiance_mean {period} has {g.district_id.nunique()}/27")
    if errors:
        raise ValueError("gold validation failed:\n  " + "\n  ".join(errors))
    return {"validated": True, "checks": len(COMPLETENESS)}
