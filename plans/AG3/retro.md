# AG3 Retro — Bet authoring is block editing

**Date:** 2026-06-13 (retro phase, fresh-context observation)  
**Workpackage:** AG3  
**Track:** AG (Work View Experience)  
**Timeline:** 2026-06-13 00:25 → ~2026-06-13 20:30 (~20h elapsed, 3 phases + rework)

---

## Observations Summary

AG3 executed the full pipeline (concept → design → design-critique R1/R2 → architecture → architecture-critique R1/R2 → red-phase tests → green-phase impl → code-review R1 → review-fix rework → retro) with two revision loops required by critique feedback, then one fix round during code review. All acceptance criteria shipped and tested. The workpackage demonstrates the value of multi-round critique catching real defects early.

---

## Key Observations

### Pipeline Discipline

**`type: success`**  
Critique-revision loop was load-bearing. Phase 2 design-critique (R1 score 8/10) identified WARNING-1 (frame-parity claim unverified) and WARNING-2 (appetite reversal unarticulated), plus 3 suggestions. Designer revised (R2 upgrade to 9/10, all findings resolved). Architecture-critique independently verified both at cold-read against live code and re-scoped AC3 to experience-parity (both edit surfaces frameless, explicitly NOT create-chassis identity). Round 1 CRITICAL (second entry point missed) enumerated in round 2 plus protected-test re-targeting. Both critique rounds' findings directly prevented TS build failures and test regressions that would have surfaced at code-review or CI merge — the process gates worked and were essential.

**Tags:** `critique-follow-through`, `revision-discipline`, `process-value`

**Compound:** CC-024 (critique findings not applied) — CONFIRMED working as intended; CR found zero "re-discovered critique item" issues.

---

### Specification Precision

**`type: friction`**  
The initial plan called for "reuse the same BodyEditor in three places" but the design claimed bet *edit* was already at full-parity when no cold read of the knowledge *edit* surface had been done. Architecture-critique (CRITICAL-1) and design-critique (W1) caught this separately — the same unverified assumption, two reviewers finding it via different lenses. Root cause: the design brief said "preserve, don't touch bet edit" but never opened `KnowledgeDetail.tsx:823-833` to confirm the comparison. Cold read in critique fixed it (they *do* match: both frameless `<div>` → `BodyEditor variant="full" minHeight="200px"`). Pattern observation: "already done" claims in a spec must be verified by cold-read against actual codebase before the claim is carried forward to AC + verification. The cost was minimal (2-round revision before code), but illustrates CC-007 pattern (spec/reality drift discovered late).

**Severity:** medium  
**Tags:** `plan-verification`, `cold-read`, `spec-precision`  
**Compound:** CC-007 (spec/codebase drift)

---

### Design-It-Twice Judgment

