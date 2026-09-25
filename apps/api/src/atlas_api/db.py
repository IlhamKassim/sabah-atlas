from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from atlas_core.settings import get_settings


@lru_cache
def pool() -> ConnectionPool:
    dsn = get_settings().database_url.replace("postgresql+psycopg://", "postgresql://")
    return ConnectionPool(dsn, min_size=1, max_size=8, kwargs={"row_factory": dict_row},
                          open=True)


@contextmanager
def conn() -> Iterator[Any]:
    with pool().connection() as c:
        yield c


def fetch(sql: str, params: tuple | dict | None = None) -> list[dict]:
    with conn() as c:
        return c.execute(sql, params).fetchall()


def fetch_one(sql: str, params: tuple | dict | None = None) -> dict | None:
    rows = fetch(sql, params)
    return rows[0] if rows else None
