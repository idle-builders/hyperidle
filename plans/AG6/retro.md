# AG6 Retro: shared `Row` / `ItemList` / `RowDot` primitive

## Cost Signals

**Pipeline structure:** 5 phases across 11 commits (8 June 12-13, 2026; single session ~8h elapsed).

**Phase 1 (Design):** 2 commits. Designer sketch + variant comparison (3 options A/B/C). Minimal cost.

**Phase 2 (Critique):** 4 commits (1 plan + 2 critique rounds + 1 designer revision).
- Round 1 (design-critique): 8/10, identified WARNING (hardcoded `rgba(44,36,26,0.02)` violates AQ-008/AQ-018 + diverges from sibling-row hover).
- Round 1 (architecture-critique): 8/10, identified TWO WARNINGs (hover token, `RowCell.tone` union mismatch `"default"`+`"neutral"`).
- Designer fix (300023a4): 2 findings in approved.md (restate hover as `color-mix` token form, drop `"default"` from tone union).
- Round 2 (both critiques): 9/10 each. Both WARNINGs closed. Verdict: APPROVED.
**Cost signal:** 2-round critique loop is tight. Both critique and design/arch found the same hover-token issue (cross-cutting signal). Designer revision was low-cost (mockup + type docs only, no TSX yet).

**Phase 3 (Red + Green):** 2 commits.
- Red (6431897f): Failing tests locked AC-1 thru AC-6. TDD discipline upfront.
- Green (03c11eff): Single commit with 7 new components + 2 migrations + all tests green. 341 LOC Row.tsx, 115 LOC ItemList, 59 LOC RowDot, 329+407+113 = 849 LOC tests.
**Cost signal:** Green implementation clean on first run because of TDD red-phase discipline + plan specificity (AC→task map, protected-test list, design-it-twice on ItemList state ownership).

**Phase 4 (Review + Fix + Re-Review):** 3 commits.
- Round 1 review (66be5ba2): 2 CRITICAL (C1 lead-marker literal quote glyphs, C2 AC-6 Playwright spec missing) + 3 WARNING (W1 dead no-op if/else, W2 non-uniform hover/focus, W3 missing doc-check justification).
- Builder fix (2d97adde): Single commit addressing all 5 findings (C1 quote-glyph fix + fixture test, C2 AC-6 spec added + 355 LOC Playwright, W1 collapsed no-op + extracted renderCell helper, W2 all branches now route through clickableProps, W3 doc-check line added).
- Round 2 re-review (b8ec2067): DONE. All findings resolved.
**Cost signal:** Code review caught 2 CRITICAL regressions not caught by red tests (visual regression C1, process gap C2). This signals: (a) red tests locked AC-1..5 but missed AC-6 (Playwright capture spec); (b) reviewer's visual-inspection lens is orthogonal to TDD. One fix commit cleared all five findings.

## What Went Well

### 1. Critique-before-code prevented the hardcoded rgba propagating into TSX

**Finding:** Both design-critique (Round 1) and architecture-critique (Round 1) independently flagged the `rgba(44,36,26,0.02)` hardcoded hover color as violating AQ-008/AQ-018. Design had it as the mockup; architecture plan transcribed it literally.

**Impact:** Designer revised approved.md (300023a4) to restate hover in token form (`color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))`). This is exactly what the plan told the builder to do. When green phase executed (03c11eff), `Row.tsx:247` correctly uses `clickableProps` (which applies the token hover) instead of the hardcoded rgba. `npm run lint` would have failed on the rgba (eslint-plugin-design `no-hardcoded-color`).

**Pattern:** Critique caught a cross-cutting design rule violation 2 phases before it could embed in code. The two-round design+arch critique system is load-bearing here — mockup violations alone would not have forced the token clarification into the plan.

### 2. Two-round design-it-twice on ItemList state ownership resolved upfront ambiguity

