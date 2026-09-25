"""6.3 Typology and structural peers.

Standardised structural + welfare features for every national district, reduced
with PCA, clustered with k-means (k by silhouette within an interpretable range),
named by transparent rules on the cluster centroids. Structural peers are the
nearest neighbours in PCA space. Positive deviance: among a district's nearest
neighbours, the one whose welfare improved most, and where it differs.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from atlas_ml.common import SEED, Gold, modelling_units, version

# (feature name, indicator, transform, max_period)
FEATURES = [
    ("log_income_median", "income_median", "log", None),
    ("log_gdp_per_capita", "gdp_per_capita", "log", None),
    ("share_agriculture", "share_agriculture", "sqrt", 2020),
    ("share_mining", "share_mining", "sqrt", 2020),
    ("share_manufacturing", "share_manufacturing", "sqrt", 2020),
    ("share_services", "share_services", "sqrt", 2020),
    ("log_pop_density", "pop_density", "log", 2020),
    ("share_age_65plus", "share_age_65plus", None, 2020),
    ("lfpr", "lfpr", None, None),
    ("access_piped_water", "access_piped_water", None, None),
]
LABELS = {
    "log_income_median": "median income", "poverty_absolute": "poverty rate",
    "gini": "inequality", "log_gdp_per_capita": "GDP per capita",
    "share_agriculture": "agriculture share", "share_mining": "mining share",
    "share_manufacturing": "manufacturing share", "share_services": "services share",
    "log_pop_density": "population density", "share_age_65plus": "share aged 65+",
    "lfpr": "labour force participation", "unemployment_rate": "unemployment",
    "access_piped_water": "piped-water access",
}
K_RANGE = range(6, 10)
SIL_TOLERANCE = 0.01  # prefer the smallest k within this of the best silhouette
N_PEERS = 5


def feature_matrix(g: Gold) -> tuple[pd.DataFrame, pd.DataFrame]:
    units = modelling_units()
    cols = {}
    for name, code, tf, maxp in FEATURES:
        s = g.latest(code, maxp).reindex(units)
        cols[name] = {"log": np.log, "sqrt": np.sqrt}.get(tf, lambda v: v)(s)
    X = pd.DataFrame(cols)
    imputed = X.isna()
    X = X.fillna(X.median())  # LFS omits single-district states; recorded in the model card
    return X, imputed


def name_clusters(centroids: pd.DataFrame) -> dict[int, str]:
    """Rule-based names from centroid z-scores. Rules are checked in order and published
    on /methodology; a repeated name gets a numeric suffix."""
    rules = [
        (lambda z: z.log_pop_density > 1.0 and z.log_income_median > 1.0,
         "Metropolitan & industrial core"),
        (lambda z: z.access_piped_water < -1.0, "Remote interior, low service access"),
        (lambda z: z.share_mining > 1.0, "Rural economy with mining & quarrying"),
        (lambda z: z.share_agriculture > 0.7 and z.share_age_65plus > 0.8,
         "Ageing agricultural heartland"),
        (lambda z: z.share_agriculture > 0.7, "Plantation & agrarian frontier"),
        (lambda z: z.share_manufacturing > 1.0, "Industrial district"),
        (lambda z: z.share_services > 0.3, "Services-led towns & suburbs"),
    ]
    names: dict[int, str] = {}
    used: set[str] = set()
    for c in centroids.index:
        z = centroids.loc[c]
        n = next((label for rule, label in rules if rule(z)), "Rural mixed economy")
        base, i = n, 2
        while n in used:
            n = f"{base} ({i})"
            i += 1
        used.add(n)
        names[int(c)] = n
    return names


def fit(g: Gold) -> dict:
    X, imputed = feature_matrix(g)
    scaler = StandardScaler().fit(X)
    Z = pd.DataFrame(scaler.transform(X), index=X.index, columns=X.columns)
    pca = PCA(n_components=0.85, random_state=SEED).fit(Z)
    P = pd.DataFrame(pca.transform(Z), index=Z.index)

    sil = {}
    models = {}
    for k in K_RANGE:
        km = KMeans(n_clusters=k, n_init=50, random_state=SEED).fit(P)
        sil[k] = float(silhouette_score(P, km.labels_))
        models[k] = km
    best = max(sil.values())
    k = min(k for k, v in sil.items() if v >= best - SIL_TOLERANCE)
    km = models[k]
    labels = pd.Series(km.labels_, index=P.index)
    centroids = Z.groupby(labels).mean()
    names = name_clusters(centroids)

    # Peers: nearest neighbours in PCA space.
    D = pd.DataFrame(np.linalg.norm(P.values[:, None, :] - P.values[None, :, :], axis=2),
                     index=P.index, columns=P.index)

    income = g.wide("income_median")
    poverty = g.wide("poverty_absolute")

    def improvement(did: str) -> float | None:
        # Welfare momentum 2019 -> latest: income CAGR minus poverty change (pp/yr).
        try:
            i0, i1 = income.loc[did, 2019], income.loc[did].dropna().iloc[-1]
            p0, p1 = poverty.loc[did, 2019], poverty.loc[did].dropna().iloc[-1]
            years = income.loc[did].dropna().index[-1] - 2019
        except KeyError:
            return None
        if not years or np.isnan(i0) or np.isnan(p0):
            return None
        return float(100 * ((i1 / i0) ** (1 / years) - 1) - (p1 - p0) / years)

    per_district = {}
    for did in P.index:
        near = D.loc[did].drop(did).sort_values()
        peers = [{"district_id": p, "distance": float(near[p]),
                  "cluster": names[int(labels[p])]} for p in near.index[:N_PEERS]]
        own = improvement(did)
        cands = [(p, improvement(p)) for p in near.index[:10]]
        cands = [(p, v) for p, v in cands if v is not None]
        deviant = None
        if own is not None and cands:
            best, v = max(cands, key=lambda t: t[1])
            if v > own:
                # What differed: structural features only (median income is the outcome).
                diff = (Z.loc[best] - Z.loc[did]).drop("log_income_median")
                top = diff.abs().sort_values(ascending=False).index[:3]
                deviant = {
                    "district_id": best, "improvement": v, "own_improvement": own,
                    "differences": [{"feature": LABELS[f], "z_diff": float(diff[f]),
                                     "peer_value": float(X.loc[best, f]),
                                     "own_value": float(X.loc[did, f]), "key": f} for f in top],
                }
        per_district[did] = {
            "cluster_id": int(labels[did]), "cluster": names[int(labels[did])],
            "peers": peers, "positive_deviant": deviant,
            "coords": [float(P.loc[did, 0]), float(P.loc[did, 1])],
            "imputed": [LABELS[c] for c in X.columns if imputed.loc[did, c]],
        }

    mv = version("typology", X)
    clusters = []
    for c, n in names.items():
        members = labels[labels == c].index
        z = centroids.loc[c]
        clusters.append({
            "cluster_id": c, "name": n, "size": int(len(members)),
            "sabah_members": [m for m in members if m.startswith("sbh-")],
            "profile": {LABELS[f]: float(z[f]) for f in X.columns},
        })
    card = {
        "model_version": mv, "task": "typology",
        "title": "District typology and structural peers",
        "method": ("Standardised features -> PCA (85% variance) -> k-means (n_init=50, "
                   f"seed {SEED}); k chosen by silhouette over {list(K_RANGE)}; peers are the "
                   f"{N_PEERS} nearest districts in PCA space; names assigned by published rules "
                   "on centroid z-scores."),
        "features": [{"name": LABELS[f], "indicator": c, "transform": t, "period_cap": p}
                     for f, c, t, p in FEATURES],
        "training_units": len(X), "k": k, "silhouette": sil,
        "pca_components": int(pca.n_components_),
        "explained_variance": [float(v) for v in pca.explained_variance_ratio_],
        "clusters": clusters,
        "imputation": {LABELS[c]: int(imputed[c].sum()) for c in X.columns if imputed[c].any()},
        "limitations": [
            "Features mix survey rounds (HIES 2024, LFS 2024) with GDP structure from 2020, the "
            "latest district GDP DOSM publishes.",
            "W.P. Putrajaya is excluded because DOSM reports its GDP inside Kuala Lumpur.",
            "Districts gazetted after 2020 (e.g. Membakut) have no GDP series and are not typed.",
            "Missing labour-force values for single-district states are median-imputed.",
            "Cluster names are descriptive labels generated by fixed rules, not judgements.",
        ],
    }
    return {"model_version": mv, "per_district": per_district, "card": card,
            "pca": P.iloc[:, :2].rename(columns={0: "pc1", 1: "pc2"}).assign(
                cluster=labels.map(names)), "features": X}
