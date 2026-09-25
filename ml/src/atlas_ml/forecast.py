"""6.5–6.6 Nowcasts and 1–3 year projections with calibrated uncertainty.

District GDP (published to 2020)
  top-down   Sabah's published sector GDP (to 2025) drives each district's sectors:
             Y_di(t) = Y_di(b) * S_i(t)/S_i(b) * exp(lambda * c_di * (t-b))
  bottom-up  c_di is the district's own sector drift relative to the state over the
             base window; lambda (shrinkage) is chosen on backtests in other states
  reconcile  per state and sector, districts are scaled proportionally so they move
             with the published state sector total (WLS/MinT with level-proportional
             weights); offshore 'Supra' is carried separately so it never distorts districts
  intervals  split-conformal: empirical log errors from backtests (base 2017, horizons
             1–3) in *other* states (leave-one-state-out); widened by sqrt(h) beyond 3
  projection 2026–2028 extends state sector growth at its non-pandemic median, with
             transparent scenario shifts; state-path uncertainty is added in quadrature

Median household income (survey rounds 2019, 2022, 2024)
  log y(T+h) = log y(T) + h * (g_state + rho * r_d)
  g_state = the state's long-run median-income trend; r_d = district's excess growth
  over its state in the last window; rho chosen by backtest (2019->2022 inputs, predict
  2024). Conformal intervals from other states' errors.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from atlas_core.registry import districts
from atlas_ml.common import Gold, modelling_units, sabah_ids, version

SECTORS = ["agriculture", "mining", "manufacturing", "construction", "services"]
LAMBDAS = [0.0, 0.25, 0.5, 0.75, 1.0]
RHOS = [0.0, 0.25, 0.5, 0.75, 1.0]
LAST_GDP = 2020
NOWCAST_TO = 2025
PROJ_YEARS = [2026, 2027, 2028]
GROWTH_YEARS = [2016, 2017, 2018, 2019, 2023, 2024, 2025]  # skip pandemic distortion 2020–22
ALPHA = 0.2  # 80% interval: p10–p90
# Mondrian conformal: Sabah intervals are calibrated on East Malaysian backtest errors,
# whose volatility matches Sabah's better than the peninsula's. Out-of-sample coverage
# (calibrated without Sabah) is reported separately in the model card.
CAL_GROUP = {"Sabah", "Sarawak", "W.P. Labuan"}

SCENARIOS = {
    "baseline": {"label": "Baseline", "shift": {},
                 "description": "State sector growth continues at its non-pandemic median."},
    "palm_oil_downturn": {"label": "Palm-oil downturn", "shift": {"agriculture": -0.04},
                          "description": "Agriculture grows 4 pp/yr slower (e.g. a sustained CPO "
                                         "price slump or replanting drag)."},
    "oil_gas_downturn": {"label": "Oil & gas downturn",
                         "shift": {"mining": -0.06, "services": -0.005},
                         "description": "Mining 6 pp/yr slower with a 0.5 pp/yr services "
                                        "spillover. Offshore output ('Supra') bears most of it."},
    "services_upswing": {"label": "Tourism & services upswing", "shift": {"services": 0.015},
                         "description": "Services grow 1.5 pp/yr faster (tourism, logistics)."},
}


# ---------------------------------------------------------------- GDP ----
def _gdp_panel(g: Gold) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series]:
    s = g.sect[g.sect.sector.isin(SECTORS)].assign(value=lambda d: d.value.fillna(0.0))
    P = s.pivot_table(index=["district_id", "period"], columns="sector", values="value")[SECTORS]
    st = g.state[g.state.indicator.str.startswith("gdp_") & (g.state.indicator != "gdp_real")]
    st = st.assign(sector=st.indicator.str.removeprefix("gdp_"))
    S = st.pivot_table(index=["state", "period"], columns="sector", values="value")[SECTORS]
    # district total GDP / sum of sectors (import duties etc.), base-year ratio per district
    tot = g.wide("gdp_real")
    ratio = (tot[LAST_GDP] / P.xs(LAST_GDP, level="period").sum(axis=1)).fillna(1.0)
    return P, S, ratio


def _state_of(ids) -> pd.Series:
    ids = list(ids)
    return pd.Series(ids, index=ids).map(districts().state)


def _allocate(P: pd.DataFrame, S: pd.DataFrame, base: int, years: list[int], lam: float,
              state_path: pd.DataFrame | None = None) -> dict[int, pd.DataFrame]:
    """Nowcast district sector GDP for `years` from base-year levels. Returns {year: d x sector}."""
    Yb = P.xs(base, level="period")
    ids = Yb.index
    st = _state_of(ids)
    k = base - 2015
    if k >= 1 and lam > 0:
        Y0 = P.xs(2015, level="period").reindex(ids)
        S0 = S.xs(2015, level="period").reindex(st.values).set_index(ids)
        Sb = S.xs(base, level="period").reindex(st.values).set_index(ids)
        with np.errstate(divide="ignore", invalid="ignore"):
            c = (np.log(Yb / Y0) - np.log(Sb / S0)) / k
        c = c.replace([np.inf, -np.inf], np.nan).fillna(0.0).clip(-0.15, 0.15)
    else:
        c = pd.DataFrame(0.0, index=ids, columns=SECTORS)
    path = S if state_path is None else state_path
    Sb = path.xs(base, level="period")
    out = {}
    supra = ids.str.endswith("-supra")
    for t in years:
        St = path.xs(t, level="period")
        growth = (St / Sb).reindex(st.values).set_index(ids)
        Y = Yb * growth * np.exp(lam * c * (t - base))
        # Reconcile: non-Supra districts in each state move with the state sector total.
        for state, idx in st[~supra].groupby(st[~supra]).groups.items():
            target = Yb.loc[idx].sum() * (St.loc[state] / Sb.loc[state])
            cur = Y.loc[idx].sum()
            scale = (target / cur).replace([np.inf, -np.inf], 1.0).fillna(1.0)
            Y.loc[idx] = Y.loc[idx] * scale
        out[t] = Y
    return out


def _gdp_backtest(P, S, ratio) -> tuple[pd.DataFrame, float]:
    units = [u for u in modelling_units() if u in P.index.get_level_values(0)]
    rows = []
    base = 2017
    actual = {t: P.xs(t, level="period").sum(axis=1) * ratio for t in (2018, 2019, 2020)}
    Pb = P.loc[pd.IndexSlice[units + [u for u in P.index.levels[0] if u.endswith("supra")], :], :]
    for lam in LAMBDAS:
        pred = _allocate(Pb, S, base, [2018, 2019, 2020], lam)
        for t, Y in pred.items():
            yhat = Y.sum(axis=1) * ratio.reindex(Y.index)
            for d in units:
                a, p = actual[t].get(d), yhat.get(d)
                if a and p and a > 0 and p > 0:
                    rows.append({"lambda": lam, "district_id": d, "h": t - base,
                                 "log_err": float(np.log(a / p))})
    # Naive benchmark: constant share of state GDP.
    st = _state_of(pd.Index(units))
    tot_state = {t: actual[t].groupby(_state_of(actual[t].index)).sum() for t in actual}
    base_tot = P.xs(base, level="period").sum(axis=1) * ratio
    base_state = base_tot.groupby(_state_of(base_tot.index)).sum()
    for t in (2018, 2019, 2020):
        for d in units:
            share = base_tot[d] / base_state[st[d]]
            p = share * tot_state[t][st[d]]
            rows.append({"lambda": -1.0, "district_id": d, "h": t - base,
                         "log_err": float(np.log(actual[t][d] / p))})
    bt = pd.DataFrame(rows)
    bt["state"] = _state_of(bt.district_id).values
    non_sabah = bt[(bt.state != "Sabah") & (bt["lambda"] >= 0)]
    score = non_sabah.groupby("lambda").log_err.apply(lambda e: np.median(np.abs(e)))
    return bt, float(score.idxmin())


def _conformal(errors: pd.Series) -> tuple[float, float]:
    """Split-conformal quantiles of log errors for an 80% two-sided interval."""
    n = len(errors)
    lo = np.quantile(errors, max(0.0, np.floor((n + 1) * ALPHA / 2) / n))
    hi = np.quantile(errors, min(1.0, np.ceil((n + 1) * (1 - ALPHA / 2)) / n))
    return float(lo), float(hi)


def _state_projection(S: pd.DataFrame, state: str, scenario: dict) -> tuple[pd.DataFrame, pd.Series]:
    s = S.xs(state, level="state")
    growth = s.pct_change()
    g = growth.loc[GROWTH_YEARS].median()
    sd = np.log1p(growth.loc[GROWTH_YEARS]).std()
    for k, v in scenario["shift"].items():
        g[k] = g[k] + v
    rows = {}
    last = s.loc[NOWCAST_TO]
    for i, t in enumerate(PROJ_YEARS, start=1):
        rows[t] = last * (1 + g) ** i
    proj = pd.DataFrame(rows).T
    proj.index.name = "period"
    return proj, sd


def gdp_forecast(g: Gold) -> tuple[dict, dict]:
    P, S, ratio = _gdp_panel(g)
    bt, lam = _gdp_backtest(P, S, ratio)
    sab = sabah_ids()
    chosen = bt[bt["lambda"] == lam]
    cal = chosen[chosen.state.isin(CAL_GROUP)]
    q = {h: _conformal(cal[cal.h == h].log_err) for h in (1, 2, 3)}
    loso = chosen[chosen.state != "Sabah"]
    loso_cov = {}
    for h in (1, 2, 3):
        lo, hi = _conformal(loso[loso.h == h].log_err)
        e = chosen[(chosen.state == "Sabah") & (chosen.h == h)].log_err
        loso_cov[h] = float(((e >= lo) & (e <= hi)).mean())

    def q_at(h: int) -> tuple[float, float]:
        if h <= 3:
            return q[h]
        lo, hi = q[3]
        f = np.sqrt(h / 3)
        return lo * f, hi * f

    now_years = list(range(LAST_GDP + 1, NOWCAST_TO + 1))
    ids = [i for i in sab + ["sbh-supra"] if i in P.index.get_level_values(0)]
    Pb = P.loc[pd.IndexSlice[ids, :], :]
    nowcast = _allocate(Pb, S, LAST_GDP, now_years, lam)

    # Scenario projections: extend the Sabah state path, then allocate from 2020 levels.
    projections = {}
    for key, sc in SCENARIOS.items():
        proj, _ = _state_projection(S, "Sabah", sc)
        ext = pd.concat([S.xs("Sabah", level="state"), proj])
        ext = pd.concat({"Sabah": ext}, names=["state", "period"])
        projections[key] = _allocate(Pb, ext, LAST_GDP, PROJ_YEARS, lam)
    # State-path uncertainty for total GDP: sd of annual log growth of the sector sum.
    ss = S.xs("Sabah", level="state").sum(axis=1)
    sd_total = float(np.log(ss).diff().loc[GROWTH_YEARS].std())

    out = {}
    official = g.wide("gdp_real")
    for d in sab:
        if d not in nowcast[now_years[0]].index:
            continue
        r = ratio.get(d, 1.0)
        off = [{"period": int(t), "value": float(v)} for t, v in official.loc[d].dropna().items()]
        now = []
        for t in now_years:
            p50 = float(nowcast[t].loc[d].sum() * r)
            lo, hi = q_at(t - LAST_GDP)
            now.append({"period": t, "p10": p50 * np.exp(lo), "p50": p50, "p90": p50 * np.exp(hi)})
        proj = {}
        for key in SCENARIOS:
            pts = []
            for t in PROJ_YEARS:
                p50 = float(projections[key][t].loc[d].sum() * r)
                lo, hi = q_at(t - LAST_GDP)
                extra = 1.2816 * sd_total * np.sqrt(t - NOWCAST_TO)  # z(0.9) * state path sd
                lo_t = -np.sqrt(lo ** 2 + extra ** 2)
                hi_t = np.sqrt(hi ** 2 + extra ** 2)
                pts.append({"period": t, "p10": p50 * np.exp(lo_t), "p50": p50,
                            "p90": p50 * np.exp(hi_t)})
            proj[key] = pts
        own = bt[(bt["lambda"] == lam) & (bt.district_id == d)]
        out[d] = {
            "unit": "RM million (2015 prices)", "official": off, "nowcast": now,
            "projection": proj,
            "backtest": {"abs_pct_error_by_h": {int(r.h): float(100 * (np.exp(abs(r.log_err)) - 1))
                                               for r in own.itertuples()}},
        }

    def mape(frame):
        return {int(h): float(100 * np.median(np.exp(np.abs(e)) - 1))
                for h, e in frame.groupby("h").log_err}

    naive = bt[bt["lambda"] == -1.0]
    mix = bt[bt["lambda"] == 0.0]
    reg = districts()
    card = {
        "lambda": lam,
        "lambda_grid": {float(k): float(v) for k, v in bt[(bt.state != "Sabah") & (bt["lambda"] >= 0)]
                        .groupby("lambda").log_err.apply(lambda e: np.median(np.abs(e))).items()},
        "median_ape_by_horizon": {
            "chosen_model_national": mape(chosen), "chosen_model_sabah_loso": mape(
                chosen[chosen.state == "Sabah"]),
            "industry_mix_only_national": mape(mix), "naive_constant_share_national": mape(naive),
        },
        "median_ape_by_division_h3": {
            div: float(100 * np.median(np.exp(np.abs(
                chosen[(chosen.h == 3) & chosen.district_id.map(reg.division).eq(div)].log_err)) - 1))
            for div in ["West Coast", "Interior", "Kudat", "Sandakan", "Tawau"]},
        "conformal_log_quantiles": {int(h): list(v) for h, v in q.items()},
        "calibration_group": sorted(CAL_GROUP),
        "sabah_coverage_out_of_sample": loso_cov,
        "state_path_log_sd": sd_total,
        "scenarios": {k: {kk: vv for kk, vv in v.items()} for k, v in SCENARIOS.items()},
    }
    return out, card


# ------------------------------------------------------------- income ----
def _state_income(g: Gold) -> pd.DataFrame:
    s = g.state[g.state.indicator == "income_median"]
    return s.pivot_table(index="state", columns="period", values="value")


def _state_trend(si: pd.DataFrame, state: str, upto: int, years: int = 10) -> float:
    s = si.loc[state].dropna()
    s = s[s.index <= upto]
    s = s[s.index >= upto - years]
    if 2020 in s.index and len(s) > 3:
        s = s.drop(2020)  # the 2020 special round reflects the pandemic shock
    x, y = np.array(s.index, float), np.log(s.values)
    return float(np.polyfit(x, y, 1)[0])


def income_forecast(g: Gold) -> tuple[dict, dict]:
    w = g.wide("income_median")
    si = _state_income(g)
    reg = districts()
    units = [u for u in modelling_units() if u in w.index]
    flags24 = g.flag("income_median", 2024)

    def predict(d: str, T: int, prev: int | None, h: int, rho: float, upto: int) -> float | None:
        state = reg.loc[d, "state"]
        if state not in si.index or T not in w.columns or pd.isna(w.loc[d, T]):
            return None
        gs = _state_trend(si, state, upto)
        r = 0.0
        if prev is not None and prev in w.columns and not pd.isna(w.loc[d, prev]) and \
                prev in si.columns and T in si.columns:
            yrs = T - prev
            r = (np.log(w.loc[d, T] / w.loc[d, prev]) - np.log(si.loc[state, T] /
                                                              si.loc[state, prev])) / yrs
        return float(np.log(w.loc[d, T]) + h * (gs + rho * r))

    rows = []
    for rho in RHOS:
        for d in units:  # inputs to 2022, predict 2024 (h=2)
            p = predict(d, 2022, 2019, 2, rho, 2022)
            if p is not None and not pd.isna(w.loc[d].get(2024)):
                rows.append({"rho": rho, "h": 2, "district_id": d,
                             "log_err": float(np.log(w.loc[d, 2024]) - p)})
    for d in units:  # inputs to 2019, predict 2022 (h=3), no district history before 2019
        p = predict(d, 2019, None, 3, 0.0, 2019)
        if p is not None and not pd.isna(w.loc[d].get(2022)):
            rows.append({"rho": None, "h": 3, "district_id": d,
                         "log_err": float(np.log(w.loc[d, 2022]) - p)})
    bt = pd.DataFrame(rows)
    bt["state"] = bt.district_id.map(reg.state)
    h2 = bt[bt.h == 2]
    grid = h2[h2.state != "Sabah"].groupby("rho").log_err.apply(lambda e: np.median(np.abs(e)))
    rho = float(grid.idxmin())
    chosen = h2[h2.rho == rho]
    q2 = _conformal(chosen[chosen.state.isin(CAL_GROUP)].log_err)
    # The only h=3 backtest (2019 -> 2022) spans the pandemic; it is reported, not used.
    q = {h: (q2[0] * np.sqrt(h / 2), q2[1] * np.sqrt(h / 2)) for h in (1, 2, 3)}
    lo_o, hi_o = _conformal(chosen[chosen.state != "Sabah"].log_err)
    e_s = chosen[chosen.state == "Sabah"].log_err
    loso_cov = float(((e_s >= lo_o) & (e_s <= hi_o)).mean())

    out = {}
    for d in sabah_ids():
        if d not in w.index or pd.isna(w.loc[d].get(2024)):
            continue
        broken = isinstance(flags24.get(d), str)
        prev = None if broken else 2022
        off = [{"period": int(t), "value": float(v)} for t, v in w.loc[d].dropna().items()]
        pts = []
        for h in (1, 2, 3):
            lp = predict(d, 2024, prev, h, rho, 2024)
            p50 = float(np.exp(lp))
            pts.append({"period": 2024 + h, "p10": p50 * np.exp(q[h][0]), "p50": p50,
                        "p90": p50 * np.exp(q[h][1])})
        own = h2[(h2.rho == rho) & (h2.district_id == d)]
        out[d] = {
            "unit": "RM / month (nominal)", "official": off, "nowcast": [],
            "projection": {"baseline": pts},
            "backtest": {"abs_pct_error_by_h": {2: float(100 * (np.exp(abs(own.log_err.iloc[0])) - 1))}
                         if len(own) else {}},
            "notes": (["Boundary change in 2024 (Membakut): the district's own trend is not "
                       "used; projection follows the Sabah trend."] if broken else []),
        }

    def mape(e):
        return float(100 * np.median(np.exp(np.abs(e)) - 1))

    card = {
        "rho": rho, "rho_grid": {float(k): float(v) for k, v in grid.items()},
        "median_ape": {
            "h2_national": mape(h2[h2.rho == rho].log_err),
            "h2_sabah_loso": mape(h2[(h2.rho == rho) & (h2.state == "Sabah")].log_err),
            "h2_state_trend_only_national": mape(h2[h2.rho == 0.0].log_err),
            "h3_state_trend_only_national": mape(bt[bt.h == 3].log_err),
            "h3_sabah_loso": mape(bt[(bt.h == 3) & (bt.state == "Sabah")].log_err),
        },
        "conformal_log_quantiles": {h: list(v) for h, v in q.items()},
        "calibration_group": sorted(CAL_GROUP),
        "sabah_coverage_out_of_sample_h2": loso_cov,
    }
    return out, card


def fit(g: Gold) -> dict:
    gdp, gdp_card = gdp_forecast(g)
    inc, inc_card = income_forecast(g)
    per = {}
    for d in set(gdp) | set(inc):
        per[d] = {"indicators": {}}
        if d in gdp:
            per[d]["indicators"]["gdp_real"] = gdp[d]
        if d in inc:
            per[d]["indicators"]["income_median"] = inc[d]
    mv = version("forecast", {"gdp": gdp_card, "income": inc_card})
    card = {
        "model_version": mv, "task": "forecast", "title": "Nowcasts and projections",
        "method": __doc__.strip(), "gdp": gdp_card, "income": inc_card,
        "interval": "80% (p10–p90), split-conformal from leave-one-state-out backtests",
        "limitations": [
            "District GDP after 2020 is not published; 2021–2025 values are nowcasts built "
            "from published state sector growth, not observations.",
            "Backtests cover horizons 1–3; wider horizons scale the interval by sqrt(h).",
            "Intervals are calibrated on East Malaysian districts (Mondrian conformal). With "
            "27 Sabah districts, out-of-sample coverage estimates are noisy (about ±8 points).",
            "Income projections are nominal and rest on one backtest round; treat as indicative.",
            "Scenarios are transparent sensitivities, not predictions of commodity prices.",
            "Night-lights nowcasting (NASA Black Marble) is not yet included; it needs a NASA "
            "Earthdata token.",
        ],
    }
    return {"model_version": mv, "per_district": per, "card": card}
