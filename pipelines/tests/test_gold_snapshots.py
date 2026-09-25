"""Snapshot tests: a pipeline change must not silently shift published figures.

Values are DOSM's own published numbers; update only with a new source vintage and
a changelog entry.
"""

import pytest

from atlas_core.registry import sabah_districts

SNAPSHOTS = [
    ("sbh-pitas", "income_median", 2022, 2329.0),       # lowest district nationally in 2022
    ("sbh-pitas", "income_median", 2024, 2785.0),
    ("sbh-kota-kinabalu", "income_median", 2024, 5896.0),
    ("sbh-pitas", "poverty_absolute", 2024, 50.0),
    ("sbh-tongod", "income_median", 2024, 3470.0),
]


@pytest.mark.parametrize("did,code,period,value", SNAPSHOTS)
def test_published_value_snapshot(gold, did, code, period, value):
    row = gold[(gold.district_id == did) & (gold.indicator == code) & (gold.period == period)]
    assert len(row) == 1
    assert row.value.iloc[0] == pytest.approx(value)


def test_pitas_lowest_nationally_2022(gold):
    x = gold[(gold.indicator == "income_median") & (gold.period == 2022)]
    assert x.sort_values("value").district_id.iloc[0] == "sbh-pitas"


def test_every_value_has_source_and_period(gold):
    assert gold.source_id.notna().all()
    assert gold.period.notna().all()


def test_boundary_breaks_flagged(gold):
    b = gold[(gold.district_id == "sbh-beaufort") & (gold.indicator == "income_median") &
             (gold.period == 2024)]
    assert "excludes Membakut" in b.quality_flag.iloc[0]
    t = gold[(gold.district_id == "sbh-tawau") & (gold.indicator == "income_median") &
             (gold.period == 2019)]
    assert "includes Kalabakan" in t.quality_flag.iloc[0]


def test_sabah_percentiles_direction_aware(gold):
    pov = gold[(gold.indicator == "poverty_absolute") & (gold.period == 2024) &
               gold.district_id.isin(sabah_districts().district_id)]
    worst = pov.sort_values("value").iloc[-1]
    assert worst.pct_sabah == 0 and worst.rank_sabah == worst.n_sabah