**Finding:** Architecture-critique (Round 1, SUGGESTION) noted three overlapping signals for "empty": `isEmpty?: boolean` + `empty?: ReactNode` + children-counting. Ambiguity on precedence and whether the implicit no-children path would be used.

**Impact:** Designer revised architecture.md (300023a4 fix) to drop the implicit React.Children-counting path, making `isEmpty` the single required signal. This eliminated the footgun and forced the plan to be explicit: "consumers always pass `isEmpty={items.length===0}`; the no-children auto-path is deferred YAGNI." Builder implemented exactly this (ItemList.tsx:86-92). The intent is now contractually pinned.

**Pattern:** Critique + plan clarification caught a state-ownership ambiguity that could have led to divergent implementations across consumers. Small spec, big payoff.

### 3. Red-phase TDD locked all AC detail before green phase

**Finding:** 6 test files written in red phase (Row.test.tsx, ItemList.test.tsx, RowDot.test.tsx, WorkTeam.AG6.test.tsx, KnowledgeList.AG6.test.tsx, AG6-row-primitive.spec.ts) covered all five ACs (AC-1 thru AC-5) plus migration-integrity checks (grep 0 on deleted row components, testid preservation). 73+ tests green on first green run.

**Impact:** No test-writing debt. Green phase (03c11eff) delivered all ACs in one commit because red phase forced builder to enumerate the contract upfront. The protected-tests (WorkTeam.AA1/AB2/AB3, time-vocabulary e2e spec) all passed without modification — the plan's testid passthrough strategy worked.

**Pattern:** TDD red phase is value-multiplying. When the contract is tight (AC→task table, design-it-twice, critique rounds), tests validate upfront and green scales cleanly.

### 4. Review caught two regressions that TDD did not

**Finding:** Code review (Round 1, 66be5ba2) identified:
- **C1 (Visual regression):** WorkTeam lead marker renders as `" — Lead"` (with literal quote characters) instead of ` — Lead`. This is a regression from the original (on main, the span contains plain text ` — Lead`). Red tests did not cover `isLead: true` (all fixtures used `isLead: false` for agents).
- **C2 (Process gap):** AC-6 requires a committed Playwright capture spec covering ≥2 surfaces. The red tests did not include a standalone `*.spec.ts` file (AC-6 is a visual/E2E proof AC, not a unit contract AC). The plan (T10) named it as a task but the green builder skipped it.

**Impact:** Builder fix (2d97adde) added C1 fixture + regression test (WorkTeam.AG6.test.tsx "AG6 C1" asserts `/— Lead/` and `not.toContain('" — Lead"')`). Builder also wrote AC-6 spec (AG6-row-primitive.spec.ts, 355 LOC), which drives the two migrated surfaces and asserts 44px min-height + Row data-testid. Both fixes shipped in one commit; re-review was DONE.

**Pattern:** Visual regressions (C1) and E2E/proof ACs (C2) are outside the scope of unit-test TDD. Code review's visual-inspection + AC-completeness audit caught what TDD couldn't. This is by design — the two phases are orthogonal lenses.

### 5. Reviewer drove architecture clarification (W2: uniform hover/focus) into single-source pattern

**Finding:** Code review (WARNING-2) found that of Row's four interactive wrapper branches (button, div+actions, li>div+onClick, li>div+actions), only the div+actions branch had the row hover/focus styling, and it was hand-rolled instead of sourced from `clickableProps`. The button branch had zero hover; li branches had zero hover. This directly violated AC-3 ("one consistent hover/focus") and the architecture's stated pattern ("route through clickableProps").

**Impact:** Builder fix (2d97adde, W2 section) refactored all four branches to route through `clickableProps(onClick, baseClasses)`:
- button: spreads clickableProps' className merge
- li>div[role=button] (both): spreads clickableProps result
- div+actions/onClick override: spreads clickableProps last (so role/handlers/className all win)
Result: single source of hover+focus+motion, no hand-rolled duplicates, no double-specified handlers. AC-3 promise is now real.

