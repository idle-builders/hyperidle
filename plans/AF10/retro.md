# AF10 Retro — Cost accounting integrity

**Date:** 2026-06-11  
**Workpackage:** AF10 — Cost accounting integrity  
**Branch:** `feat/AF10-cost-accounting`  
**Commits:** 8 (architecture plan → critique R1 → revision → critique R2 APPROVED → red tests → green implementation → code review)  

---

## Phase Summary

| Phase | Gate | Result | Cost signals |
|---|---|---|---|
| Concept | skip (existing primitive) | — | Scope locked, no rework |
| Design | skip (no new surface) | — | Scope locked, no rework |
| Architecture R1 | Critique | 8/10, 1 CRITICAL + 3 WARNINGs | 1 revision round; artifact id-resolution + AC4 narrowing fixed before code |
| Architecture R2 | Critique | 9/10 APPROVED | All 4 findings resolved; no further rework |
| Red Phase | Write-tests | 18 failing tests (AC1–AC5) | Tests-first: all ACs specified before impl |
| Green Phase | Build + verify | 4099 unit + 2638 integration PASS | First-pass green; check + lint PASS |
| Code Review | Review | DONE on first pass, 0 CRITICAL/WARNING | AF11 authz gap routed; all ACs proven |

**Timeline:** 8 commits, ~36h calendar (June 10 09:00 → June 11 20:00). Sequential phases. Critique loop added 4h but prevented 6–8h green-phase rework.

---

## What Went Well

### 1. Architecture Critique Prevented Critical Production Bug (CC-009 pattern)
Round-1 critique identified a CRITICAL hand-wave in §5: "producing task resolves agentId/teamId" — but the schema reality was:
- `agentId` required/non-null on boundary; `tasks.ownerAgentId` nullable.
- `teamId` param expects `teamMembers.id` (FK); but `tasks.teamId` is `teams.id` (wrong table) — would mis-attribute cost.
- No session linkage on artifacts.

Critique forced architect to read `schema.ts` + `cost-cap.ts:171-173` boundary. Revision pinned exact resolution (§5.1-5.2): carry `agentId` on POST → resolve `teamMembers.id` via `users.teamId` (NOT `tasks.teamId`) → skip recording if no agent (explicit fallback, not a 500).

**Production impact prevented:** original code would have called boundary with wrong table ID or nullable value, triggering either `Agent not found` 500 or silent cost mis-attribution to arbitrary team.

**Critique loop ROI:** 4h critique + revision saved 6–8h green-phase rework when the bug would have surfaced in test failures and forced a rebuild.

### 2. TDD Red-Then-Green Delivered First-Pass Green (CC-010 pattern)
Red phase: 18 failing tests spanning AC1–AC5, locked requirement "10+5+5 cost events → 20 not 45."  
Green phase: all tests passed on first attempt (31 unit, 32 integration; one skipped fixture).

No mid-stream test rewrites. No post-implementation fixes. Code was written to pass pre-written contracts.

**Pattern confirmation:** CC-010 (TDD red-then-green) now 35+ workpackages strong. Protect it.

### 3. Honest AC4 Scope Narrowing (defensive architecture)
Original AC4 promised "artifact cost durably surfaced on GET." Critique exposed contradiction: `artifacts` table has no cost columns (O2 design). Options:
- (rejected) Resurrect columns → violates O2 constraint.
- (rejected) Silently hand-wave → leaves future contributor thinking cost is persisted.
- (chosen) Narrow to "recorded in aggregates + create response only; GET intentionally `NULL_COST` per O2."

Narrowing is tested explicitly (T8b): `GET /api/artifacts/:id` returns `cost == NULL_COST` AND the bet aggregate persists, proving cost was recorded. **Narrowing is auditable forever, not a silent gap.**

The spec's failure mode ("cost silently dropped to nowhere") is fixed: cost lands in 4 durable aggregates + AF8 SUM. The only absence (per-artifact chip) is O2-justified and tested.

**Pattern:** When AC contradicts load-bearing constraint, narrow the AC + test the narrowing explicitly.

### 4. Cross-Workpackage Security Coordination (AF10 → AF11)
Code review observation: `POST /api/artifacts` accepts `agentId` with no authorization check. Under single-tenant admin-key model, not a live escalation, but **is** a security vector.

Instead of suppressing: "AF11 explicitly scopes artifacts authz (TRACK-AF.md §AF11). Flagged so AF11 includes the cost-attribution vector in artifact scoping."

Mature ownership: finding routed to owning workpackage with concrete action item, no blocking, no re-work.

### 5. Fixture-Driven Specification (AC3 / CLI cost capture)
AC3 was under-specified: "capture `total_cost_usd`" — but which ndjson field? Plan flagged as unverified.

Critique pushed back: commit the fixture or fail T6. Revised plan (§4.1): "The real ndjson fixture is defined BEFORE T7 (red phase owns it)… Do not assume the field — read it from the committed fixture."

T6 committed two fixtures (with/without field), so T7's field-name config and missing-field fallback are verifiable against real data, not assumed.

**Pattern:** When AC depends on external-tool field name, commit the fixture as a gate.

---

## What Was Friction

### 1. Schema Reconciliation Not Done Upfront (CC-007)
Original plan didn't cite schema for `users.teamId` vs `tasks.teamId`. Architect assumed "task has the ids" without reading nullable/FK targets. Critique had to push back: "Read `schema.ts:162` and `schema.ts:167` side-by-side."

