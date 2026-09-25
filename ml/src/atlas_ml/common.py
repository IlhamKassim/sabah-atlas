from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from atlas_core.registry import districts
from atlas_core.settings import get_settings

SEED = 42


@dataclass
class Gold:
    obs: pd.DataFrame
    sect: pd.DataFrame
    state: pd.DataFrame
    district: pd.DataFrame

    @classmethod
    def load(cls) -> Gold:
        g = get_settings().gold
        s = get_settings().silver
        return cls(obs=pd.read_parquet(g / "observation.parquet"),
                   sect=pd.read_parquet(g / "gdp_sector.parquet"),
                   state=pd.read_parquet(s / "state_series.parquet"),
                   district=pd.read_parquet(g / "district.parquet").set_index("district_id"))

    def wide(self, code: str) -> pd.DataFrame:
        """district x period matrix for one indicator."""
        o = self.obs[self.obs.indicator == code]
        return o.pivot_table(index="district_id", columns="period", values="value")

    def latest(self, code: str, max_period: int | None = None) -> pd.Series:
        o = self.obs[self.obs.indicator == code]
        if max_period is not None:
            o = o[o.period <= max_period]
        o = o.sort_values("period").groupby("district_id").tail(1)
        return o.set_index("district_id").value

    def flag(self, code: str, period: int) -> pd.Series:
        o = self.obs[(self.obs.indicator == code) & (self.obs.period == period)]
        return o.set_index("district_id").quality_flag


def modelling_units() -> list[str]:
    """National units with polygons and full GDP: 160 districts minus Putrajaya (GDP in KL)."""
    d = districts()
    d = d[(d.kind == "district") & (d.district_id != "pjy-putrajaya")]
    return d.district_id.tolist()


def sabah_ids() -> list[str]:
    d = districts()
    return d[(d.state == "Sabah") & (d.kind == "district")].district_id.tolist()


def version(task: str, *frames: pd.DataFrame | dict) -> str:
    h = hashlib.sha256()
    for f in frames:
        if isinstance(f, pd.DataFrame):
            h.update(pd.util.hash_pandas_object(f.round(10), index=True).values.tobytes())
        else:
            h.update(json.dumps(f, sort_keys=True, default=str).encode())
    return f"{task}-{date.today():%Y.%m.%d}-{h.hexdigest()[:8]}"


def clean(obj):
    """Make numpy / pandas values JSON-safe (NaN -> None)."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        return None if not np.isfinite(obj) else round(float(obj), 6)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if obj is pd.NA or obj is pd.NaT:
        return None
    return obj
