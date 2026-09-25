"""6.4 Driver analysis: which structural factors are *associated with* a district
sitting above or below what its structure would predict.

A ridge regression and a small gradient-boosted model (LightGBM) predict log median income and the
absolute poverty rate from structural features across all national districts
and survey rounds (2019, 2022, 2024). Cross-validation is grouped by district so a
district is never scored by a model that saw it. LightGBM is used only if its CV
error is at least 5% below ridge's; attributions are SHAP values (LightGBM) or exact
linear contributions (ridge). Always labelled associations, never causes.
"""

from __future__ import annotations

import lightgbm as lgb
import numpy as np
import pandas as pd
import shap
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from atlas_ml.common import SEED, Gold, modelling_units, sabah_ids, version

ROUNDS = [2019, 2022, 2024]
FEATURE_LABELS = {
    "sqrt_share_agriculture": "Agriculture share of GDP",
    "sqrt_share_mining": "Mining share of GDP",
    "sqrt_share_manufacturing": "Manufacturing share of GDP",
    "sqrt_share_services": "Services share of GDP",
    "log_gdp_per_capita": "GDP per capita (2020)",
    "log_pop_density": "Population density",
    "share_age_65plus": "Share aged 65+",
    "lfpr": "Labour force participation",
    "unemployment_rate": "Unemployment rate",
    "access_piped_water": "Piped-water access",
    "access_electricity": "Electricity access",
    "round": "Survey round",
}
TARGETS = {
    "income_median": {"label": "Median household income", "transform": "log"},
    "poverty_absolute": {"label": "Absolute poverty rate", "transform": None},
}
CHALLENGER_MARGIN = 0.05
PARAMS = dict(n_estimators=400, learning_rate=0.03, num_leaves=7, min_child_samples=12,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
              random_state=SEED, verbose=-1)


def _nearest(w: pd.DataFrame, year: int) -> pd.Series:
    """Value at `year` if present, else the closest earlier period, else the closest later."""
    cols = sorted(w.columns)
    earlier = [c for c in cols if c <= year]
    order = list(reversed(earlier)) + [c for c in cols if c > year]
    out = pd.Series(np.nan, index=w.index)
    for c in order:
        out = out.fillna(w[c])
    return out


def panel(g: Gold) -> pd.DataFrame:
    units = modelling_units()
    rows = []
    for yr in ROUNDS:
        f = pd.DataFrame(index=pd.Index(units, name="district_id"))
        for sec in ["agriculture", "mining", "manufacturing", "services"]:
            f[f"sqrt_share_{sec}"] = np.sqrt(_nearest(g.wide(f"share_{sec}"), min(yr, 2020)))
        f["log_gdp_per_capita"] = np.log(g.latest("gdp_per_capita"))
        f["log_pop_density"] = np.log(_nearest(g.wide("pop_density"), yr))
        f["share_age_65plus"] = _nearest(g.wide("share_age_65plus"), yr)
        for c in ["lfpr", "unemployment_rate", "access_piped_water", "access_electricity"]:
            f[c] = _nearest(g.wide(c), yr)
        f["round"] = yr
        for t in TARGETS:
            w = g.wide(t)
            f[f"y_{t}"] = w[yr] if yr in w.columns else np.nan
        rows.append(f.reindex(units).reset_index())
    return pd.concat(rows, ignore_index=True)