**`type: success`**  
The design-it-twice tradeoff for teams data source (A: call `useTeams()` in the page vs B: route state) was correctly decided. Opted for A (self-sufficient route page, matches `WorkPortfolio`'s own source). Trade-off was explicit (nominal refetch cost, worth the self-sufficiency). This judgement did not waver; architecture confirmed it and builder executed it cleanly. The design-it-twice box genuinely surfaces real alternatives, not straw men.

**Severity:** low  
**Tags:** `design-discipline`, `tradeoff-rigor`

---

### Appetite Restoration & Lore

**`type: observation`**  
AG3 restores `costAppetite` to bet creation after `@lore R2` removed it from the cramped dialog. The concept and design identified this but neither stated *why* R2 removed it or *why* restoration is correct now. Architecture-critique flagged it as WARNING-2. The builder added the required `@lore` comment in `WorkBetCreate.tsx` + task #3 recipe recorded the rationale: R2 stripped it (cramped space), AG3 restores it (full-page aside has room, AC4 names it). This prevents future cleanup agents from re-removing it citing R2. The fix was trivial (one sentence) but necessary for durable decision-making. Pattern: major reversals of prior decisions need a `@lore` breadcrumb in the new code AND in the plan.

**Severity:** low  
**Tags:** `lore-effective`, `decision-tracking`

---

### Second Entry Point & Protected Tests

**`type: critical-resolved`**  
Architecture-critique Round 1 caught a CRITICAL the plan missed: `WorkPortfolio` has TWO "New bet" entry points (toolbar button `:247` + empty-state CTA `:411` with the `create-bet-cta` selector from `@lore AG2`). The initial plan only named one and said "re-point the new-bet button". If the builder re-pointed `:247` but removed `setDialogOpen` state, line `:411` would reference a deleted function → TS build failure or dead handler. Furthermore, the empty-state CTA was protected by *two* e2e specs (`AG2-portfolio-arrival.spec.ts` `:231` and `R2-work-first-landing.spec.ts` `:247`) asserting the CTA's visibility and behavior, neither listed in the initial `protectedTests` set. Architecture Round 2 enumerated both call sites, both protected specs (with re-target directives for dialog→navigate), and the dead-code guards (`refreshBets` consumer check, `teams` prop-passing removal). Builder executed per the revised enumeration; no TS failure, no test regression. This is an exemplary pattern of critique catching an off-by-one defect before code, and plan revision preventing a build breakage.

**Severity:** high (but caught early)  
**Tags:** `architecture-completeness`, `protected-test-enumeration`, `early-defect-catch`  
**Compound:** CC-008 (protected-test-drift) — the pattern confirms it; plans must enumerate *every* protected spec.

---

### TDD Red Phase Completeness

**`type: success`**  
Red phase (`WorkBetCreate.test.tsx` + `WorkPortfolio.AG3.test.tsx`) wrote 43 tests covering all AC scenarios (page render, both entry-point navigations, team auto-resolve, appetite optional, POST behavior, cancel guards, error states, E2E create + edit flows). All 43 green on first green-phase run. The test suite caught the subtle "both entry points must navigate" requirement that was easy to miss (only the first one tested would have sufficed for AC2 if not disciplined). Red-phase writing forces enumeration before implementation.

**Severity:** low  
**Tags:** `tdd-red-phase`, `working-process`  
**Compound:** CC-010 (TDD pays off) — confirmed.

---

### Code Review — Polish Findings

**`type: friction`**  
Phase 4 code review (PASS, zero CRITICAL, 3 WARNINGS) found:
1. Stale `@lore` comment in `WorkPortfolio.tsx:10` (still said "opens BetCreateDialog" after behavior changed to navigation) — fixed in a follow-up commit.
2. Appetite amount input used raw `<input>` instead of design-system `Input` component, despite both approved design and architecture specifying `Input`. Precedent: the legacy `AppetiteDialog` also hand-rolled it, so the choice was consistent-by-precedent but violated the reuse-first gate. Fixed in follow-up.
3. Currency `Select` `w-[72px]` clipped "USD" to "US" due to insufficient width. Flagged for `/visual-polish` (deferred, not blocking).

All three were polish/consistency issues, not functional regressions. The first was caught because the reviewer read the actual comment; the second because the reviewer audited component reuse against the plan. No blocking issues. Builder applied fixes in two follow-up commits before merge.

**Severity:** low (all polish)  
**Tags:** `code-review-quality`, `reuse-first`, `precision-gate`  
**Compound:** CC-022 (component reuse drift) — one data point confirming the pattern.

---

### Blockchain-Backed Assertions & Verification

**`type: success`**  
The plan's §protectedTests section (43 tests + 5 E2E screenshots) + Phase 4 review's lenses verified every AC claim against the diff:
- AC1 (full-page, no dialog): grep confirmed `BetCreateDialog` deleted, only comments/lore remain.
- AC2 (both entry points): diff shows both `:247` + `:411` → `navigate`, with test assertions green.
- AC3 (edit parity): screenshot side-by-side (`ag3-bet-edit-surface.png` ↔ `ag3-knowledge-edit-parity.png`) compared under Risk #5 definition.
- AC4–AC8: each backed by test assertions, payload inspection (empty appetite ⇒ omitted), error mocking, E2E.

This is the /review skill's AC-completeness audit working cleanly. Zero AC that required builder interpretation.

**Severity:** low  
**Tags:** `ac-audit`, `evidence-based`

---

### Lore Density & Decision Capture

**`type: observation`**  
The builder added four @lore comments:
1. Appetite restoration (R2 context + API support rationale) — required by architecture task #3.
2. Responsive collapse (KnowledgeCreate has none; AG3 adds it; do not retrofit Knowledge) — required by architecture SUGGESTION.
3. `isDirty` alias (mirrors old dialog's guard, confirms Intent) — explanatory.
4. `useTeams()` unconditional call (rules of hooks, test harness MSW/stub) — clarification.

Lore signals decisions and gotchas efficiently. No filler. The cost of capturing lore is minimal; the benefit (future agents understand *why*, not just *what*) is high. Pattern: working.

**Severity:** low  
**Tags:** `lore-effective`, `documentation`

---

### Worktree Lifecycle & Mid-Verify Handoff

**`type: friction`**  
Phase 4 `/verify` session ended mid-run (likely due to long elapsed time or session limit), requiring a second builder session to complete the final E2E screenshot capture and merge. The progress file shows the workpackage bounced between states. This is a known pattern (CC-005, worktree session management), but cost signal: long-running verify + concurrent worktrees can fragment a builder session. The subsequent builder successfully captured the missing proof and merged cleanly. No blocker, but signals brittleness in session continuity for long workpackages.

**Severity:** medium  
**Tags:** `worktree-lifecycle`, `session-continuity`, `cost-signal`  
**Compound:** CC-005 (worktree corruption/cleanup).

---

### Cost Signal

**Phase timeline:**
- Concept (`:18:25`): ~15 min (no new nouns, straightforward).
- Design: design + Round-1 critique + revision + Round-2 critique APPROVED: ~3h.
- Architecture: plan + Round-1 critique CRITICAL + revision + Round-2 critique APPROVED: ~2h.
- Red phase: 43 tests written, component + integration + E2E: ~2h.
- Green phase: implementation + E2E screenshots + attestation: ~4h.
- Code review Round 1: 3 polish findings, builder rework: ~1h fix.
- Total: ~12h cumulative design + architecture, ~6h build, ~1h rework = ~19h (long elapsed time ~20h due to session break).

**Cost drivers:**
- Critique revision loops (2 design + 2 architecture rounds) — necessary (caught real defects); total added ~2h but prevented build failures.
- Parallel E2E screenshot capture (5 PNGs, side-by-side review) — required for AC8; straightforward once proof bar is clear.
- Mid-verify session break — additional context-switch cost for a second builder session.

**Net assessment:** The workpackage is `complexity: M` and shipped as planned (~18-20h realistic for full pipeline with critique revision). Critique investment paid off (caught CRITICAL + 3 WARNINGs before code). No scope creep, no scope underestimate.

**Tags:** `cost-signal`, `timeline`, `critique-investment`

---

## Compound Candidate Summary

Observations reference the following compound candidates:

| ID | Observation | Status |
|---|---|---|
| CC-007 | Spec/codebase reality drift | Recurring: "already done" claims not cold-verified before carrying to plan. Design/architecture Phase 1 reconciliation helped but the verify step is still optional. |
| CC-008 | Protected-test drift | Recurring: architect enumerated only 1 of 2 entry points. The rule (enumerate all affected e2e files) exists in `.architecture/SKILL.md` but execution gaps remain. Pattern: find all call sites by grep before naming them in plan. |
| CC-010 | TDD red-green | Confirmed working: all 43 tests green first run. Red phase caught "both entry points" requirement. Keep the discipline. |
| CC-022 | Component reuse drift | One data point: appetite input hand-rolled despite design+architecture specifying `Input`. Not a pattern yet (1 of many design-system adoptions on track), but noted. |
| CC-024 | Critique findings not applied | Confirmed resolved: critique revisions were folded into plan before code, builder received a clean brief. |

No new candidates. AG3's observations fit existing tracked patterns.

---

## Process Notes

- Fresh-context retro per protocol: read work-package spec, progress file, pipeline artifacts (concept/design/critique/architecture/review/commits), git history.
- All observations grounded in artifact evidence (files, commits, test results, screenshots).
- Severity calibrated against impact (CRITICAL = build breaks / regressions, high = extra work needed, medium = friction / extended session, low = observations for pattern-tracking).

