"""One-off bootstrap of the canonical district registry.

Run once against freshly downloaded DOSM parquet + geoBoundaries ADM2, then the
generated CSVs are reviewed by hand and committed. After that the pipeline
never guesses: any district name it cannot resolve through `aliases.csv` is a
hard failure (see atlas_core.registry.resolve).

Usage: uv run python pipelines/scripts/bootstrap_registry.py <probe_dir>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "packages/core/src/atlas_core/reference"

STATE_CODES = {
    "Johor": "jhr", "Kedah": "kdh", "Kelantan": "ktn", "Melaka": "mlk",
    "Negeri Sembilan": "nsn", "Pahang": "phg", "Perak": "prk", "Perlis": "pls",
    "Pulau Pinang": "png", "Sabah": "sbh", "Sarawak": "swk", "Selangor": "sgr",
    "Terengganu": "trg", "W.P. Kuala Lumpur": "kul", "W.P. Labuan": "lbn",
    "W.P. Putrajaya": "pjy",
}

# Plan appendix A. Membakut was gazetted out of Beaufort and first appears in HIES 2024.
SABAH_DIVISIONS = {
    "West Coast": ["Kota Kinabalu", "Penampang", "Putatan", "Papar", "Tuaran", "Kota Belud", "Ranau"],
    "Interior": ["Keningau", "Tambunan", "Tenom", "Nabawan", "Beaufort", "Kuala Penyu", "Sipitang",
                 "Membakut"],
    "Kudat": ["Kudat", "Kota Marudu", "Pitas"],
    "Sandakan": ["Sandakan", "Beluran", "Kinabatangan", "Telupid", "Tongod"],
    "Tawau": ["Tawau", "Lahad Datu", "Semporna", "Kunak", "Kalabakan"],
}

# Districts that exist in some DOSM sources but have no polygon in the 2020
# boundary layer. `parent` is the district they were carved out of, where known.
SUCCESSORS = {
    ("Sabah", "Membakut"): ("Beaufort", "2024", "Gazetted from Beaufort; first reported in HIES 2024"),
    ("Sarawak", "Gedong"): (None, "2022", "New Sarawak district; parent not verified"),
    ("Sarawak", "Lingga"): (None, "2022", "New Sarawak district; parent not verified"),
    ("Sarawak", "Pantu"): (None, "2022", "New Sarawak district; parent not verified"),
    ("Sarawak", "Sebuyau"): (None, "2022", "New Sarawak district; parent not verified"),
    ("Sarawak", "Siburan"): (None, "2022", "New Sarawak district; parent not verified"),
}

# Hand-verified spelling variants: (state, variant) -> canonical GDP name.
MANUAL_ALIASES = {
    ("Pulau Pinang", "S.P. Selatan"): "Seberang Perai Selatan",
    ("Pulau Pinang", "S.P.Tengah"): "Seberang Perai Tengah",
    ("Pulau Pinang", "S.P.Utara"): "Seberang Perai Utara",
    ("Pulau Pinang", "Sp Selatan"): "Seberang Perai Selatan",
    ("Pulau Pinang", "Sp Tengah"): "Seberang Perai Tengah",
    ("Pulau Pinang", "Sp Utara"): "Seberang Perai Utara",
    ("Terengganu", "Hulu"): "Hulu Terengganu",
    ("Pahang", "Cameron Highland"): "Cameron Highlands",
    ("Perak", "Manjung (Dinding)"): "Manjung",
    ("Sarawak", "Tanjong Manis"): "Tanjung Manis",
    ("Selangor", "Hulu Langat"): "Ulu Langat",
    ("Selangor", "Hulu Selangor"): "Ulu Selangor",
    ("Perak", "Larut & Matang"): "Larut dan Matang",
    ("Perak", "Larut Dan Matang"): "Larut dan Matang",
    # geoBoundaries ADM2 (2020) names
    ("Johor", "Kulaijaya"): "Kulai",
    ("Johor", "Ledang"): "Tangkak",
    ("Sabah", "Nabawan / Persiangan"): "Nabawan",
    ("W.P. Kuala Lumpur", "Kuala Lumpur"): "W.P. Kuala Lumpur",
    ("W.P. Labuan", "Labuan"): "W.P. Labuan",
    # Plan / common usage
    ("Sabah", "K. Kinabalu"): "Kota Kinabalu",
    ("Sabah", "KK"): "Kota Kinabalu",
    ("Sabah", "Persiangan"): "Nabawan",
}

DISPLAY = {"W.P. Kuala Lumpur": "Kuala Lumpur", "W.P. Labuan": "Labuan", "W.P. Putrajaya": "Putrajaya"}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "dan")).strip("-")


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("&", "dan"))


def main(probe: Path) -> None:
    gdp = pd.read_parquet(probe / "gdp_district_real_supply.parquet")
    base = sorted(set(zip(gdp.state, gdp.district)))
    base = [(s, "Larut dan Matang" if n == "Larut Dan Matang" else n) for s, n in base]

    rows = []
    for state, name in base:
        code = STATE_CODES[state]
        kind = "supra" if name == "Supra" else "district"
        rows.append(dict(state=state, name=name, kind=kind, parent=None, first_period=None, note=None))
    # Putrajaya: a real territory, reported separately in HIES/population, subsumed into KL for GDP.
    rows.append(dict(state="W.P. Putrajaya", name="W.P. Putrajaya", kind="district", parent=None,
                     first_period=None, note="GDP subsumed under W.P. Kuala Lumpur by DOSM"))
    for (state, name), (parent, first, note) in SUCCESSORS.items():
        rows.append(dict(state=state, name=name, kind="successor", parent=parent, first_period=first,
                         note=note))

    reg = pd.DataFrame(rows)
    reg["state_code"] = reg.state.map(STATE_CODES)
    reg["display_name"] = reg.name.map(lambda n: DISPLAY.get(n, n))
    reg["district_id"] = reg.state_code + "-" + reg.display_name.map(slug)
    reg.loc[reg.kind == "supra", "display_name"] = reg.state + " offshore oil & gas (Supra)"
    div = {d: k for k, ds in SABAH_DIVISIONS.items() for d in ds}
    reg["division"] = [div.get(n) if s == "Sabah" else None for s, n in zip(reg.state, reg.name)]
    reg["parent_id"] = [
        (STATE_CODES[s] + "-" + slug(p)) if isinstance(p, str) else None
        for s, p in zip(reg.state, reg.parent)
    ]
    reg["slug"] = reg.display_name.map(slug)
    reg.loc[reg.kind == "supra", "slug"] = reg.state_code + "-supra"
    assert reg.district_id.is_unique, reg[reg.district_id.duplicated(keep=False)]

    sabah = reg[(reg.state == "Sabah") & (reg.kind == "district")]
    assert len(sabah) == 27, len(sabah)
    assert sabah.division.notna().all()

    # Aliases: every canonical name, its display name, and manual variants.
    by_name = {(r.state, r.name): r.district_id for r in reg.itertuples()}
    aliases = []
    for r in reg.itertuples():
        aliases += [(r.state, r.name, r.district_id), (r.state, r.display_name, r.district_id)]
    for (state, variant), canon in MANUAL_ALIASES.items():
        aliases.append((state, variant, by_name[(state, canon)]))
    al = pd.DataFrame(aliases, columns=["state", "alias", "district_id"]).drop_duplicates()
    al["alias_norm"] = al.alias.map(norm)
    clash = al.groupby(["state", "alias_norm"]).district_id.nunique()
    assert (clash == 1).all(), clash[clash > 1]

    # Verify every source resolves.
    lookup = {(s, a): d for s, a, d in zip(al.state, al.alias_norm, al.district_id)}
    for f in ["hh_income_district", "lfs_district", "population_district", "hh_access_amenities",
              "hies_district", "hh_poverty_district", "hh_inequality_district"]:
        d = pd.read_parquet(probe / f"{f}.parquet")
        pairs = set(zip(d.state, d.district)) - {(s, "All Districts") for s in STATE_CODES}
        missing = sorted(p for p in pairs if (p[0], norm(p[1])) not in lookup)
        assert not missing, (f, missing)
    gb = json.loads((probe / "gb_adm2.geojson").read_text())["features"]
    gb_names = [f["properties"]["shapeName"] for f in gb]
    gb_hits = {}
    for n in gb_names:
        hits = [d for (s, a), d in lookup.items() if a == norm(n)]
        assert len(set(hits)) == 1, (n, hits)
        gb_hits[n] = hits[0]
    reg["geo_name"] = reg.district_id.map({v: k for k, v in gb_hits.items()})
    no_geom = reg[(reg.kind == "district") & reg.geo_name.isna()]
    print("districts without polygon:", no_geom.district_id.tolist())

    cols = ["district_id", "slug", "state", "state_code", "name", "display_name", "kind",
            "division", "parent_id", "first_period", "geo_name", "note"]
    reg.sort_values(["state", "name"])[cols].to_csv(OUT / "districts.csv", index=False)
    al.sort_values(["state", "alias"])[["state", "alias", "district_id"]].to_csv(
        OUT / "aliases.csv", index=False)
    print(reg.kind.value_counts().to_dict(), "aliases:", len(al))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
