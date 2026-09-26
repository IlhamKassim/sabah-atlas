"""Tier 3: fetch the curated document corpus, extract text per page, chunk, index.

Documents are listed (and verified) in atlas_core/reference/corpus.yaml. Each chunk
keeps its document, page and URL so the Analyst cites and links out rather than
reproducing. Full-text search always works; embeddings are added when an embedding
deployment is configured (ATLAS_EMBED_DEPLOYMENT).
"""

from __future__ import annotations

import io
import json
import re
from importlib.resources import files

import httpx
import psycopg
import yaml
from bs4 import BeautifulSoup
from pypdf import PdfReader

from atlas_core.settings import get_settings
from atlas_pipelines.lake import bronze_dir, now_iso, sha256

CHUNK_CHARS = 1100
OVERLAP = 150
MAX_PAGES = 400


def corpus() -> list[dict]:
    path = files("atlas_core") / "reference" / "corpus.yaml"
    return yaml.safe_load(path.read_text()) or []


def _fetch(client: httpx.Client, doc: dict) -> tuple[bytes, dict] | None:
    out = bronze_dir("corpus")
    ext = "pdf" if doc.get("kind") == "pdf" else "html"
    cached = out / f"{doc['id']}.{ext}"
    meta_path = out / f"{doc['id']}.meta.json"
    if cached.exists() and meta_path.exists():
        return cached.read_bytes(), json.loads(meta_path.read_text())
    try:
        r = client.get(doc["url"])
        r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  ! {doc['id']}: {e}")
        return None
    meta = {
        "id": doc["id"],
        "url": doc["url"],
        "sha256": sha256(r.content),
        "bytes": len(r.content),
        "content_type": r.headers.get("content-type"),
        "retrieved_at": now_iso(),
    }
    cached.write_bytes(r.content)
    meta_path.write_text(json.dumps(meta, indent=2))
    return r.content, meta


def _pages(data: bytes, kind: str) -> list[tuple[int | None, str]]:
    if kind == "pdf" or data[:4] == b"%PDF":
        try:
            reader = PdfReader(io.BytesIO(data))
        except Exception as e:  # noqa: BLE001 — malformed PDFs are skipped, not fatal
            print(f"  ! unreadable PDF: {e}")
            return []
        pages = []
        for i, p in enumerate(reader.pages[:MAX_PAGES], start=1):
            try:
                pages.append((i, p.extract_text() or ""))
            except Exception:  # noqa: BLE001
                pages.append((i, ""))
        return pages
    soup = BeautifulSoup(data, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return [(None, soup.get_text(" "))]


def _clean(text: str) -> str:
    text = text.replace("­", "").replace("\x00", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return re.sub(r"\s+", " ", text).strip()


def _chunks(text: str) -> list[str]:
    if len(text) <= CHUNK_CHARS:
        return [text] if len(text) > 80 else []
    out, start = [], 0
    while start < len(text):
        end = min(len(text), start + CHUNK_CHARS)
        cut = text.rfind(". ", start + CHUNK_CHARS // 2, end)
        end = cut + 1 if cut > 0 and end < len(text) else end
        piece = text[start:end].strip()
        if len(piece) > 80:
            out.append(piece)
        if end >= len(text):
            break
        start = max(end - OVERLAP, start + 1)
    return out


def run(embed: bool = True) -> dict:
    docs = corpus()
    if not docs:
        return {"documents": 0, "note": "corpus.yaml is empty"}
    s = get_settings()
    rows_doc, rows_chunk = [], []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; " + s.user_agent + ")"}
    with httpx.Client(headers=headers, timeout=120, follow_redirects=True) as client:
        for doc in docs:
            got = _fetch(client, doc)
            if not got:
                continue
            data, meta = got
            pages = _pages(data, doc.get("kind", "pdf"))
            n = 0
            for page, raw in pages:
                for i, chunk in enumerate(_chunks(_clean(raw))):
                    rows_chunk.append(
                        {
                            "id": f"{doc['id']}:p{page or 0}:{i}",
                            "doc_id": doc["id"],
                            "page": page,
                            "text": chunk,
                        }
                    )
                    n += 1
            rows_doc.append(
                {
                    **{k: doc.get(k) for k in ("id", "title", "publisher", "url", "kind", "licence")},
                    "published": str(doc.get("published") or ""),
                    "language": doc.get("language", "en"),
                    "topics": doc.get("topics", []),
                    "pages": len(pages),
                    "sha256": meta["sha256"],
                    "retrieved_at": meta["retrieved_at"],
                }
            )
            print(f"  {doc['id']}: {len(pages)} pages, {n} chunks")

    vectors: list | None = None
    if embed and rows_chunk:
        from atlas_api.analyst.llm import embedder

        emb = embedder()
        if emb:
            vectors = emb.embed([c["text"] for c in rows_chunk])

    dsn = s.database_url.replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(dsn) as conn:
        conn.execute("TRUNCATE doc CASCADE")
        with conn.cursor().copy(
            "COPY doc (id, title, publisher, url, kind, licence, published, language, topics, "
            "pages, sha256, retrieved_at) FROM STDIN"
        ) as cp:
            for d in rows_doc:
                cp.write_row(
                    [
                        d["id"],
                        d["title"],
                        d["publisher"],
                        d["url"],
                        d["kind"],
                        d["licence"],
                        d["published"],
                        d["language"],
                        d["topics"],
                        d["pages"],
                        d["sha256"],
                        d["retrieved_at"],
                    ]
                )
        with conn.cursor().copy("COPY doc_chunk (id, doc_id, page, text) FROM STDIN") as cp:
            for c in rows_chunk:
                cp.write_row([c["id"], c["doc_id"], c["page"], c["text"]])
        if vectors:
            with conn.cursor() as cur:
                cur.executemany(
                    "UPDATE doc_chunk SET embedding = %s::vector WHERE id = %s",
                    [
                        ("[" + ",".join(f"{x:.6f}" for x in v) + "]", c["id"])
                        for v, c in zip(vectors, rows_chunk, strict=True)
                    ],
                )
        conn.commit()
    return {
        "documents": len(rows_doc),
        "chunks": len(rows_chunk),
        "embedded": bool(vectors),
        "skipped": len(docs) - len(rows_doc),
    }
