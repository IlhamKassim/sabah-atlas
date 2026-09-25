import json

import pandas as pd
import pytest

from atlas_core.settings import get_settings


@pytest.fixture(scope="module")
def analytics():
    p = get_settings().gold / "analytics.parquet"
    if not p.exists():
        pytest.skip("analytics not built")
    an = pd.read_parquet(p)
    an["payload"] = an.payload.map(json.loads)
    return an


def test_shift_share_identity(analytics):
    for p in analytics[analytics.kind == "shift_share"].payload:
        for w in p["windows"]:
            t = w["total"]
            assert t["benchmark_effect"] + t["industry_mix"] + t["competitive"] == pytest.approx(
                t["change"], abs=1e-4)


def test_forecast_intervals_ordered(analytics):
    for p in analytics[analytics.kind == "forecast"].payload:
        for s in p["indicators"].values():
            pts = s["nowcast"] + [x for v in s["projection"].values() for x in v]
            for x in pts:
                assert x["p10"] <= x["p50"] <= x["p90"]


def test_every_sabah_district_has_all_layers(analytics):
    sab = analytics[analytics.district_id.str.startswith("sbh-")]
    kinds = sab.groupby("district_id").kind.apply(set)
    full = {"typology", "shift_share", "scorecard", "drivers", "forecast"}
    assert (kinds == full).sum() == 27


def test_peers_exclude_self(analytics):
    for r in analytics[analytics.kind == "typology"].itertuples():
        assert r.district_id not in [p["district_id"] for p in r.payload["peers"]]
