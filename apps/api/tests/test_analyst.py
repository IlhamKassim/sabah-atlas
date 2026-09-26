"""Analyst tests that need no LLM key: the citation validator, and the tool-calling
loop driven by a scripted fake model."""

import pytest

from atlas_api.analyst.citations import Registry, validate
from atlas_api.analyst.llm import ToolCall, Turn


def _reg() -> Registry:
    reg = Registry()
    reg.fact("a", label="Pitas · Median household income · 2024 = RM 2,785", values=[2785.0, 28, 28])
    reg.fact("b", label="Pitas · Absolute poverty rate · 2024 = 50.0%", values=[50.0])
    reg.doc("c1", doc_id="smj", title="Sabah Maju Jaya", publisher="Sabah", page=12, url="https://x",
            text="The plan targets 1,000 km of rural roads by 2025.")
    return reg


def test_valid_citations_and_numbers_kept():
    v = validate("Median income was RM 2,785 in 2024 [D1]. Poverty was 50.0% [D2].", _reg())
    assert v.stripped == []
    assert v.report()["citation_validity"] == 1.0
    assert v.numeric_verified == 2


def test_uncited_number_is_stripped():
    v = validate("Median income was RM 2,785 [D1]. Unemployment is 12.3%.", _reg())
    assert "12.3" not in v.text
    assert v.stripped[0]["reason"] == "uncited numeric claim"


def test_mismatched_number_is_stripped():
    v = validate("Median income was RM 3,100 in 2024 [D1].", _reg())
    assert v.text == ""
    assert v.stripped[0]["reason"] == "number does not match cited source"


def test_fabricated_reference_removed_and_counted():
    v = validate("Pitas is in the Kudat Division [D99].", _reg())
    assert "[D99]" not in v.text
    assert v.report()["citations_total"] == 1 and v.report()["citations_valid"] == 0


def test_document_numbers_verified_against_passage():
    v = validate("The plan targets 1,000 km of rural roads [R1].", _reg())
    assert v.stripped == []


def test_years_and_small_counts_are_not_claims():
    v = validate("Between 2019 and 2024 the district had 3 survey rounds.", _reg())
    assert v.stripped == [] and v.numeric_claims == 0


class ScriptedLLM:
    """Calls get_district_profile, then answers citing the first fact it was given."""

    name = "scripted"

    def __init__(self):
        self.calls = 0

    def chat(self, system, messages, tools=None, max_tokens=2000, temperature=0.1):
        self.calls += 1
        if self.calls == 1:
            return Turn("", [ToolCall("t1", "get_district_profile", {"district": "Pitas"})])
        tool_out = next(m["content"] for m in messages if m["role"] == "tool")
        line = next(ln for ln in tool_out.splitlines() if "Median household income · 2024" in ln)
        fid = line.split("]")[0].strip("[")
        value = line.split("= ")[1].split(" (")[0]
        return Turn(f"Pitas recorded a median household income of {value} in 2024 [{fid}]. It is 99.9% rich.")

    def embed(self, texts):
        return None


@pytest.fixture(scope="module")
def db():
    from atlas_api import queries as q

    try:
        q.release()
    except Exception:
        pytest.skip("database not available")


def test_engine_loop_with_scripted_model(db):
    from atlas_api.analyst.engine import ask

    a = ask("What is Pitas's median income?", llm=ScriptedLLM())
    assert "RM 2,785" in a.text
    assert "99.9" not in a.text  # uncited claim removed even after the repair pass
    assert a.citations and a.citations[0]["source_id"] == "dosm_hh_income_district"
    assert a.tool_calls[0]["name"] == "get_district_profile"
