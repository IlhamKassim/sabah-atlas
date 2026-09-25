"""6.2 Shift-share decomposition of district GDP growth.

For district d, sector i, window t0 -> t1 with benchmark growth G (all sectors)
and g_i (sector i), and district sector growth r_i:
    benchmark effect   NS_i = E_i0 * G
    industry-mix       IM_i = E_i0 * (g_i - G)
    competitive        CE_i = E_i0 * (r_i - g_i)
NS + IM + CE = E_i1 - E_i0 exactly. Benchmarks are Sabah (sum of Sabah districts,
excluding the offshore 'Supra' row) and Malaysia (sum of all districts, excluding
Supra). DOSM nulls sector values below RM5 mil; those are treated as 0 and listed.
"""

from __future__ import annotations

import pandas as pd

from atlas_ml.common import Gold, modelling_units, version

SECTORS = ["agriculture", "mining", "manufacturing", "construction", "services"]
WINDOWS = [(2015, 2019, "Pre-pandemic (2015–2019)"), (2015, 2020, "Full series (2015–2020)")]


def _decompose(E0: pd.Series, E1: pd.Series, B0: pd.Series, B1: pd.Series) -> dict:
    G = B1.sum() / B0.sum() - 1
    g = B1 / B0 - 1
    r = (E1 / E0 - 1).where(E0 > 0, 0.0)
    ns = E0 * G
    im = E0 * (g - G)
    ce = (E1 - E0) - ns - im  # equals E0*(r-g) where E0>0; absorbs sectors that appear from 0
    return {
        "benchmark_growth": float(G),
        "sectors": {s: {"start": float(E0[s]), "end": float(E1[s]), "benchmark_effect": float(ns[s]),
                        "industry_mix": float(im[s]), "competitive": float(ce[s]),
                        "district_growth": float(r[s]) if E0[s] > 0 else None,
                        "benchmark_sector_growth": float(g[s])} for s in SECTORS},
        "total": {"start": float(E0.sum()), "end": float(E1.sum()), "change": float(E1.sum() - E0.sum()),
                  "benchmark_effect": float(ns.sum()), "industry_mix": float(im.sum()),
                  "competitive": float(ce.sum())},
    }


def fit(g: Gold) -> dict:
    s = g.sect[g.sect.sector.isin(SECTORS)].copy()
    suppressed = s[s.value.isna()]
    s["value"] = s.value.fillna(0.0)
    panel = s.pivot_table(index=["district_id", "period"], columns="sector", values="value").fillna(0)
    units = [u for u in modelling_units() if u in panel.index.get_level_values(0)]
    sabah = [u for u in units if u.startswith("sbh-")]

    out: dict[str, dict] = {}
    for t0, t1, label in WINDOWS:
        bench = {"Sabah": sabah, "Malaysia": units}
        B = {name: (panel.loc[(ids, t0), :].sum()[SECTORS], panel.loc[(ids, t1), :].sum()[SECTORS])
             for name, ids in bench.items()}
        for d in units:
            E0, E1 = panel.loc[(d, t0)][SECTORS], panel.loc[(d, t1)][SECTORS]
            for name, (B0, B1) in B.items():
                if name == "Sabah" and d not in sabah:
                    continue
                res = _decompose(E0, E1, B0, B1)
                out.setdefault(d, {"windows": []})["windows"].append(
                    {"t0": t0, "t1": t1, "label": label, "benchmark": name, **res})

    for d, v in out.items():
        sup = suppressed[suppressed.district_id == d]
        v["suppressed"] = sorted({f"{r.sector} {r.period}" for r in sup.itertuples()})

    mv = version("shiftshare", panel.reset_index())
    card = {
        "model_version": mv, "task": "shift_share",
        "title": "Shift-share decomposition of district GDP growth",
        "method": ("Classic three-way decomposition (benchmark growth, industry mix, competitive) "
                   "of the change in real district GDP across 5 sectors, against Sabah and "
                   "Malaysia benchmarks. Identity: the three effects sum exactly to the change."),
        "windows": [{"t0": a, "t1": b, "label": c} for a, b, c in WINDOWS],
        "limitations": [
            "District GDP is published only to 2020, so the decomposition cannot see 2021 onward.",
            "2020 is a pandemic year; the pre-pandemic window is shown by default.",
            "Offshore oil & gas ('Supra') is excluded from both district and benchmark totals.",
            "Import duties are not allocated to sectors, so sector sums can differ slightly from "
            "total GDP.",
            "Sector values below RM5 mil are suppressed by DOSM and treated as zero.",
        ],
    }
    return {"model_version": mv, "per_district": out, "card": card}
