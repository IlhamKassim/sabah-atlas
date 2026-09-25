"""Read queries. Pure functions of the loaded data release."""

from __future__ import annotations

from collections import defaultdict

from atlas_api.db import fetch, fetch_one

DISTRICT_COLS = ("id, slug, display_name AS name, state, division, kind, parent_id, "
                 "first_period, note, area_km2, lon, lat")


def release() -> dict | None:
    return fetch_one("SELECT version, content_hash, created_at, manifest FROM release "
                     "ORDER BY created_at DESC LIMIT 1")


def sources() -> list[dict]:
    return fetch("SELECT id, publisher, dataset_id, title, url, download_url, licence, "
                 "last_updated, data_as_of, retrieved_at, caveat FROM source ORDER BY id")


def indicators() -> list[dict]:
    return fetch("SELECT i.*, (SELECT array_agg(DISTINCT period ORDER BY period) FROM observation o "
                 "WHERE o.indicator_code=i.code) AS periods FROM indicator i ORDER BY category, code")


def resolve_district(key: str) -> dict | None:
    return fetch_one(f"SELECT {DISTRICT_COLS} FROM district WHERE id=%s OR slug=%s", (key, key))


def districts(scope: str) -> list[dict]:
    where = {"sabah": "state='Sabah' AND kind<>'supra'", "national": "kind<>'supra'",
             "all": "true"}[scope]
    rows = fetch(f"SELECT {DISTRICT_COLS} FROM district WHERE {where} ORDER BY state, name")
    headline = fetch(
        """SELECT DISTINCT ON (district_id, indicator_code) district_id, indicator_code, period,
                  value, pct_sabah
           FROM observation
           WHERE indicator_code IN ('income_median','poverty_absolute','population','gdp_per_capita')
           ORDER BY district_id, indicator_code, period DESC""")
    by = defaultdict(dict)
    for h in headline:
        by[h["district_id"]][h["indicator_code"]] = {
            "value": h["value"], "period": h["period"], "pct_sabah": h["pct_sabah"]}
    for r in rows:
        r["headline"] = by.get(r["id"], {})
    return rows


def indicator_values(code: str, period: int | None, scope: str) -> dict | None:
    ind = fetch_one("SELECT * FROM indicator WHERE code=%s", (code,))
    if not ind:
        return None
    periods = [r["period"] for r in fetch(
        "SELECT DISTINCT period FROM observation WHERE indicator_code=%s ORDER BY period", (code,))]
    if period is None:
        period = periods[-1] if periods else None
    state_filter = "AND d.state='Sabah'" if scope == "sabah" else ""
    values = fetch(
        f"""SELECT o.district_id, d.slug, d.display_name AS name, d.division, o.value,
                   o.quality_flag, o.rank_sabah, o.n_sabah, o.pct_sabah, o.pct_national,
                   o.source_id, o.is_modelled
            FROM observation o JOIN district d ON d.id=o.district_id
            WHERE o.indicator_code=%s AND o.period=%s AND d.kind<>'supra' {state_filter}
            ORDER BY o.value DESC""", (code, period))
    src_ids = sorted({v["source_id"] for v in values})
    return {"indicator": ind, "period": period, "periods": periods, "values": values,
            "sources": [s for s in sources() if s["id"] in src_ids]}


def series(district_ids: list[str], codes: list[str] | None = None) -> list[dict]:
    q = ("SELECT district_id, indicator_code, period, value, quality_flag, rank_sabah, n_sabah, "
         "pct_sabah, pct_national, source_id, is_modelled FROM observation "
         "WHERE district_id = ANY(%s)")
    params: list = [district_ids]
    if codes:
        q += " AND indicator_code = ANY(%s)"
        params.append(codes)
    return fetch(q + " ORDER BY indicator_code, period", tuple(params))


def analytics(district_id: str) -> dict:
    rows = fetch("SELECT kind, payload, model_version FROM analytics WHERE district_id=%s",
                 (district_id,))
    return {r["kind"]: {**r["payload"], "model_version": r["model_version"]} for r in rows}


def gdp_sectors(district_id: str) -> list[dict]:
    return fetch("SELECT period, sector, value FROM gdp_sector WHERE district_id=%s "
                 "ORDER BY period, sector", (district_id,))


def profile(key: str) -> dict | None:
    d = resolve_district(key)
    if not d:
        return None
    rows = series([d["id"]])
    by_ind: dict[str, list] = defaultdict(list)
    for r in rows:
        by_ind[r.pop("indicator_code")].append(r)
    src_ids = sorted({r["source_id"] for rs in by_ind.values() for r in rs})
    children = fetch(f"SELECT {DISTRICT_COLS} FROM district WHERE parent_id=%s", (d["id"],))
    return {
        "district": d,
        "children": children,
        "indicators": {k: sorted(v, key=lambda r: r["period"]) for k, v in by_ind.items()},
        "gdp_sectors": gdp_sectors(d["id"]),
        "analytics": analytics(d["id"]),
        "sources": [s for s in sources() if s["id"] in src_ids or s["id"] == "derived"],
    }


def compare(ids: list[str]) -> dict:
    ds = [resolve_district(i) for i in ids]
    ds = [d for d in ds if d]
    rows = series([d["id"] for d in ds])
    matrix: dict[str, dict] = defaultdict(lambda: defaultdict(list))
    for r in rows:
        matrix[r.pop("indicator_code")][r.pop("district_id")].append(r)
    return {"districts": ds, "series": matrix,
            "analytics": {d["id"]: analytics(d["id"]) for d in ds}}


def model_cards() -> list[dict]:
    return [r["card"] for r in fetch("SELECT card FROM model_card ORDER BY model_version")]
