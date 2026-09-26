"""Citation contract and post-generation validator.

Every factual sentence must reference a data citation [D#] (a database value with
source and vintage) or a document citation [R#] (document, page, URL). The
validator:
  1. drops references that do not exist in this session's registry;
  2. checks every number in a sentence against the values of the facts it cites
     (or the text of the cited document passage);
  3. strips sentences that make numeric claims without a valid, matching citation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

REF = re.compile(r"\[(D|R)(\d+)\]")
NUM = re.compile(
    r"(?<![\w.])(?:RM\s?)?[-−+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![\w.])(?:RM\s?)?[-−+]?\d+(?:\.\d+)?%?"
)
YEAR = re.compile(r"^(19|20)\d{2}$")


@dataclass
class Fact:
    id: str
    label: str  # human-readable line shown to the model and the reader
    values: list[float]  # every number this fact vouches for
    district_id: str | None = None
    indicator: str | None = None
    period: int | None = None
    source_id: str | None = None
    vintage: str | None = None
    kind: str = "observation"  # observation | analytics
    model_version: str | None = None


@dataclass
class DocRef:
    id: str
    doc_id: str
    title: str
    publisher: str
    page: int | None
    url: str
    text: str


@dataclass
class Registry:
    facts: dict[str, Fact] = field(default_factory=dict)
    docs: dict[str, DocRef] = field(default_factory=dict)
    _fact_keys: dict[str, str] = field(default_factory=dict)
    _doc_keys: dict[str, str] = field(default_factory=dict)

    def fact(self, key: str, **kw) -> Fact:
        if key in self._fact_keys:
            return self.facts[self._fact_keys[key]]
        fid = f"D{len(self.facts) + 1}"
        f = Fact(id=fid, **kw)
        self.facts[fid] = f
        self._fact_keys[key] = fid
        return f

    def doc(self, chunk_id: str, **kw) -> DocRef:
        if chunk_id in self._doc_keys:
            return self.docs[self._doc_keys[chunk_id]]
        rid = f"R{len(self.docs) + 1}"
        d = DocRef(id=rid, **kw)
        self.docs[rid] = d
        self._doc_keys[chunk_id] = rid
        return d

    def export(self, used: set[str]) -> list[dict]:
        out = []
        for rid in sorted(used, key=lambda r: (r[0], int(r[1:]))):
            if rid in self.facts:
                f = self.facts[rid]
                out.append(
                    {
                        "id": rid,
                        "type": "data",
                        "label": f.label,
                        "district_id": f.district_id,
                        "indicator": f.indicator,
                        "period": f.period,
                        "source_id": f.source_id,
                        "vintage": f.vintage,
                        "kind": f.kind,
                        "model_version": f.model_version,
                    }
                )
            elif rid in self.docs:
                d = self.docs[rid]
                out.append(
                    {
                        "id": rid,
                        "type": "document",
                        "doc_id": d.doc_id,
                        "title": d.title,
                        "publisher": d.publisher,
                        "page": d.page,
                        "url": d.url,
                        "excerpt": d.text[:280],
                    }
                )
        return out


def _parse_number(tok: str) -> tuple[float, int] | None:
    t = tok.replace("RM", "").replace(",", "").replace("%", "").replace("−", "-").strip()
    try:
        v = float(t)
    except ValueError:
        return None
    decimals = len(t.split(".")[1]) if "." in t else 0
    return v, decimals


def _matches(value: float, decimals: int, candidates: list[float]) -> bool:
    tol = 0.5 * 10 ** (-decimals) + 1e-9
    for c in candidates:
        for cand in (c, abs(c)):
            if abs(round(cand, decimals) - value) <= tol or abs(cand - value) <= tol:
                return True
            # allow thousands shorthand, e.g. "RM 2.8k" style or "39.9 thousand"
            if value and abs(cand / 1000 - value) <= tol:
                return True
    return False


def _numbers_in_text(text: str) -> list[float]:
    out = []
    for tok in NUM.findall(text):
        p = _parse_number(tok)
        if p:
            out.append(p[0])
    return out


def _is_exempt(tok: str, v: float) -> bool:
    raw = tok.replace("RM", "").strip()
    if YEAR.match(raw):
        return True  # years
    return "%" not in tok and "RM" not in tok and "." not in raw and "," not in raw and 0 <= v <= 30


_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])|\n+")


@dataclass
class Validation:
    text: str
    citations_total: int
    citations_valid: int
    numeric_claims: int
    numeric_verified: int
    stripped: list[dict]
    used: set[str]

    @property
    def validity(self) -> float:
        return self.citations_valid / self.citations_total if self.citations_total else 1.0

    def report(self) -> dict:
        return {
            "citations_total": self.citations_total,
            "citations_valid": self.citations_valid,
            "citation_validity": round(self.validity, 4),
            "numeric_claims": self.numeric_claims,
            "numeric_verified": self.numeric_verified,
            "stripped": self.stripped,
        }


def validate(answer: str, reg: Registry) -> Validation:
    total = valid = claims = verified = 0
    stripped: list[dict] = []
    used: set[str] = set()
    kept_lines: list[str] = []

    for line in answer.split("\n"):
        if not line.strip():
            kept_lines.append(line)
            continue
        parts = _SPLIT.split(line)
        kept: list[str] = []
        for sent in parts:
            refs = REF.findall(sent)
            ids = [f"{k}{n}" for k, n in refs]
            good = [i for i in ids if i in reg.facts or i in reg.docs]
            total += len(ids)
            valid += len(good)
            # drop invalid references from the sentence text
            clean = REF.sub(lambda m, good=good: m.group(0) if f"{m.group(1)}{m.group(2)}" in good else "", sent)
            clean = re.sub(r"\s+([.,;:])", r"\1", clean)
            body = REF.sub("", clean)
            toks = [t for t in NUM.findall(body) if (p := _parse_number(t)) and not _is_exempt(t, p[0])]
            if not toks:
                kept.append(clean)
                used.update(good)
                continue
            candidates: list[float] = []
            for i in good:
                if i in reg.facts:
                    candidates += reg.facts[i].values
                else:
                    candidates += _numbers_in_text(reg.docs[i].text)
            ok = True
            for t in toks:
                claims += 1
                v, d = _parse_number(t)
                if good and _matches(v, d, candidates):
                    verified += 1
                else:
                    ok = False
            if ok:
                kept.append(clean)
                used.update(good)
            else:
                reason = "uncited numeric claim" if not good else "number does not match cited source"
                stripped.append({"sentence": sent.strip(), "reason": reason})
        kept_lines.append(" ".join(s for s in kept if s.strip()))
    text = "\n".join(kept_lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return Validation(text, total, valid, claims, verified, stripped, used)
