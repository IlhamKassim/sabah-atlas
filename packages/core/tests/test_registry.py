import pytest

from atlas_core.catalog import indicators, sources
from atlas_core.registry import (
    UnknownDistrictError,
    districts,
    national_districts,
    resolve,
    sabah_districts,
)


def test_exactly_27_sabah_districts_in_five_divisions():
    s = sabah_districts()
    assert len(s) == 27
    assert s.division.value_counts().to_dict() == {
        "West Coast": 7, "Interior": 7, "Sandakan": 5, "Tawau": 5, "Kudat": 3}


def test_160_national_units():
    assert len(national_districts()) == 160
    assert districts().district_id.is_unique


@pytest.mark.parametrize("state,name,expected", [
    ("Sabah", "KOTA KINABALU", "sbh-kota-kinabalu"),
    ("Sabah", "K. Kinabalu", "sbh-kota-kinabalu"),
    ("Sabah", "Nabawan / Persiangan", "sbh-nabawan"),
    ("Pulau Pinang", "S.P.Utara", "png-seberang-perai-utara"),
    ("Perak", "Larut & Matang", "prk-larut-dan-matang"),
    ("Sabah", "Membakut", "sbh-membakut"),
])
def test_alias_resolution(state, name, expected):
    assert resolve(state, name) == expected


def test_unknown_name_fails_loudly():
    with pytest.raises(UnknownDistrictError):
        resolve("Sabah", "Atlantis")


def test_same_name_different_state_is_not_confused():
    with pytest.raises(UnknownDistrictError):
        resolve("Johor", "Kota Kinabalu")


def test_catalogue_is_consistent():
    ind = indicators()
    srcs = set(sources()) | {"derived"}
    assert all(i.source in srcs for i in ind.values())
    for i in ind.values():
        assert all(d in ind for d in i.derived_from)