def fit(g: Gold) -> dict:
    df = panel(g)
    feats = list(FEATURE_LABELS)
    results: dict[str, dict] = {}
    cards = {}
    for target, meta in TARGETS.items():
        d = df.dropna(subset=[f"y_{target}"]).reset_index(drop=True)
        y = d[f"y_{target}"]
        y_t = np.log(y) if meta["transform"] == "log" else y
        X = d[feats]
        groups = d.district_id
        oof = np.zeros(len(d))
        oof_ridge = np.zeros(len(d))
        for tr, te in GroupKFold(n_splits=5).split(X, y_t, groups):
            m = lgb.LGBMRegressor(**PARAMS).fit(X.iloc[tr], y_t.iloc[tr])
            oof[te] = m.predict(X.iloc[te])
            rd = make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 3, 20)))
            Xr = X.fillna(X.median())
            rd.fit(Xr.iloc[tr], y_t.iloc[tr])
            oof_ridge[te] = rd.predict(Xr.iloc[te])
        back = np.exp if meta["transform"] == "log" else (lambda v: v)
        pred, pred_r = back(oof), back(oof_ridge)
        metrics = {
            "lightgbm": {"r2": float(r2_score(y, pred)), "mae": float(mean_absolute_error(y, pred))},
            "ridge": {"r2": float(r2_score(y, pred_r)), "mae": float(mean_absolute_error(y, pred_r))},
            "n": int(len(d)), "districts": int(groups.nunique()),
        }
        sab = d.district_id.str.startswith("sbh-")
        metrics["lightgbm"]["mae_sabah"] = float(mean_absolute_error(y[sab], pred[sab]))
        metrics["ridge"]["mae_sabah"] = float(mean_absolute_error(y[sab], pred_r[sab]))

        # Champion rule: the boosted model must beat ridge's CV MAE by >= 5% to be used.
        use_gbm = metrics["lightgbm"]["mae"] <= (1 - CHALLENGER_MARGIN) * metrics["ridge"]["mae"]
        metrics["champion"] = "lightgbm" if use_gbm else "ridge"
        champ_pred = pred if use_gbm else pred_r
        if use_gbm:
            model = lgb.LGBMRegressor(**PARAMS).fit(X, y_t)
            explainer = shap.TreeExplainer(model)
            base = float(np.ravel(explainer.expected_value)[0])

            def attribute(rows: pd.DataFrame, explainer=explainer) -> np.ndarray:
                return explainer.shap_values(rows[feats])
        else:
            fill = X.median()
            rd = make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 3, 20)))
            rd.fit(X.fillna(fill), y_t)
            sc, lm = rd.named_steps["standardscaler"], rd.named_steps["ridgecv"]
            base = float(lm.intercept_)

            def attribute(rows: pd.DataFrame, sc=sc, lm=lm, fill=fill) -> np.ndarray:
                # Exact additive attributions for a linear model on standardised inputs.
                return sc.transform(rows[feats].fillna(fill)) * lm.coef_
        imp = pd.Series(np.abs(attribute(X)).mean(0), index=feats).sort_values(ascending=False)
        latest = d[sab].sort_values("round").groupby("district_id").tail(1)
        sv = attribute(latest)
        mae = metrics[metrics["champion"]]["mae"]
        for i, row in enumerate(latest.itertuples()):
            idx = latest.index[i]
            actual, expected = float(y[idx]), float(champ_pred[idx])
            contrib = sorted(
                [{"feature": FEATURE_LABELS[f], "key": f, "shap": float(sv[i, j]),
                  "value": None if pd.isna(row._asdict()[f]) else float(row._asdict()[f])}
                 for j, f in enumerate(feats) if f != "round"],
                key=lambda c: -abs(c["shap"]))
            resid = actual - expected
            direction = TARGETS[target]
            better = (resid > 0) if target == "income_median" else (resid < 0)
            results.setdefault(row.district_id, {})[target] = {
                "round": int(row.round), "actual": actual, "expected": expected,
                "residual": resid, "cv_mae": mae,
                "reading": ("within model error" if abs(resid) <= mae else
                            "better than structure predicts" if better else
                            "worse than structure predicts"),
                "base_value": base, "model": metrics["champion"],
                "shap_scale": "log" if meta["transform"] == "log" else "pp",
                "contributions": contrib[:6], "label": direction["label"],
            }
        cards[target] = {"metrics": metrics,
                         "importance": [{"feature": FEATURE_LABELS[f], "mean_abs_shap": float(v)}
                                        for f, v in imp.items()]}

    mv = version("drivers", df.drop(columns=["district_id"]))
    card = {
        "model_version": mv, "task": "drivers", "title": "Driver analysis (associated factors)",
        "method": __doc__.strip(), "features": FEATURE_LABELS, "params": PARAMS,
        "targets": cards,
        "limitations": [
            "Associations, not causes: SHAP explains the model, not the economy.",
            "About 480 district-rounds; with so few points the model is deliberately shallow.",
            "Sector structure and GDP per capita are fixed at 2020 for the 2022 and 2024 rounds.",
            "The non-citizen share is deliberately excluded as a feature.",
            "A district is flagged above/below expectations only when the gap exceeds the "
            "cross-validated mean absolute error.",
        ],
    }
    assert all(s in results for s in sabah_ids() if s != "sbh-membakut")
    return {"model_version": mv, "per_district": results, "card": card}
