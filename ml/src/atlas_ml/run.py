"""Fit every analytics layer and write gold/analytics.parquet + model_cards.json."""

from __future__ import annotations

import json
import warnings

import pandas as pd

from atlas_core.settings import get_settings
from atlas_ml import drivers, forecast, scorecard, shiftshare, typology
from atlas_ml.common import Gold, clean


def run_all() -> dict:
    warnings.filterwarnings("ignore", category=UserWarning)
    g = Gold.load()
    typ = typology.fit(g)
    layers = {
        "typology": typ,
        "shift_share": shiftshare.fit(g),
        "scorecard": scorecard.fit(g, typ["per_district"]),
        "drivers": drivers.fit(g),
        "forecast": forecast.fit(g),
    }
    rows = []
    for kind, res in layers.items():
        for did, payload in res["per_district"].items():
            rows.append({"district_id": did, "kind": kind,
                         "payload": json.dumps(clean(payload), ensure_ascii=False),
                         "model_version": res["model_version"]})
    gold = get_settings().gold
    an = pd.DataFrame(rows)
    an.to_parquet(gold / "analytics.parquet", index=False)
    cards = [clean(res["card"]) for res in layers.values()]
    (gold / "model_cards.json").write_text(json.dumps(cards, indent=2, ensure_ascii=False))
    typ["pca"].reset_index().to_parquet(gold / "typology_national.parquet", index=False)
    typ["features"].reset_index().to_parquet(gold / "typology_features.parquet", index=False)
    return {k: {"model_version": v["model_version"], "districts": len(v["per_district"])}
            for k, v in layers.items()}
