"""Canonical district registry.

`districts.csv` and `aliases.csv` are hand-reviewed and committed. Resolution is
strict: an unknown (state, name) pair raises, because a silent mis-join is the
most common failure in Malaysian open data.
"""

from __future__ import annotations

import re
from functools import lru_cache
from importlib.resources import files

import pandas as pd

SABAH_DIVISIONS = ("West Coast", "Interior", "Kudat", "Sandakan", "Tawau")


class UnknownDistrictError(KeyError):
    pass


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("&", "dan"))


@lru_cache
def districts() -> pd.DataFrame:
    path = files("atlas_core") / "reference" / "districts.csv"
    df = pd.read_csv(path, dtype=str, keep_default_na=False).replace({"": None})
    return df.set_index("district_id", drop=False)


@lru_cache
def _alias_lookup() -> dict[tuple[str, str], str]:
    path = files("atlas_core") / "reference" / "aliases.csv"
    al = pd.read_csv(path, dtype=str)
    return {(s, _norm(a)): d for s, a, d in zip(al.state, al.alias, al.district_id, strict=True)}


def resolve(state: str, name: str) -> str:
    """Return the canonical district_id for a (state, district name) pair, or raise."""
    try:
        return _alias_lookup()[(state, _norm(name))]
    except KeyError:
        raise UnknownDistrictError(f"{state!r} / {name!r} is not in aliases.csv") from None


def resolve_frame(df: pd.DataFrame, state_col: str = "state", name_col: str = "district") -> pd.Series:
    """Vectorised resolve; raises listing *all* unknown pairs at once."""
    lookup = _alias_lookup()
    keys = list(zip(df[state_col], df[name_col].map(_norm), strict=True))
    unknown = sorted({(s, n) for (s, _), n in zip(keys, df[name_col], strict=True)
                      if (s, _norm(n)) not in lookup})
    if unknown:
        raise UnknownDistrictError(f"unresolved districts: {unknown}")
    return pd.Series([lookup[k] for k in keys], index=df.index, name="district_id")


def sabah_districts() -> pd.DataFrame:
    d = districts()
    return d[(d.state == "Sabah") & (d.kind == "district")]


def national_districts() -> pd.DataFrame:
    """The 160 units used for national peers and model training (no Supra, no successors)."""
    d = districts()
    return d[d.kind == "district"]
