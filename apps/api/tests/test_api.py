import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from atlas_api.main import app
    c = TestClient(app)
    try:
        c.get("/v1/meta")
    except Exception:
        pytest.skip("database not available")
    return c


def test_districts_contract(client):
    r = client.get("/v1/districts")
    assert r.status_code == 200
    d = r.json()
    assert len([x for x in d if x["kind"] == "district"]) == 27
    assert {"id", "slug", "name", "division", "headline"} <= set(d[0])


def test_indicator_values_carry_sources(client):
    r = client.get("/v1/indicators/income_median")
    body = r.json()
    assert body["period"] == max(body["periods"])
    assert body["sources"] and all(v["source_id"] for v in body["values"])


def test_profile_has_analytics(client):
    p = client.get("/v1/districts/pitas").json()
    assert set(p["analytics"]) == {"typology", "shift_share", "scorecard", "drivers", "forecast"}


def test_etag_roundtrip(client):
    r = client.get("/v1/districts/pitas")
    etag = r.headers.get("etag")
    assert etag
    assert client.get("/v1/districts/pitas", headers={"If-None-Match": etag}).status_code == 304


def test_unknown_district_404(client):
    assert client.get("/v1/districts/atlantis").status_code == 404


def test_compare_caps_at_four(client):
    r = client.get("/v1/compare?ids=pitas,kudat,tongod,ranau,tenom").json()
    assert len(r["districts"]) == 4
