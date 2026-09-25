"""6.1 Scorecard: "what's working, what's not". Deliberately rule-based.

For each indicator with a direction (higher- or lower-is-better):
  gap   = district vs the median of its structural peers (same period), direction-adjusted
  trend = direction-adjusted change per year between the last two observations;
          RM-denominated indicators are compared against Sabah's own growth over the
          same window (keeping pace with the state), rates use percentage points per year
  STRENGTH: above peers by more than the level threshold AND trend not worsening
  CONCERN:  below peers by more than the level threshold AND trend not improving
  otherwise the reading is "mixed" (e.g. below peers but improving) or "in line".
Thresholds below are published verbatim on the methodology page.
"""

from __future__ import annotations

import pandas as pd

from atlas_core.catalog import indicators
from atlas_ml.common import Gold, sabah_ids, version

SCORED = ["income_median", "poverty_absolute", "gini", "gdp_per_capita", "unemployment_rate",
          "lfpr", "access_piped_water", "access_electricity", "access_sanitation", "income_growth",
          "gdp_growth"]

# Level thresholds: relative (%) for money, absolute otherwise.
LEVEL = {"currency": ("rel", 0.05), "pct": ("abs", 1.0), "decimal3": ("abs", 0.01)}
TREND = {"currency": 0.5, "pct": 0.25, "decimal3": 0.002}  # per year; money in pp of growth vs Sabah
THRESHOLDS_TEXT = {
    "level": "Above/below peers: ±5% for RM values; ±1 percentage point for rates; ±0.01 for Gini.",
    "trend": ("Improving/worsening: RM values growing 0.5 pp/yr faster/slower than Sabah as a "
              "whole over the same window; rates changing by more than 0.25 pp/yr; Gini by more "
              "than 0.002/yr."),
}


def _sabah_growth(g: Gold, code: str, p0: int, p1: int) -> float | None:
    s = g.state[(g.state.state == "Sabah") & (g.state.indicator == code)].set_index("period").value
    if p0 in s and p1 in s:
        return float(100 * ((s[p1] / s[p0]) ** (1 / (p1 - p0)) - 1))
    return None


def fit(g: Gold, peers: dict[str, dict]) -> dict:
    cat = indicators()
    out: dict[str, dict] = {}
    for did in sabah_ids():
        peer_ids = [p["district_id"] for p in peers.get(did, {}).get("peers", [])]
        items = []
        for code in SCORED:
            ind = cat[code]
            w = g.wide(code)
            if did not in w.index:
                continue
            series = w.loc[did].dropna()
            if series.empty:
                continue
            period = int(series.index[-1])
            value = float(series.iloc[-1])
            sign = -1 if ind.direction == "down" else 1
            peer_vals = w.reindex(peer_ids)[period].dropna() if period in w.columns else pd.Series()
            peer_med = float(peer_vals.median()) if len(peer_vals) >= 2 else None

            kind, thr = LEVEL.get(ind.format, ("abs", 1.0))
            gap = None
            level = "unknown"
            if peer_med is not None:
                if ind.category == "momentum":
                    gap = sign * (value - peer_med)
                    kind, thr = "abs", 0.5
                else:
                    gap = sign * ((value / peer_med - 1) * 100 if kind == "rel" else value - peer_med)
                    thr = thr * 100 if kind == "rel" else thr
                level = "above" if gap > thr else "below" if gap < -thr else "in_line"

            trend, trend_per_year, window = "n/a", None, None
            flags = []
            f_now = g.flag(code, period).get(did)
            if isinstance(f_now, str):
                flags.append(f_now)
            if len(series) >= 2 and ind.category != "momentum":
                p0 = int(series.index[-2])
                v0 = float(series.iloc[-2])
                f_prev = g.flag(code, p0).get(did)
                if isinstance(f_prev, str):
                    flags.append(f_prev)
                years = period - p0
                window = [p0, period]
                if ind.format == "currency":
                    own = 100 * ((value / v0) ** (1 / years) - 1)
                    bench = _sabah_growth(g, code, p0, period)
                    trend_per_year = own - bench if bench is not None else None
                else:
                    trend_per_year = sign * (value - v0) / years
                if any(f.startswith("boundary_break") for f in flags):
                    trend, trend_per_year = "not_comparable", None
                elif trend_per_year is not None:
                    t = TREND.get(ind.format, 0.25)
                    trend = ("improving" if trend_per_year > t else
                             "worsening" if trend_per_year < -t else "flat")

            if ind.category == "momentum" and any("boundary_break" in f for f in flags):
                level, gap = "not_comparable", None
            if level == "above" and trend not in ("worsening",):
                verdict = "strength"
            elif level == "below" and trend not in ("improving",):
                verdict = "concern"
            elif level in ("above", "below"):
                verdict = "mixed"
            else:
                verdict = {"in_line": "in_line", "not_comparable": "not_comparable"}.get(
                    level, "unknown")

            obs = g.obs[(g.obs.indicator == code) & (g.obs.period == period) &
                        (g.obs.district_id == did)].iloc[0]
            items.append({
                "indicator": code, "period": period, "value": value, "peer_median": peer_med,
                "peer_values": {p: float(v) for p, v in peer_vals.items()},
                "gap": gap, "gap_unit": "%" if kind == "rel" else ind.unit, "level": level,
                "trend": trend, "trend_per_year": trend_per_year, "trend_window": window,
                "verdict": verdict, "source_id": obs.source_id,
                "pct_sabah": None if pd.isna(obs.pct_sabah) else float(obs.pct_sabah),
                "rank_sabah": None if pd.isna(obs.rank_sabah) else int(obs.rank_sabah),
                "n_sabah": None if pd.isna(obs.n_sabah) else int(obs.n_sabah),
                "flags": flags,
            })
        order = {"strength": 0, "concern": 1, "mixed": 2, "in_line": 3, "not_comparable": 4,
                 "unknown": 5}
        items.sort(key=lambda x: (order[x["verdict"]], -abs(x["gap"] or 0)))
        out[did] = {"items": items, "peers": peer_ids,
                    "summary": {v: sum(1 for i in items if i["verdict"] == v) for v in order}}

    mv = version("scorecard", {"t": THRESHOLDS_TEXT, "s": SCORED})
    card = {
        "model_version": mv, "task": "scorecard", "title": "District scorecard rules",
        "method": __doc__.strip(), "thresholds": THRESHOLDS_TEXT, "indicators": SCORED,
        "limitations": [
            "Peers come from the typology model; a different peer set can change a verdict.",
            "Nominal RM values are compared with Sabah's own nominal growth rather than deflated.",
            "Trends across a boundary change (e.g. Beaufort 2024 after Membakut) are not scored.",
            "GDP per capita exists only for 2020 and so has no trend.",
        ],
    }
    return {"model_version": mv, "per_district": out, "card": card}
