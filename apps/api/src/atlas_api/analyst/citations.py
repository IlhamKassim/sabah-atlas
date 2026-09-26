"""Citation contract and post-generation validator.

Every factual sentence must reference a data citation [D#] (a database value with
source and vintage) or a document citation [R#] (document, page, URL). The
validator:
  1. drops references that do not exist in this session's registry;
  2. checks every number in a sentence against the values of the facts it cites
     (or the text of the cited document passage);
  3. strips sentences that make numeric claims without a valid, matching citation;
  4. adds the 80% interval to any sentence that quotes a modelled central value
     without its range, so no model output reaches the reader as a bare point;
  5. recovers a missing citation only when every number in an uncited sentence matches
     exactly one retrieved fact on the same topic. Ambiguous sentences are still stripped,
     and recovered citations are counted separately from the model's own.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

REF = re.compile(r"\[(D|R)(\d+)\]")
NUM = re.compile(
    r"(?<![\w.])(?:RM\s?)?[-−+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![\w.])(?:RM\s?)?[-−+]?\d+(?:\.\d+)?%?"
)
YEAR = re.compile(r"^(19|20)\d{2}$")
# "80% interval" names the interval's coverage; it is not a claim about the data.
INTERVAL_PHRASE = re.compile(r"\b80\s?%\s+(?:prediction\s+|uncertainty\s+)?(?:interval|range)", re.I)


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
    interval: str | None = None  # e.g. "80% interval RM 3,120–RM 4,410"; values = [p10, p50, p90]


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


def numbers_in_text(text: str) -> list[float]:
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


def _ensure_intervals(sent: str, body: str, ids: list[str], reg: Registry) -> tuple[str, int]:
    nums = [p for t in NUM.findall(body) if (p := _parse_number(t))]

    def quoted(x: float) -> bool:
        return any(_matches(v, d, [x]) for v, d in nums)

    added = 0
    for i in ids:
        f = reg.facts.get(i)
        if not f or not f.interval or len(f.values) != 3:
            continue
        lo, mid, hi = f.values
        if quoted(mid) and not (quoted(lo) and quoted(hi)):
            # Insert right after the quoted central value ("RM 3,733 (80% interval …)"),
            # so a sentence with several modelled values keeps each range beside its number.
            pos = None
            for m in NUM.finditer(sent):
                p = _parse_number(m.group(0))
                if p and _matches(p[0], p[1], [mid]):
                    unit = re.match(r"\s+(?:million|billion|thousand)\b", sent[m.end():])
                    pos = m.end() + (unit.end() if unit else 0)
                    break
            if pos is None:
                continue
            sent = f"{sent[:pos]} ({f.interval}){sent[pos:]}"
            added += 1
    return sent, added


# Words too generic to show that a sentence and a fact are about the same thing.
_GENERIC = {
    "sabah", "district", "districts", "latest", "official", "derived", "atlas", "projection",
    "baseline", "interval", "modelled", "nowcast", "percentile", "median", "value", "prices",
    "constant", "highest", "descriptive", "total", "about", "since", "which", "their",
}


_SHORT_TOPICS = {"gdp", "gini", "lfpr"}


def _words(text: str) -> set[str]:
    t = text.lower()
    return set(re.findall(r"[a-z]{5,}", t)) | (set(re.findall(r"[a-z]+", t)) & _SHORT_TOPICS)


def _topic(label: str, name: str | None) -> set[str]:
    skip = _GENERIC | set(re.findall(r"[a-z]+", (name or "").lower()))
    return {w for w in _words(label) if w not in skip}


def _recover(body: str, toks: list[str], reg: Registry) -> list[str] | None:
    """Citations for an uncited sentence, or None unless every number is unambiguous."""
    words = _words(body)
    chosen: list[str] = []
    for t in toks:
        v, d = _parse_number(t)
        tol = 0.5 * 10 ** (-d) + 1e-9
        hits = [
            f
            for f in reg.facts.values()
            if any(abs(round(c, d) - v) <= tol for c in f.values)
            and words & _topic(f.label, f.label.split(" · ")[0])
        ]
        # The same datum often appears as several facts (profile, scorecard, forecast
        # baseline): same district, indicator and year. Treat those as one, cite the
        # official observation.
        keys = {(f.district_id, f.indicator, f.period) for f in hits}
        if not hits or len(keys) != 1 or None in next(iter(keys)):
            if len(hits) != 1:
                return None
        hits.sort(key=lambda f: (f.kind != "observation", int(f.id[1:])))
        chosen.append(hits[0].id)
    return list(dict.fromkeys(chosen))


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
    intervals_added: int = 0
    citations_recovered: int = 0

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
            "intervals_added": self.intervals_added,
            "citations_recovered": self.citations_recovered,
        }


_GROUP = re.compile(r"\[((?:[DR]\d+\s*(?:[,;]|[-–—]|and)\s*)+[DR]?\d+)\]")
_RANGE = re.compile(r"([DR])(\d+)\s*[-–—]\s*(?:[DR])?(\d+)")


def normalise_refs(text: str) -> str:
    """Split grouped references into single ones: "[D1, D3]" → "[D1][D3]",
    "[D4–D6]" → "[D4][D5][D6]", so each is validated, counted and linked."""

    def expand(m: re.Match) -> str:
        out: list[str] = []
        for part in re.split(r"\s*(?:[,;]|and)\s*", m.group(1)):
            r = _RANGE.fullmatch(part.strip())
            if r and int(r.group(3)) >= int(r.group(2)) and int(r.group(3)) - int(r.group(2)) <= 30:
                out += [f"[{r.group(1)}{n}]" for n in range(int(r.group(2)), int(r.group(3)) + 1)]
            elif re.fullmatch(r"[DR]\d+", part.strip()):
                out.append(f"[{part.strip()}]")
        return "".join(out) or m.group(0)

    text = _GROUP.sub(expand, text)
    # Citations placed after the full stop belong to the sentence before it:
    # "… by income. [D1]" → "… by income [D1]."
    text = re.sub(
        r"(?<=[\w%)\]])([.!?])[ \t]*((?:\[[DR]\d+\][ \t]*)+)",
        lambda m: f" {m.group(2).strip()}{m.group(1)}" + (" " if m.group(2)[-1] in " \t" else ""),
        text,
    )
    # Repeated references in one run: "[D1][D4][D1]" → "[D1][D4]"
    def dedupe(m: re.Match) -> str:
        return "".join(dict.fromkeys(re.findall(r"\[[DR]\d+\]", m.group(0))))

    return re.sub(
        r"(?:\[[DR]\d+\][ \t]*){2,}",
        lambda m: dedupe(m) + (" " if m.group(0)[-1] in " \t" else ""),
        text,
    )


def validate(answer: str, reg: Registry, given: list[float] | None = None) -> Validation:
    """`given`: numbers from the user's own question (e.g. a threshold such as RM 4,000),
    which the answer may repeat without a citation."""
    given = given or []
    answer = normalise_refs(answer)
    total = valid = claims = verified = added = recovered = 0
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
            if not REF.sub("", sent).strip(" .;,-*•"):
                continue  # a bare citation left over from a removed sentence
            refs = REF.findall(sent)
            ids = [f"{k}{n}" for k, n in refs]
            good = [i for i in ids if i in reg.facts or i in reg.docs]
            total += len(ids)
            valid += len(good)
            # drop invalid references from the sentence text
            clean = REF.sub(lambda m, good=good: m.group(0) if f"{m.group(1)}{m.group(2)}" in good else "", sent)
            clean = re.sub(r"\s+([.,;:])", r"\1", clean)
            body = INTERVAL_PHRASE.sub("", REF.sub("", clean))
            toks = [
                t
                for t in NUM.findall(body)
                if (p := _parse_number(t)) and not _is_exempt(t, p[0]) and p[0] not in given
            ]
            if not toks:
                kept.append(clean)
                used.update(good)
                continue
            if not good and (rec := _recover(body, toks, reg)):
                good = rec
                recovered += len(rec)
                refs_txt = "".join(f"[{i}]" for i in rec)
                clean = re.sub(
                    r"\s*([.!?]?)\s*$", lambda m, r=refs_txt: f" {r}{m.group(1)}", clean, count=1
                )
            candidates: list[float] = []
            for i in good:
                if i in reg.facts:
                    candidates += reg.facts[i].values
                else:
                    candidates += numbers_in_text(reg.docs[i].text)
            ok = True
            for t in toks:
                claims += 1
                v, d = _parse_number(t)
                if good and _matches(v, d, candidates):
                    verified += 1
                else:
                    ok = False
            if ok:
                clean, n = _ensure_intervals(clean, body, good, reg)
                added += n
                kept.append(clean)
                used.update(good)
            else:
                reason = "uncited numeric claim" if not good else "number does not match cited source"
                stripped.append({"sentence": sent.strip(), "reason": reason})
        kept_lines.append(" ".join(s for s in kept if s.strip()))
    text = "\n".join(kept_lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return Validation(text, total, valid, claims, verified, stripped, used, added, recovered)
