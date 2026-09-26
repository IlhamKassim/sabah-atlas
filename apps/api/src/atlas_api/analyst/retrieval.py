"""Hybrid retrieval over the document corpus: Postgres full-text search always,
plus pgvector similarity when an embedding deployment is configured; merged with
reciprocal-rank fusion."""

from __future__ import annotations

from atlas_api.analyst.llm import embedder
from atlas_api.db import fetch

_COLS = "c.id, c.doc_id, c.page, c.text, d.title, d.publisher, d.published, d.url"


def _fts(query: str, k: int) -> list[dict]:
    return fetch(
        f"""SELECT {_COLS}, ts_rank_cd(c.tsv, q) AS score
            FROM doc_chunk c JOIN doc d ON d.id = c.doc_id,
                 websearch_to_tsquery('simple', %s) q
            WHERE c.tsv @@ q ORDER BY score DESC LIMIT %s""",
        (query, k),
    )


def _fts_loose(query: str, k: int) -> list[dict]:
    # OR of the query's content words, for short or oddly phrased questions
    words = [w for w in query.lower().replace("?", " ").split() if len(w) > 3][:12]
    if not words:
        return []
    return fetch(
        f"""SELECT {_COLS}, ts_rank_cd(c.tsv, q) AS score
            FROM doc_chunk c JOIN doc d ON d.id = c.doc_id, to_tsquery('simple', %s) q
            WHERE c.tsv @@ q ORDER BY score DESC LIMIT %s""",
        (" | ".join(words), k),
    )


def _vector(query: str, k: int) -> list[dict]:
    emb = embedder()
    if not emb:
        return []
    vec = emb.embed([query])
    if not vec:
        return []
    literal = "[" + ",".join(f"{x:.6f}" for x in vec[0]) + "]"
    return fetch(
        f"""SELECT {_COLS}, 1 - (c.embedding <=> %s::vector) AS score
            FROM doc_chunk c JOIN doc d ON d.id = c.doc_id
            WHERE c.embedding IS NOT NULL ORDER BY c.embedding <=> %s::vector LIMIT %s""",
        (literal, literal, k),
    )


def search(query: str, k: int = 5) -> list[dict]:
    lists = [_fts(query, k * 3), _vector(query, k * 3)]
    if not lists[0]:
        lists[0] = _fts_loose(query, k * 3)
    scores: dict[str, float] = {}
    rows: dict[str, dict] = {}
    for lst in lists:
        for rank, r in enumerate(lst):
            scores[r["id"]] = scores.get(r["id"], 0.0) + 1.0 / (60 + rank)
            rows[r["id"]] = r
    best = sorted(scores, key=scores.get, reverse=True)[:k]
    return [rows[i] for i in best]
