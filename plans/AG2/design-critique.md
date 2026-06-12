# Design Critique: AG2 — Portfolio Arrival & Honest Filters

DESIGN-CRITIQUE: variant=variant-a-persistent-frame score=8/10  rounds=2  axes: H:9 S:9 T:8 C:8 Co:9 St:9 A:7 AS:9 PP:7

Scored from the variant specs + approved-candidate against the current rendered code (`packages/web/src/pages/WorkPortfolio.tsx`), the design-system EmptyState, and `.claude/rules/aesthetic-quality.md`. No mockup HTML exists (re-composition of an existing surface, per brief classification), so scoring is spec-vs-code, not screenshot.

## AC coverage (the gate that matters for AG2)

| AC | Design answer | Verdict |
|---|---|---|
| AC-1 empty: purpose + prominent create | EmptyState pitch + primary "Create your first bet" CTA, header "New bet" always present | **Met** |
| AC-2 verdict filter only after ≥1 recorded outcome | `showVerdictFilter = hasAnyRecordedOutcome` — gates on `outcomeVerdict !== null`, never on `bets.length` | **Met** — the headline fix is correctly specified |
| AC-3 every shown control can change the set | Status gated on ≥2 buckets, team on ≥2 teams, verdict on ≥1 outcome; zone omitted when none qualify | **Met** at the control level |
| AC-4 same place at 0/1/50 | Invariant header frame (title + New-bet pinned); only filter zone gains children | **Met** — variant chosen specifically to maximize this |
| AC-5 status+team combine predictably | Existing `filteredBets` AND-narrowing preserved | **Met** |
| AC-6 visual test both entry points + 3 states | Deferred to architecture e2e plan; design enumerates the states | Met at design level |

The honesty rule ("every control can change the result set") is satisfied **at the control level for status/team** and **at the zone level for verdict** — the design explicitly and defensibly chooses to show all five verdict pills once the zone activates rather than only present verdicts (rejected-alternatives #2). This is a justified reading of AC-3, not a violation: the zone cannot appear unless ≥1 outcome exists, so the zone as a whole can always change the set. Accept.

## CRITICAL
None.

## WARNING
- [approved-candidate §Filter honesty gates / AC-3] **Verdict-zone honesty is weaker than status/team honesty and the gap is not stress-tested.** Status and team controls are gated per-control (each individual pill family can narrow). The verdict family shows all five pills the moment one outcome exists — so e.g. a portfolio with exactly one `validated` bet shows "Refuted/Partial/Inconclusive/Not evaluated" pills that cannot narrow anything (clicking Refuted yields the empty-result state). The design defends this as zone-level honesty and it is a reasonable line, but the spec sentence "Every filter control shown can change the visible result set given the current data" is literally about *each control*. Recommend the design explicitly note this as the accepted interpretation in `approved.md` so Phase-4 review does not re-litigate it as a bug. Not blocking — the founder's actual complaint (dead verdict chrome on a zero-outcome portfolio) is fully fixed.

- [approved-candidate §Empty result set] **Team-scoped empty vs filter-excluded empty collision.** Current code already has a `selectedTeamId ? "No bets for this team"` branch inside the same `filteredBets.length === 0` block (code lines 322-339). The approved design introduces a *third* empty meaning ("No bets match these filters" + Clear). The design must specify precedence: zero-bets-portfolio vs team-scoped-empty vs any-filter-excludes-all. As written, the three could overlap (a team filter that excludes all is both "team empty" and "filter excluded"). Architecture §3 collapses to a two-way branch (`bets.length===0` vs `filteredBets.length===0`) and drops the team-specific copy — the design and architecture disagree on whether the "No bets for this team" copy survives. Pin it: recommend one unified "No bets match these filters / Clear filters" for all filter-excluded cases, retiring the team-specific string. Flag for designer to state explicitly.

## SUGGESTION
- [approved-candidate §Token/AQ] **Premium-polish (PP) gaps un-addressed in the spec.** The count sub-line ("3 bets · 1 team") is numeric chrome — AQ-006 tabular-nums would prevent jitter as counts change, but the design doesn't call it out. Verdict/team pills already meet touch-target via py padding per the architecture, but the design never states the focus-ring treatment for the pills (a11y dimension): the existing pills use `aria-pressed` but no explicit `:focus-visible` ring is described. Recommend the design name the focus-ring token so Phase 4 has a contract to check.
- [approved-candidate §Docking transition] The opacity+translateY docking entrance is described as "optional polish." Fine, but if shipped it must wrap in `motion-reduce:` (AQ-014). Already noted in architecture §4 — keep consistent.
- [variant-b] The two-variant exploration is genuine, not theatre: B is a real alternative (single create locus) with an articulated cost, and the decision turns on the single most-scrutinized AC (AC-4). Good design-it-twice discipline.

## What's Working Well
- The core insight — **verdict presence is a function of bet lifecycle stage, not bet existence** — is correctly carried from concept → brief → variant → approved, and the gate (`hasAnyRecordedOutcome`) encodes it exactly. This is the founder's complaint, precisely diagnosed and precisely fixed.
- The "two empties" distinction (empty portfolio = onboarding pitch; empty result set = clear-filters) is the right call and is explicitly protected against the lazy single-empty-state pattern.

---

# ROUND 2 — re-critique of revised approved-candidate.md (commit e6c9039)

Design re-score **8/10 — unchanged** (no material design change; both round-1 WARNINGs resolved at the design level). The two design WARNINGs are now closed:

- **WARNING-design-1 (AC-3 zone honesty)** — RESOLVED. §AC-3 (lines 33–40) records the zone-level-honesty interpretation explicitly and instructs Phase 4 not to re-litigate. Coherent.
- **WARNING-design-2 (empty-state collision)** — RESOLVED. §Body pins exactly two empty states, retires "No bets for this team," and the decision mirrors architecture WARNING-arch-1. Verified safe against the 7 test files (no test asserts the retired string).

## CRITICAL (new — shared with architecture CRITICAL-3)

- **[approved-candidate line 54] — false R2 copy claim.** The design candidate states the empty CTA copy *"Create your first bet" satisfies `/create bet/i`*. **It does not** — `/create bet/i.test("Create your first bet") === false` (the words "your first" break adjacency). R2's 3 `getByRole("button", {name:/create bet/i})` assertions (spec lines 230/239/251/265) stay RED with this copy. The design must pin the primary CTA's **accessible name** to literally contain "create bet" adjacent (simplest: label **"Create bet"**). This is a design-contract defect because the copy string IS the contract Phase 4 enforces. Same root finding as architecture CRITICAL-3; fix in both docs. The design score is unaffected (the visual/UX direction is sound) but the candidate cannot be blessed until the copy string is corrected.

---

# ROUND 3 — final (commit 8996478)

Design re-score **8/10 — unchanged**. The round-2 CRITICAL is **RESOLVED**: `approved-candidate.md` §Body lines 52 & 54 now pin the empty-state CTA's accessible name to the literal label **"Create bet"** (`/create bet/i.test("Create bet") === true`, verified), with "Create your first bet" demoted to non-button pitch prose. The R2 contract (`create-bet-cta` testid + `/create bet/i` accessible name) is now correct in the design doc. Candidate **BLESSED** → `plans/AG2/design/approved.md`. Variant A (persistent frame, docking honest filters). No design findings remain.