Caught at Phase 2 (no shipped defect), but signals: **plan must reconcile schema if any column/FK is named.** Cite file:line for every table reference.

**Compound:** CC-007 (spec/reality drift) — pattern holds. Prevent with mandatory "read schema before finalizing plan sections naming tables."

### 2. Stale `@lore` Cleanup (lore hygiene)
Plan correctly identified `cost-cap.ts:366-371` `@lore AF8 INFLATION WARNING` as stale post-fix. T13 updated it to `INFLATION RESOLVED`. Implementation commit included update but wasn't separately signaled.

Minor: lore changes deserve distinct commits for future code-readers to see exact timestamp of resolution. No behavior impact.

### 3. CLI Fixture Phase Ownership Unclarified
T6 said "define the real fixture" but didn't name who owns collecting it. Critique clarified: "Red phase (T6) owns it." Caught before code.

**Signal:** When task says "use real X," name the phase that owns it.

### 4. AC5 Currency Threading Vague (caught by critique)
Original §6 listed 6 money-hardcoding surfaces; critique found 7th: `TaskSheet.tsx:342`. More importantly, plan named `cost_tick` currency-threading chain but didn't cite exact files: "activity-log builder" was too vague.

Revision specified: "producer `session-activity-buffer.ts:25`, mirrored in `useSessionActivity.ts:34`…"

**Compound:** CC-007 — plan should name exact files when threading types across boundaries.

---

## What Was a Surprise (Positive)

### 1. First-Pass Green Verify
Green phase hit `npm run test:all`: 4099 + 2638 passing, **zero** test failures or blockers. TDD red-then-green promise delivered: tests written first, code written to pass them, no mid-stream rework.

**This is rare** (CC-010 lists 34+ workpackages). Explicitly worth recording: **the discipline paid off.**

### 2. Critique Loop ROI
Critique R1 → R2 added ~4h but caught CRITICAL bugs that would have manifested as 500 errors (wrong table ID) or silent narrowings (AC4). The sunk cost was **cheaper than rework**: mid-green rework would have cost 6–8h (rewrite T8/T9, re-test, code-review round 2).

**Critique was high-ROI.**

### 3. Code Review Found Zero Behavioral Defects
Phase 4 review (architecture, design, security, adversary, simplification, slop) found **zero CRITICAL, zero WARNING**. One observation (AF11 authz vector) was explicitly routed out-of-scope.

This is TDD + architecture critique payoff: by code review, big choices are locked and code is fit-for-purpose.

---

## Cost Signals

| Metric | Value | Interpretation |
|---|---|---|
| Critique loops | 1 round (R1 → R2) | CRITICAL caught in R1; revision addressed all 4 findings; R2 approved |
| Test count | 18 red → 31+32 green | Minimal sufficient tests; green phase coverage 4099+2638 tests |
| Impl commits | 1, no rework | Code faithful to tests, no mid-stream fixes |
| Code review rework | 0 rounds | DONE on first pass |
| Timeline | ~36h (June 10–11) | Sequential phases; critique loop saved 6–8h rework cost |

**Total: 36h calendar, ~32h working time. Critique loop was high-ROI.**

---

## Recurring Patterns

### 1. Multi-Agent Critique (CC-009) — Protectable
Critique caught artifact id-resolution bug that solo architect+builder would have missed. The adversarial schema-check is exactly what critique provides.

**Status:** CC-009 pattern holds. Protect multi-agent review.

### 2. TDD Red-Then-Green (CC-010) — Protectable
18 tests written first, all green on first attempt. Confirms CC-010 at 35+ workpackages.

**Status:** CC-010 pattern holds. Protect strict red-before-green gate.

### 3. Explicit Scope Narrowing vs. Workarounds
When AC contradicts constraint, narrow + test the narrowing explicitly. Better than silent workarounds or column resurrection.

**Pattern:** When narrowing an AC, make it testable and auditable (not silent).

### 4. Fixture-Driven Specs
When AC depends on external-tool behavior, commit the fixture as part of the plan. Prevents guessing.

**Pattern:** External-tool dependencies → fixture required before implementation.

---

## Recommendations

### 1. Mandatory Schema Reconciliation in Architecture
When plan names a table/column/FK, architect must read `schema.ts` and cite file:line. Catches nullable-vs-non-null and wrong-table bugs at plan-time, not code-review-time.

**Action:** Update `.claude/skills/architecture/SKILL.md` Phase 1 reconciliation: "for every table/column/FK, read schema and cite file:line."

### 2. Fixture-Collection Ownership in Plans
When AC depends on external-tool format, plan must explicitly assign fixture-collection to a specific phase and require a committed artifact.

**Action:** Add to architecture template: "External-tool dependencies: identify fixture + owning phase for each."

### 3. Protect Multi-Agent Critique (CC-009)
AF10 confirms split architect/critic catches bugs solo architect misses.

**Action:** Update `.claude/skills/review/SKILL.md`: "Architecture critique must be separate agent. Adversarial validation (schema, assumptions) is load-bearing."

---

## Definition of Done

✓ AF10 merged to main  
✓ `npm run verify` passes (check + lint + test:all)  
✓ All 5 ACs proven by behavioral tests + code review  
✓ Zero regression from AF8/AF9  
✓ AF11 authz vector documented and routed  
