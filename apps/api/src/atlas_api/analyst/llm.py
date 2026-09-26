"""Provider-agnostic chat + embeddings adapter.

Messages use a small neutral format so the engine never depends on a vendor SDK:
  {"role": "user", "content": str}
  {"role": "assistant", "content": str, "tool_calls": [ToolCall]}
  {"role": "tool", "tool_call_id": str, "name": str, "content": str}
Provider is chosen from the environment (ATLAS_LLM_PROVIDER, else the first configured).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Turn:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0


class LLM(Protocol):
    name: str

    def chat(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.1,
    ) -> Turn: ...

    def embed(self, texts: list[str]) -> list[list[float]] | None: ...


class LLMNotConfigured(RuntimeError):
    pass


# ------------------------------------------------------------ OpenAI-style
class OpenAIChat:
    """Azure OpenAI (Microsoft Foundry) or any OpenAI-compatible endpoint."""

    def __init__(self, client, model: str, embed_model: str | None, name: str):
        self.client, self.model, self.embed_model, self.name = client, model, embed_model, name

    def chat(self, system, messages, tools=None, max_tokens=2000, temperature=0.1) -> Turn:
        msgs: list[dict] = [{"role": "system", "content": system}]
        for m in messages:
            if m["role"] == "assistant" and m.get("tool_calls"):
                msgs.append(
                    {
                        "role": "assistant",
                        "content": m.get("content") or None,
                        "tool_calls": [
                            {
                                "id": c.id,
                                "type": "function",
                                "function": {"name": c.name, "arguments": json.dumps(c.arguments)},
                            }
                            for c in m["tool_calls"]
                        ],
                    }
                )
            elif m["role"] == "tool":
                msgs.append({"role": "tool", "tool_call_id": m["tool_call_id"], "content": m["content"]})
            else:
                msgs.append({"role": m["role"], "content": m["content"]})
        kwargs: dict = {
            "model": self.model,
            "messages": msgs,
            "temperature": temperature,
            "max_completion_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["parameters"],
                    },
                }
                for t in tools
            ]
        r = self.client.chat.completions.create(**kwargs)
        msg = r.choices[0].message
        calls = []
        for c in msg.tool_calls or []:
            try:
                args = json.loads(c.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(c.id, c.function.name, args))
        u = r.usage
        return Turn(
            msg.content or "",
            calls,
            getattr(u, "prompt_tokens", 0) or 0,
            getattr(u, "completion_tokens", 0) or 0,
        )

    def embed(self, texts):
        if not self.embed_model:
            return None
        out: list[list[float]] = []
        for i in range(0, len(texts), 64):
            r = self.client.embeddings.create(model=self.embed_model, input=texts[i : i + 64])
            out += [d.embedding for d in r.data]
        return out


# --------------------------------------------------------------- Anthropic
class AnthropicChat:
    def __init__(self, model: str):
        import anthropic

        self.client = anthropic.Anthropic()
        self.model, self.name = model, f"anthropic:{model}"

    def chat(self, system, messages, tools=None, max_tokens=2000, temperature=0.1) -> Turn:
        msgs: list[dict] = []
        for m in messages:
            if m["role"] == "assistant":
                blocks: list[dict] = []
                if m.get("content"):
                    blocks.append({"type": "text", "text": m["content"]})
                for c in m.get("tool_calls") or []:
                    blocks.append({"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments})
                msgs.append({"role": "assistant", "content": blocks})
            elif m["role"] == "tool":
                block = {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m["content"]}
                if msgs and msgs[-1]["role"] == "user" and isinstance(msgs[-1]["content"], list):
                    msgs[-1]["content"].append(block)
                else:
                    msgs.append({"role": "user", "content": [block]})
            else:
                msgs.append({"role": "user", "content": m["content"]})
        kwargs: dict = {
            "model": self.model,
            "system": system,
            "messages": msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = [
                {"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
                for t in tools
            ]
        r = self.client.messages.create(**kwargs)
        text = "".join(b.text for b in r.content if b.type == "text")
        calls = [ToolCall(b.id, b.name, dict(b.input)) for b in r.content if b.type == "tool_use"]
        return Turn(text, calls, r.usage.input_tokens, r.usage.output_tokens)

    def embed(self, texts):
        return None  # retrieval falls back to full-text search


def get_llm(role: str = "main") -> LLM:
    """role: 'main' for final answers, 'router' for cheaper routing/evaluation calls."""
    env = os.environ
    provider = env.get("ATLAS_LLM_PROVIDER")
    if not provider:
        if env.get("AZURE_OPENAI_ENDPOINT") and env.get("AZURE_OPENAI_API_KEY"):
            provider = "azure"
        elif env.get("ANTHROPIC_API_KEY"):
            provider = "anthropic"
        elif env.get("OPENAI_COMPATIBLE_BASE_URL"):
            provider = "openai_compatible"
        else:
            raise LLMNotConfigured(
                "No LLM configured. Set AZURE_OPENAI_ENDPOINT/AZURE_OPENAI_API_KEY and "
                "ATLAS_LLM_DEPLOYMENT (see .env.example)."
            )
    main = env.get("ATLAS_LLM_DEPLOYMENT") or env.get("ATLAS_LLM_MODEL")
    router = env.get("ATLAS_LLM_ROUTER_DEPLOYMENT") or main
    model = router if role == "router" else main
    if provider == "azure":
        from openai import AzureOpenAI

        if not model:
            raise LLMNotConfigured("Set ATLAS_LLM_DEPLOYMENT to your Azure deployment name.")
        client = AzureOpenAI(
            azure_endpoint=env["AZURE_OPENAI_ENDPOINT"],
            api_key=env["AZURE_OPENAI_API_KEY"],
            api_version=env.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
        )
        return OpenAIChat(client, model, env.get("ATLAS_EMBED_DEPLOYMENT"), f"azure:{model}")
    if provider == "anthropic":
        return AnthropicChat(model or "claude-sonnet-5")
    if provider == "openai_compatible":
        from openai import OpenAI

        client = OpenAI(
            base_url=env["OPENAI_COMPATIBLE_BASE_URL"],
            api_key=env.get("OPENAI_COMPATIBLE_API_KEY", "not-needed"),
        )
        return OpenAIChat(client, model or "qwen3:8b", env.get("ATLAS_EMBED_MODEL"), f"compat:{model}")
    raise LLMNotConfigured(f"unknown ATLAS_LLM_PROVIDER {provider!r}")


def embedder() -> LLM | None:
    """The configured client if it can embed, else None (full-text retrieval only)."""
    try:
        llm = get_llm()
    except LLMNotConfigured:
        return None
    return llm if getattr(llm, "embed_model", None) else None
