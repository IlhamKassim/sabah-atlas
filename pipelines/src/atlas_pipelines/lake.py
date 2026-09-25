"""Bronze/silver/gold lake on the local filesystem (Azure: the same layout in ADLS)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from atlas_core.settings import get_settings


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def bronze_dir(source_id: str) -> Path:
    p = get_settings().bronze / source_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def latest_bronze(source_id: str) -> tuple[Path, dict]:
    """Return (data file, metadata) for the newest bronze snapshot of a source."""
    metas = sorted(bronze_dir(source_id).glob("*.meta.json"))
    if not metas:
        raise FileNotFoundError(f"no bronze snapshot for {source_id}; run `atlas ingest` first")
    meta = json.loads(metas[-1].read_text())
    return metas[-1].parent / meta["file"], meta


def write_table(layer: str, name: str, df: pd.DataFrame) -> Path:
    root = getattr(get_settings(), layer)
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{name}.parquet"
    df.to_parquet(path, index=False)
    return path


def read_table(layer: str, name: str) -> pd.DataFrame:
    return pd.read_parquet(getattr(get_settings(), layer) / f"{name}.parquet")
