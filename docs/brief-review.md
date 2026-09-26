# Reviewing district briefs

The AI Analyst drafts one brief per district. A draft is published on the site as **"AI-generated · unreviewed draft"** until a named reviewer approves it. This page is for that reviewer: ideally someone who knows the district (UPEN, UMS, district office).

## What the machine has already checked

Before a draft reaches you, the validator has:

- confirmed every `[D#]` citation exists and that each number in the sentence matches the cited database value (source and year are shown under the brief);
- removed sentences with numbers it could not match to a source;
- added the 80% interval wherever a modelled figure (nowcast or projection) was quoted without one;
- restored a missing citation only where a number matched exactly one retrieved fact on the same topic.

So **you do not need to re-check arithmetic or transcription.** Spend your time on what a validator cannot judge.

## What to check

1. **Framing.** Is each claim read correctly from its source? Common slips:
   - a sector-share *rank* read as "the district's largest sector";
   - descriptive indicators (sector shares, density, expenditure, night lights) listed as strengths or concerns. They are context, not verdicts;
   - "worse than peers" and "worsening" confused.
2. **Causation.** Driver results are associations. "Unemployment is associated with higher poverty" is fine; "unemployment causes poverty" is not.
3. **Evidence grades on Options.** *Strong* needs an evaluated result or a structural peer that actually improved; *moderate* a consistent association or partial precedent; *limited* a plan or budget intention only. Downgrade anything over-graded.
4. **Local knowledge.** Does anything contradict what you know on the ground (a new road, a closed mill, a boundary change)? Say so in the note; it is the most valuable part of the review.
5. **Tone.** Neutral and non-partisan; no statements about politicians, parties or ethnic groups.

## How to record the decision

```bash
uv run atlas review pitas --reviewer "Full Name, Organisation" --note "Checked framing; downgraded option 2 to limited."
uv run atlas review pitas --reject --reviewer "Full Name, Organisation" --note "Situation misreads the sector mix; regenerate."
```

Approving publishes the brief as **Reviewed by …** with your name and note. The site always prefers a reviewed brief over a newer draft, so a new data release does not push reviewed work off the page.

To fix wording rather than reject, edit the brief text in the `insight` table, or regenerate that district with `uv run atlas briefs --district pitas --force` and review again. `--force` never overwrites a reviewed brief; that needs `--replace-reviewed` as well, deliberately.
