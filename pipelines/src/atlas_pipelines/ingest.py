"""Fetch Tier-1 sources into bronze.

Each snapshot is immutable: `<retrieved>_<sha12>.<ext>` plus a `.meta.json`
holding the publisher's own metadata (last updated, data as of, caveats) so
that every published number can footnote its exact vintage. A source whose
content hash is unchanged is not re-written.
"""

from __future__ import annotations

import json
import re
import time

import httpx

from atlas_core.catalog import Source, sources
from atlas_core.settings import get_settings
from atlas_pipelines.lake import bronze_dir, now_iso, sha256

_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
_META_KEYS = ("title", "description", "last_updated", "next_update", "data_as_of", "caveat",
              "methodology", "publication", "frequency", "fields")


def _client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": get_settings().user_agent}, timeout=120,
                        follow_redirects=True)


def fetch_catalogue_meta(client: httpx.Client, page_url: str) -> dict:
    """Publisher metadata from an OpenDOSM catalogue page (embedded Next.js props)."""
    r = client.get(page_url)
    r.raise_for_status()
    m = _NEXT_DATA.search(r.text)
    if not m:
        return {}
    props = json.loads(m.group(1))["props"]["pageProps"]
    out = {k: props.get(k) for k in _META_KEYS if props.get(k) is not None}
    if "CC BY 4.0" in r.text or "Creative Commons Attribution 4.0" in r.text:
        out["licence_stated"] = "CC BY 4.0"
    return out


def ingest_source(client: httpx.Client, src: Source) -> dict:
    url = src.parquet or src.geojson
    assert url, src.id
    ext = "parquet" if src.parquet else "geojson"
    r = client.get(url)
    r.raise_for_status()
    digest = sha256(r.content)
    out_dir = bronze_dir(src.id)
    existing = [json.loads(p.read_text()) for p in out_dir.glob("*.meta.json")]
    if any(m["sha256"] == digest for m in existing):
        return {"source": src.id, "status": "unchanged", "sha256": digest[:12]}

    meta = {"source_id": src.id, "url": url, "sha256": digest, "bytes": len(r.content),
            "retrieved_at": now_iso(), "licence": src.licence}
    if src.page and "open.dosm.gov.my" in src.page:
        meta["publisher_meta"] = fetch_catalogue_meta(client, src.page)
        time.sleep(1)  # be polite to the catalogue site
    stem = f"{meta['retrieved_at'][:10]}_{digest[:12]}"
    meta["file"] = f"{stem}.{ext}"
    (out_dir / meta["file"]).write_bytes(r.content)
    (out_dir / f"{stem}.meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return {"source": src.id, "status": "new", "sha256": digest[:12]}


def ingest_all(only: list[str] | None = None) -> list[dict]:
    results = []
    with _client() as client:
        for src in sources().values():
            if only and src.id not in only:
                continue
            results.append(ingest_source(client, src))
    return results
