"""Analyst tests that need no LLM key: the citation validator, and the tool-calling
loop driven by a scripted fake model."""

import pytest

from atlas_api.analyst.citations import Registry, normalise_refs, validate
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


def test_modelled_value_always_carries_its_interval():
    reg = _reg()
    reg.fact("fc", label="Tongod · income_median 2027 projection: p50 RM 3,733", kind="analytics",
             values=[3120.0, 3733.0, 4410.0], interval="80% interval RM 3,120–RM 4,410")
    v = validate("Median income in Tongod is projected at RM 3,733 in 2027 [D3].", reg)
    assert "RM 3,733 (80% interval RM 3,120–RM 4,410) in 2027 [D3]." in v.text
    assert v.intervals_added == 1
    # already stated: left alone
    v = validate("It is projected at RM 3,733 (RM 3,120 to RM 4,410) in 2027 [D3].", reg)
    assert v.intervals_added == 0 and v.text.count("3,120") == 1
    # several modelled values in one sentence: each range sits beside its own citation
    reg.fact("fc2", label="Tongod · income_median 2028", kind="analytics",
             values=[3200.0, 3850.0, 4600.0], interval="80% interval RM 3,200–RM 4,600")
    v = validate("It reaches RM 3,733 in 2027 [D3] and RM 3,850 in 2028 [D4].", reg)
    assert "RM 3,733 (80% interval RM 3,120–RM 4,410) in 2027 [D3] and" in v.text
    assert "RM 3,850 (80% interval RM 3,200–RM 4,600) in 2028 [D4]." in v.text


def test_interval_phrase_and_question_numbers_are_not_claims():
    reg = _reg()
    reg.fact("fc", label="Tongod 2027", kind="analytics", values=[3232.0, 3733.0, 4329.0],
             interval="80% interval RM 3,232–RM 4,329")
    v = validate("It is RM 3,733, with an 80% interval of RM 3,232 to RM 4,329 [D3]. "
                 "The upper bound exceeds RM 4,000 [D3].", reg, given=[4000.0])
    assert v.stripped == []


def test_grouped_citations_are_split_validated_and_counted():
    assert normalise_refs("x [D1, D2] y [D3–D5] z [D1; R1] [R2 and D4]") == (
        "x [D1][D2] y [D3][D4][D5] z [D1][R1][R2][D4]"
    )
    v = validate("Median income was RM 2,785 and poverty 50.0% [D1, D2].", _reg())
    assert v.stripped == [] and v.citations_total == 2 and "[D1][D2]" in v.text


def test_missing_citation_recovered_only_when_unambiguous():
    v = validate("Median household income in 2024 was RM 2,785.", _reg())
    assert v.text == "Median household income in 2024 was RM 2,785 [D1]." and v.citations_recovered == 1
    # right number, wrong topic: not recovered
    v = validate("Unemployment reached 50.0% in 2024.", _reg())
    assert v.text == "" and v.citations_recovered == 0
    # the same datum repeated as several facts is one datum: cite the observation
    reg = Registry()
    reg.fact("sc", label="Pitas · scorecard income_median 2024 = RM 2,785 vs peers", values=[2785.0],
             district_id="sbh-pitas", indicator="income_median", period=2024, kind="analytics")
    reg.fact("ob", label="Pitas · Median household income · 2024 = RM 2,785", values=[2785.0],
             district_id="sbh-pitas", indicator="income_median", period=2024)
    v = validate("Median household income in 2024 was RM 2,785.", reg)
    assert v.text.endswith("RM 2,785 [D2].")
    # ambiguous: two same-topic facts share the number
    reg = _reg()
    reg.fact("x", label="Kudat · Absolute poverty rate · 2022 = 50.0%", values=[50.0])
    v = validate("The poverty rate was 50.0%.", reg)
    assert v.text == "" and v.citations_recovered == 0


def test_citation_after_full_stop_and_repeats_are_normalised():
    assert normalise_refs("Poverty was high. [D2] Next.") == "Poverty was high [D2]. Next."
    assert normalise_refs("Income fell [D1][D2]. [D2][D1]") == "Income fell [D1][D2]."
    v = validate("Median household income was RM 2,785. [D1]\n\n[D2][D1]\n- Poverty was 50.0% [D2].", _reg())
    assert v.text == "Median household income was RM 2,785 [D1].\n\n- Poverty was 50.0% [D2]."


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