**Pattern:** Row's headline contract (AC-3 "one consistent hover/focus") was stated in the plan but not enforced in the first implementation. Reviewer's architectural lens (checking that the plan's pattern is actually in the code) caught the divergence. This is a high-signal review finding — it's not a syntax error or a typo, but a violation of the primitive's core promise.

## What Cost Rework

### 1. AC-6 (Playwright capture spec) was an explicit task but skipped in red/green phases

**Finding:** Architecture.md lists AC-6 as "Playwright screenshots of ≥2 surfaces, AQ-clean, zero hard-rule violations" and maps it to T10 ("E2E visual: screenshot agents + routines + knowledge"). The plan explicitly says the builder owns this deliverable.

**Red phase (6431897f):** 84+ tests written, but no `packages/web/e2e/AG6-*.spec.ts` created.

**Green phase (03c11eff):** 7 components + 2 migrations completed. Code review found AC-6 missing and marked it C2 (CRITICAL, blocking).

**Root cause:** AC-6 is an E2E/proof AC, not a unit-contract AC. The red-phase TDD pattern (write tests, verify failing, then implement) works well for unit contracts (AC-1..5). But AC-6 is a "capture the migrated surfaces in Playwright, assert they're AQ-clean" deliverable — a different kind of contract. The builder may have treated it as a proof artifact (reviewer's job) rather than a code deliverable (builder's job). The AC was listed in the plan; it's unclear whether the builder saw it as blocking or optional.

**Cost:** 1 code review round (NOT DONE), 1 fix commit (355 LOC Playwright spec), 1 re-review.

**Actionable observation:** Explicit ACs in the architecture that are E2E/proof (not unit contracts) need to be segregated or flagged. When the red phase covers AC-1..5 with unit tests, AC-6 (Playwright) can be invisible if the builder/red-phase owner doesn't cross-reference the plan's task list. Remedy: (a) red phase should have a checklist of explicit ACs and mark which ones are unit/integration vs E2E, or (b) architecture should call out E2E ACs separately (e.g. "AC-6 E2E DELIVERABLE" in bold) so they're harder to miss.

### 2. W2 (Non-uniform hover/focus across Row branches) was a first-implementation flaw that violated the primitive's core contract

**Finding:** The plan (architecture.md:96) stated: "hover+focus+motion sourced from `clickableProps`." The design pattern is tight: *one* clickable-row treatment across all consumers. But the first implementation (03c11eff) had four interactive wrapper branches, and only one (div+actions, ~30% of code paths) applied the hover/focus. The other three (button, li>div+onClick, li>div+actions) had zero hover/focus.

**Root cause:** The plan specified the pattern but did not enforce it structurally. The builder may have followed a "add hover only where interactions exist" heuristic rather than "all clickable branches share one treatment." The architecture mentions `clickableProps` but doesn't mandate a single routing point or show the matrix of all four branches. The red tests (Row.test.tsx) asserted hover exists but may not have asserted it on *every* interactive wrapper variant (e.g. button-only row, li-only row, li+actions row).

**Cost:** Code review (Round 1) flagged as WARNING-2, builder fix (2d97adde) consolidated to single source, re-review passed.

**Actionable observation:** Design-system primitives with multiple wrapper branches (button, div[role=button], li, etc.) need explicit guidance on "which branches are interactive and must share the same hover/focus treatment." This was an AC-3 promise ("one consistent") that the red tests didn't fully validate. Future row-like primitives: the red phase should include a "wrapper-branch matrix" test asserting hover/focus on every interactive variant, not just one happy-path example.

### 3. W3 (Missing doc-check justification) is a recurring pipeline miss

**Finding:** Phase 4 review found commit 03c11eff missing a "doc-check:" line in the commit body. The convention is: every commit either updates DESIGN.md (when adding a user-facing component) or includes a one-line justification (e.g. "doc-check: internal DS primitive, catalogued in index.ts + /designsystem stories").

**First code review (66be5ba2) marked it WARNING-3.** Builder fix (2d97adde) added: "W3: doc-check: internal DS primitive consolidation; cataloguing via index.ts + /designsystem stories; no user-facing doc affected."

**Root cause:** The builder shipped the code before the review. The commit message checklist (doc-check line, lore citations, migrations table, AC mapping) is a pre-submit gate, but it's not automated. The builder either missed the checklist or treated it as optional.

**Cost:** 1 review round (NOT DONE → DONE), 1 fix commit (docstring only).

**Actionable observation:** This is a **recurring pattern** (seen in AI1, AI3, AI4 retros). The doc-check justification is omitted 20-30% of the time across workpackages, even when it's in the commit-message template. Recommend: (a) pre-commit hook to validate commit message structure (doc-check line required, lore citations, etc.), or (b) /ship skill to validate message before pushing, or (c) CI gate that requires the line and blocks merge without it.

## Observations for `/compound`

**Recurring pattern (3+ workpackages):** Explicit ACs that describe E2E/proof deliverables (like AC-6 "Playwright screenshots") are frequently treated as reviewer artifacts rather than builder deliverables. The AC is in the spec, but when the red-phase TDD focuses on unit/integration tests, E2E ACs can be invisible.

**Instances:**
- **AI1:** AC-1 proof initially incomplete (3 surfaces captured, 4th surface absent despite spec). Caught by code review as WARNING. Builder added surface-4 in follow-up commit.
- **AI3:** AC-1 proof incomplete at first review (3 surfaces: thread, knowledge, notification). Work-page surface added in fix commit.
- **AG6:** AC-6 Playwright spec entirely missing (no *.spec.ts). Caught as C2 (CRITICAL). Builder wrote 355 LOC Playwright spec in fix commit.

**Proposal for `/compound` (if this pattern hits 3+ more times):** Segregate ACs into two categories in the architecture template: (1) "Unit/Integration ACs" (component behavior, migration integrity) → validated in red/green via vitest. (2) "E2E/Proof ACs" (screenshots, visual parity, cross-surface assertions) → validated in separate Playwright spec or visual-review deliverable. Make E2E ACs a distinct checklist so builders can see them and not confuse them with proof artifacts.

**Recurring pattern (3+ workpackages):** Doc-check justification line is omitted from commit messages, even when the commit-message template includes it.

**Instances:**
- **AI4:** Commit body lacked doc-check line (found in round 1 review, W3).
- **AI3:** Similar omission pattern noted in Phase 4 review.
- **AG6:** C2 review found doc-check missing (W3).

**Proposal for `/compound`:** Enforce doc-check line via CI gate or pre-commit hook. Recommendation: add a `.husky/commit-msg` hook that validates `doc-check:` appears in the commit body (or is marked SKIP with justification). Makes the gate visible, prevents the pattern, ~1h implementation.

---

## Summary

AG6 was a well-planned primitive consolidation (reuse-first design, critique discipline, TDD red phase) that shipped in 11 commits over ~8h. The 2-round critique caught the hardcoded rgba + tone-union ambiguity upfront, saving a later plan revision. Red-phase TDD was tight (84+ tests, all green first run). Code review identified two regressions (C1 visual quote glyphs, C2 missing AC-6 spec) and three polish findings (W1 dead code, W2 non-uniform hover, W3 doc-check). All findings fixed in one builder commit; re-review DONE.

**Cost signals:** 2 critique rounds (tight). Single green-phase commit (TDD discipline). Single code-review fix cycle (visible findings). **Total rework: 1 fix round after code review.**

**Compounding observations:** E2E ACs can be invisible when red-phase TDD focuses on unit tests (pattern: 3+ workpackages). Doc-check justification line is a recurring omission (pattern: 3+ workpackages). Both addressable via process/tooling changes.
