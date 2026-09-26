"""Tool-calling loop + citation validation (+ one repair pass)."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass

from atlas_api.analyst import tools
from atlas_api.analyst.citations import Registry, validate
from atlas_api.analyst.llm import LLM, get_llm
from atlas_api.analyst.prompts import BRIEF_INSTRUCTIONS, SYSTEM

MAX_TOOL_ROUNDS = 8
REPAIR_THRESHOLD = 1  # stripped sentences that trigger one rewrite

Event = Callable[[str, dict], None]


@dataclass
class Answer:
    text: str
    citations: list[dict]
    validation: dict
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    tool_calls: list[dict]
    raw: str


def _loop(
    llm: LLM, reg: Registry, messages: list[dict], on_event: Event, max_tokens: int
) -> tuple[str, int, int, list[dict]]:
    tin = tout = 0
    trace: list[dict] = []
    specs = tools.tool_specs()
    for _ in range(MAX_TOOL_ROUNDS):
        turn = llm.chat(SYSTEM, messages, specs, max_tokens=max_tokens)
        tin += turn.tokens_in
        tout += turn.tokens_out
        if not turn.tool_calls:
            return turn.text, tin, tout, trace
        messages.append({"role": "assistant", "content": turn.text, "tool_calls": turn.tool_calls})
        for c in turn.tool_calls:
            on_event("tool", {"name": c.name, "arguments": c.arguments})
            result = tools.call(reg, c.name, c.arguments)
            trace.append({"name": c.name, "arguments": c.arguments, "chars": len(result)})
            messages.append({"role": "tool", "tool_call_id": c.id, "name": c.name, "content": result})
    # Tool budget exhausted: ask for the answer with what it has.
    messages.append(
        {
            "role": "user",
            "content": "Tool budget reached. Write the answer now using only the evidence gathered.",
        }
    )
    turn = llm.chat(SYSTEM, messages, None, max_tokens=max_tokens)
    return turn.text, tin + turn.tokens_in, tout + turn.tokens_out, trace


def ask(
    question: str,
    district: str | None = None,
    *,
    brief: bool = False,
    llm: LLM | None = None,
    on_event: Event | None = None,
) -> Answer:
    llm = llm or get_llm()
    on_event = on_event or (lambda *_: None)
    reg = Registry()
    t0 = time.time()
    if brief:
        prompt = BRIEF_INSTRUCTIONS.format(district=district)
    else:
        ctx = f"(Context: the user is viewing the {district} district profile.)\n" if district else ""
        prompt = f"{ctx}{question}"
    messages: list[dict] = [{"role": "user", "content": prompt}]
    max_tokens = 2600 if brief else 1400
    on_event("status", {"stage": "thinking"})
    raw, tin, tout, trace = _loop(llm, reg, messages, on_event, max_tokens)
    on_event("status", {"stage": "validating"})
    v = validate(raw, reg)
    if len(v.stripped) >= REPAIR_THRESHOLD:
        on_event("status", {"stage": "repairing", "stripped": len(v.stripped)})
        problems = "\n".join(f'- "{s["sentence"]}" ({s["reason"]})' for s in v.stripped[:12])
        messages.append({"role": "assistant", "content": raw})
        messages.append(
            {
                "role": "user",
                "content": (
                    "The citation validator rejected these sentences:\n"
                    + problems
                    + "\nRewrite the full answer. Every number must match a cited [D#]/[R#] exactly as written in the "
                    "tool results; drop any claim you cannot cite. Keep the same structure."
                ),
            }
        )
        turn = llm.chat(SYSTEM, messages, None, max_tokens=max_tokens)
        tin += turn.tokens_in
        tout += turn.tokens_out
        v2 = validate(turn.text, reg)
        if len(v2.stripped) <= len(v.stripped):
            raw, v = turn.text, v2
    return Answer(
        text=v.text,
        citations=reg.export(v.used),
        validation=v.report(),
        model=llm.name,
        tokens_in=tin,
        tokens_out=tout,
        latency_ms=int((time.time() - t0) * 1000),
        tool_calls=trace,
        raw=raw,
    )


def to_json(a: Answer) -> str:
    return json.dumps(a.__dict__, ensure_ascii=False, default=str)
