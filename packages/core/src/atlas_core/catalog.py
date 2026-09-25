from __future__ import annotations

from functools import lru_cache
from importlib.resources import files
from typing import Literal

import yaml
from pydantic import BaseModel


class Indicator(BaseModel):
    code: str
    label: str
    short: str
    unit: str
    format: str
    direction: Literal["up", "down", "neutral"]
    category: str
    jalur: str | None = None
    source: str
    derived_from: list[str] = []
    description: str


class Source(BaseModel):
    id: str
    publisher: str
    dataset_id: str
    title: str
    page: str
    licence: str
    parquet: str | None = None
    geojson: str | None = None


def _load(name: str) -> list[dict]:
    return yaml.safe_load((files("atlas_core") / "reference" / name).read_text())


@lru_cache
def indicators() -> dict[str, Indicator]:
    return {d["code"]: Indicator(**d) for d in _load("indicators.yaml")}


@lru_cache
def sources() -> dict[str, Source]:
    return {d["id"]: Source(**d) for d in _load("sources.yaml")}


@lru_cache
def errata() -> list[dict]:
    return _load("errata.yaml")
