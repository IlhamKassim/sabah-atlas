"""AI Analyst endpoints. The only non-read endpoint on the public API is POST /v1/ask."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from atlas_api.analyst import briefs
from atlas_api.analyst.engine import ask
from atlas_api.analyst.llm import LLMNotConfigured, get_llm
from atlas_api.db import conn, fetch_one

router = APIRouter(prefix="/v1")

RATE_N = int(os.environ.get("ATLAS_ASK_RATE_N", "8"))
RATE_WINDOW = int(os.environ.get("ATLAS_ASK_RATE_WINDOW_S", "600"))
_hits: dict[str, deque] = defaultdict(deque)
_SALT = os.environ.get("ATLAS_IP_SALT", "atlas")


class AskBody(BaseModel):
    question: str = Field(min_length=3, max_length=800)
    district: str | None = Field(default=None, max_length=60)


def _client_hash(request: Request) -> str:
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    return hashlib.sha256(f"{_SALT}:{ip}".encode()).hexdigest()[:16]


def _rate_limit(key: str) -> None:
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_N:
        raise HTTPException(
            429,
            f"Rate limit: {RATE_N} questions per {RATE_WINDOW // 60} minutes. Reviewed briefs remain available.",
        )
    q.append(now)


@router.get("/analyst/status", summary="Whether the Analyst is configured")
def status() -> dict:
    try:
        llm = get_llm()
        return {"available": True, "model": llm.name}
    except LLMNotConfigured as e:
        return {"available": False, "reason": str(e)}


@router.post("/ask", summary="Ask the AI Analyst (Server-Sent Events)")
async def ask_endpoint(body: AskBody, request: Request):
    key = _client_hash(request)
    _rate_limit(key)
    try:
        llm = get_llm()
    except LLMNotConfigured as e:
        raise HTTPException(503, str(e)) from None
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def emit(event: str, data: dict) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, (event, data))

    def work():
        try:
            a = ask(body.question, district=body.district, llm=llm, on_event=emit)
            emit(
                "answer",
                {
                    "text": a.text,
                    "citations": a.citations,
                    "validation": a.validation,
                    "model": a.model,
                    "label": "AI-generated, unreviewed",
                },
            )
            with conn() as c:
                c.execute(
                    """INSERT INTO ask_log (client_hash, district_id, question, model, tokens_in, tokens_out,
                             latency_ms, validity) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        key,
                        body.district,
                        body.question,
                        a.model,
                        a.tokens_in,
                        a.tokens_out,
                        a.latency_ms,
                        a.validation["citation_validity"],
                    ),
                )
                c.commit()
        except Exception as e:  # noqa: BLE001
            emit("error", {"message": f"The Analyst could not answer: {type(e).__name__}"})
        finally:
            emit("done", {})

    loop.run_in_executor(None, work)

    async def stream():
        while True:
            event, data = await queue.get()
            yield {"event": event, "data": json.dumps(data, ensure_ascii=False, default=str)}
            if event == "done":
                break

    return EventSourceResponse(stream())


@router.get("/briefs", summary="District brief library (latest per district)")
def brief_list() -> list[dict]:
    return briefs.list_briefs()


@router.get("/briefs/{key}", summary="Latest brief for a district, with citations and validation")
def brief_get(key: str) -> dict:
    b = briefs.get_brief(key)
    if not b:
        raise HTTPException(404, "no brief yet")
    return b


class ReviewBody(BaseModel):
    approve: bool
    reviewer: str = Field(min_length=2, max_length=80)
    note: str = ""


@router.post("/briefs/{key}/review", include_in_schema=False)
def brief_review(key: str, body: ReviewBody, authorization: str = Header(default="")) -> dict:
    token = os.environ.get("ATLAS_REVIEW_TOKEN")
    if not token or authorization != f"Bearer {token}":
        raise HTTPException(401, "review requires authorisation")
    return briefs.review(key, approve=body.approve, reviewer=body.reviewer, note=body.note)


@router.get("/analyst/eval", summary="Latest evaluation report for the Analyst")
def eval_report(full: bool = False) -> dict:
    row = fetch_one("SELECT report FROM analyst_eval ORDER BY run_at DESC LIMIT 1")
    if not row:
        raise HTTPException(404, "not evaluated yet")
    r = row["report"]
    if not full:
        r["results"] = [{k: v for k, v in x.items() if k != "answer"} for x in r["results"]]
    return r
