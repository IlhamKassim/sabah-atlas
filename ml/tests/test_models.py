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


def test_lights_tilt_keeps_state_totals():
    from atlas_ml.forecast import _lights_tilt

    ids = ["sbh-kota-kinabalu", "sbh-pitas", "sbh-supra", "swk-kuching", "swk-miri"]
    y = pd.Series([100.0, 10.0, 50.0, 80.0, 40.0], index=pd.Index(ids))
    L = pd.DataFrame({2017: [10.0, 1.0, None, 8.0, 4.0], 2019: [12.0, 1.0, None, 8.0, 6.0]}, index=ids)
    assert _lights_tilt(y, L, 2017, 2019, 0.0).equals(y)
    out = _lights_tilt(y, L, 2017, 2019, 0.5)
    for prefix in ("sbh-", "swk-"):
        m = [i for i in ids if i.startswith(prefix) and not i.endswith("supra")]
        assert out[m].sum() == pytest.approx(y[m].sum())
    assert out["sbh-supra"] == 50.0  # offshore output never tilted
    assert out["sbh-kota-kinabalu"] > 100.0 and out["swk-miri"] > 40.0  # brighter share grows


def test_lights_challenger_reported():
    p = get_settings().gold / "model_cards.json"
    if not p.exists():
        pytest.skip("models not built")
    fc = next(c for c in json.loads(p.read_text()) if c["task"] == "forecast")
    lc = fc["gdp"]["lights_challenger"]
    if not lc["available"]:
        pytest.skip("night lights not loaded")
    grid = lc["beta_grid"]
    # Adoption must follow the champion rule exactly.
    assert lc["adopted"] == (lc["best_beta"] > 0 and grid[str(lc["best_beta"])] <= 0.95 * grid["0.0"])
