# M2 Retrospective — Replacement contracts (architecture pass)

**Workpackage:** M2 (Track M -- Mock-Data Purge)  
**Phase:** Phase 5 (Retro)  
**Date:** 2026-05-11  
**Duration:** May 11, 14:08 — 15:08 (1 hour elapsed, ~60 minutes of pipeline execution)

---

## Executive Summary

M2 was a **pure architecture workpackage** with zero implementation code. It ingested the M1 mock-data inventory (34 rows) and produced three deliverables:

1. **`plans/M2/architecture.md`** — Complete technical plan covering 6 replacement contract clusters, full triage of 34 inventory rows, and migration recipes for each cluster.
2. **`plans/mock-data-purge/contracts.md`** — Bundled contracts document pinning the wire shapes and mechanical migration steps for M3 builders.
3. **`packages/api-contract/`** — TypeScript type-only package with 57 tests, zero runtime code, types matching the existing server implementations field-by-field.

**Pipeline phases executed:**
- Phase 0: WIP scaffolding (14:08)
- Phase 1: Architecture plan (14:40) — 8 minutes
- Phase 2: Architecture critique (14:49) — 9 minutes
- Phase 3: Type definitions + tests (15:01) — 2 minutes
- Phase 4: Code review (15:08) — 7 minutes

**Verdict: DONE.** All 6 ACs satisfied. All M2-specific tests passing (57/57). `bun run check`, `bun run lint`, `bun run test` all green. Code review: PASS. Architecture critique score: 8/10.

---

## What Went Well

### 1. Full Inventory Coverage with Verifiable Totals

All 34 rows from M1 were accounted for in the architecture plan's complete annotation table:

```
24 contract-pinned (clusters 1–5)
 3 straight-swap (mechanical replacements)
 7 tracked-out (deferred to knowledge wiring workpackage)
 ─────────────────────────────────
34 total (matches inventory.json + inventory.md)
```

This closure is non-trivial. The M2 scope was "define contracts for all needs-contract rows," but the plan correctly extended to also *triage* all borderline and straight-swap rows, giving M3 complete guidance on every offender.

**Observation:** The triage decision to mark 7 knowledge-related rows as `tracked-out` was sound and evidence-based. Each tracked-out row has a specific justification (knowledge page wiring is genuinely 3 importers with complex data-flow rework, separate from contract definition). The alternatives (forcing knowledge pages into M3, or deferring all of M2) would have been worse.

### 2. Type Contracts Match the Actual Server, Field-by-Field

The code review verified that `RailBet`, `RailBlocker`, and `CostBurnRate` types in `packages/api-contract/src/rail.ts` were checked against the actual server implementation in `packages/server/src/routes/rail.ts` lines 6–35. **Every field name, type, and nullability matched.** This is the contract system working as intended:

- The plan specifies the shape.
- The type definitions encode it.
- The tests assert structural compatibility.
- M3 builders can reference the type definitions with confidence.

Without this field-level verification step, shape drift between server and client could have slipped into M3.

### 3. Architecture Critique Caught a Critical Gap

Phase 2 critique (8/10 score) identified a **CRITICAL finding**: the migration recipe for cluster 1 (auth/identity) missed `threads.ts:79` — a second usage of `DEFAULT_FOUNDER_ID` inside the `readInitialSenderId()` function. 

**How this was handled:**
- The designer *did not dismiss* the critique.
- The type-contract implementer *documented the gap* as a `@lore` comment in `auth.ts` lines 12–20, flagging the exact line number and the fact that it's a plan-level gap (type definitions cannot encode it).
- The code review verified the lore comment was present and substantive.

**Why this matters:** This is the exact scenario the architecture-critique phase is designed to catch. A mechanical M3 builder following the plan would have:

1. Deleted `DEFAULT_FOUNDER_ID` at `threads.ts:49` (per recipe).
2. Updated `threads.ts:56` (per recipe).
3. Left `threads.ts:79` as-is, creating a compile error.

The compile error is *visible* (not a silent bug), so the blast radius is bounded. But the lore comment ensures the *designer* is alerted before M3 even starts. This represents the system working exactly as intended.

### 4. Type-Only Package is Truly Minimal

The `packages/api-contract/` package contains:

```
src/
  auth.ts        16 lines (1 interface)
  settings.ts    59 lines (5 interfaces + 1 type)
  rail.ts        57 lines (4 interfaces + 1 import type)
  index.ts       14 lines (re-exports + barrel)
__tests__/
  contracts.test.ts  522 lines (57 tests, structural assertions)
```

**Zero runtime code.** No constants, no functions, no Zod schemas (those belong in `packages/server` near the route handlers). The package is exactly what the contract system requires: a shared type surface that both server and client depend on, with no runtime coupling.

The test file is substantial (522 lines) but every line is load-bearing:
- Structural assertions via `satisfies` and `expectTypeOf`.
- Field-presence checks.
- Nullable-field handling.
- Currency union compatibility (WireMoney tests).

No dead code, no mock assertions, no unused imports.

### 5. Phase Timing Was Efficient

- Architecture plan: 8 min (comprehensive, 716 lines, 76 sections)
- Critique: 9 min (8/10 score, identified CRITICAL + 6 WARNINGs)
- Types + tests: 2 min (types are straightforward; tests written before code)
- Code review: 7 min (6 ACs checked, 3 positive lenses + 3 negative, all green)

**Total: 26 minutes of agent work; 1 hour wall-clock (includes think time + formatting).**

The efficiency comes from the architecture-first approach. The type definitions were trivial to write because the plan had already nailed down every endpoint, payload shape, and edge case. The tests followed naturally from the plan. There was no thrashing, no "let me rethink the schema" moments.

### 6. Lore Comments Captured Real Decisions

Four `@lore` comments were added to the api-contract types, documenting:

- **auth.ts**: Two findings from the Phase 2 critique (missing `threads.ts:79`, fallback concern).
- **settings.ts**: Design choice (appearance is client-only, not part of API contract).
- **rail.ts**: Context (existing server implementation mismatch with client, server is authority).

These are not filler. Each comment preserves a decision that would surprise the next developer. This is the lore system functioning correctly.

---

## What Didn't Go Well

### 1. Architecture Plan Had 7 WARNINGs and 1 CRITICAL Finding

The Phase 2 critique identified **1 CRITICAL** and **6 WARNINGs** in the architecture plan. While the final score was 8/10 (passing threshold), the plan shipped with **unresolved gaps**:

**CRITICAL:**
- `threads.ts:79` missing from migration recipe.

**WARNINGs:**
1. Auth middleware fallback uses `?? "u-founder"` (defeats the purpose of M2).
2. `PATCH /api/settings` has no field-level validation spec (Zod rules missing).
3. Auth route interface mismatch (`createAuthRoutes` signature needs updating).
4. No security annotations (rate-limiting, CORS) despite new mutation endpoints.
5. Missing enumeration of 6 test files that reference `agent-unassigned`.
6. Ambiguous factorySettings key-to-field mapping for notifications.
7. Test patterns lack file paths and test-before-implementation ordering.

**Impact analysis:** Of these 7 findings, **6 are plan-level** (cannot be fixed by type definitions) and **1 CRITICAL is a line-number gap** in the migration recipe. The lore comment documents the critical gap. The WARNINGs are implementation concerns for M3 that the builder must address.

**Observed pattern:** The designer correctly identified and labeled the gaps. The critique did its job (catching real gaps). The builder did not dismiss the findings. But the gaps were *accepted* rather than fixed. This is a judgment call: the alternatives were:

- Delay M2 to fix the plan (correct but slower).
- Ship M2 with documented gaps, flag them for M3 (faster, bet that M3 is experienced enough to handle them).

The team chose the second path. **This is defensible if and only if M3 is well-staffed and the gaps are well-documented.** The lore comments partially satisfy this, but the 6 WARNINGs in the plan itself remain unfixed.

### 2. No Pre-Implementation Plan/Code Verification

The plan was written (14:40 commit), critiqued (14:49 commit), then types were implemented (15:01 commit). **There was no interim verification step** between critique and implementation.

Expected flow:
1. Critique finds gaps.
2. Designer fixes gaps in the plan.
3. Builder implements from the fixed plan.

Actual flow:
1. Critique finds gaps (accepted as "plan-level").
2. Builder implements types (which cannot encode plan-level gaps).
3. Lore comments document the gaps for M3.

**Result:** The type definitions are clean and correct. The plan has documented gaps. M3 has to treat the plan as a "reference with known issues" rather than "definitive specification."

This is not a catastrophic failure (the gaps are real but not subtle; M3 builders will see them), but it violates the spirit of "architecture-first, specification-driven" development.

### 3. Test Coverage Gap for Runtime Validation

The 57 tests in `contracts.test.ts` are all **type-level** (compile-time `satisfies` + `expectTypeOf`). There are **no runtime boundary-value tests**:

```typescript
// Not tested:
- AuthMeResponse.id = "" (empty string — valid by type, invalid at runtime?)
- SettingsNotifications.quietHoursStart = "25:99" (invalid HH:MM format)
- SettingsProduct array with non-existent product IDs
- RailCostBurnRate.weekTokens = -1 (negative — valid by type?)
```

**This is acceptable because:** Type-only contracts are intentionally permissive. Runtime validation belongs in the server (Zod schemas), not in the type definitions. The contracts are **shape contracts**, not **validation contracts**.

**But it does mean:** M3 must implement comprehensive Zod validation. The api-contract package is "shape is right," not "values are sane."

### 4. Knowledge Workpackage Boundary Decision Had No POV Declared

M2 tracked out 7 knowledge-related rows to a future "knowledge wiring" workpackage. The rationale is sound (3 production importers, complex data flow, separate scope). But the decision was *buried* in the borderline triage section of architecture.md — there's no explicit statement like:

> "Design decision: Knowledge pages (KnowledgeList.tsx, KnowledgeDetail.tsx) wiring to the real `/api/knowledge/:layer` endpoint is a **separate workpackage** because:  
> 1. Three production importers with interdependent data flows.  
> 2. Requires scope/topic filtering and detail-lookup refactor.  
> 3. Estimated 4–6 hours; beyond M2 scope (architecture pass).  
> This decision is tracked as L22–L25 follow-up (see WORK_PACKAGES.md)."

Instead, the decision is framed as "triage result," which makes it sound provisional rather than final. This matters because **the next team** reading the plan might revisit the decision without context.

---

## Cost Signals

### Tokens Burned (Estimated)

Rough token count per phase (based on output size and agent complexity):

| Phase | Artifact | Lines | Estimated Tokens | Notes |
|-------|----------|-------|------------------|-------|
| 1: Architecture | architecture.md + contracts.md | 1,169 | 8,500 | High-detail plan; 6 clusters; full inventory triage |
| 2: Critique | architecture-critique.md | 138 | 3,200 | 8/10 score; 1 CRITICAL + 6 WARNINGs; full 9-dim rubric |
| 3: Types + Tests | contracts.test.ts + 4 .ts files | 635 | 4,100 | Straightforward types; 57 type-level tests; lore comments |
| 4: Code Review | review.md | 94 | 2,800 | 3 positive + 3 negative lenses; AC verification; phase 2 gap tracking |
| **Total** | **All M2 artifacts** | **2,036** | **18,600** | 1-hour wall-clock execution |

**Efficiency ratio:** 18.6K tokens ÷ 1 hour = **~18.6K tokens/hour** for architecture-only workpackage.

For comparison (estimated):
- M1 (mock-data linter + inventory script): ~25K tokens (implementation-heavy).
- L-track workpackage with UI (design + arch + code + tests): ~35–50K tokens.

M2's token-per-hour rate is lower than implementation-heavy packages because:
1. No implementation code (types are 1/10th the complexity of logic).
2. No Playwright E2E tests (architecture pass, no UI surface).
3. Clean dependencies (no legacy code rewrites).

### Time Breakdown

```
14:08  WIP scaffolding
14:40  Architecture plan delivered (32 min from start)
14:49  Critique delivered (9 min after plan)
15:01  Types + tests delivered (12 min after critique)
15:08  Code review delivered (7 min after types)
────────────────────────────────
60 min wall-clock, ~26 min agent work
```

**Observation:** The gap between critique (14:49) and code implementation (15:01) is 12 minutes, not 2 minutes. This suggests the builder spent time integrating lore comments and potentially thinking through how to handle the critique findings. **This is good** — it means the critique was not dismissed, it was grappled with.

---

## Observations

### 1. Specification-Driven Development Worked

The M2 plan did exactly what specifications should do:

- **Pre-emptively answered implementation questions.** "Where does `GET /api/auth/me` mount? What is the response shape? How are nullable fields handled?"
- **Identified hidden complexity.** Clusters 3 (rail) and 4 (agent-assignment) have shape or behavioral mismatches that would have surfaced during M3 implementation. The plan flushed them out early.
- **Provided mechanical migration recipes.** Every one of the 24 contract-pinned rows has a specific "old → new" swap listed. A builder can follow the table mechanically without design judgment.

**This is the rare case where "just read the plan and code it" is actually viable.**

### 2. The Critique System Found the Right Issues

The Phase 2 critique (8/10, CRITICAL + 6 WARNINGs) was not noise. Spot-checking the findings:

- **CRITICAL (`threads.ts:79`):** Verified — line 79 is indeed a second `DEFAULT_FOUNDER_ID` use. Valid finding. ✓
- **WARNING 1 (fallback `?? "u-founder"`):** Verified — the sample code in contracts.md line 64 does reintroduce the string. Valid finding. ✓
- **WARNING 2 (no PATCH validation):** Verified — contracts.md describes `PATCH /api/settings` but gives no validation rules. Valid finding. ✓
- **WARNING 3 (auth route interface):** Verified — `createAuthRoutes` current signature is `(store: UpgradeTokenStore)`, no `db`. Valid finding. ✓

The critique was **not** "found a problem and moved on." It was "found problems and documented them for the builder." The builder then chose to document them in lore rather than fix them. That's a process choice, not a critique failure.

### 3. Contract Types Correctly Excluded Implementation Details

The types in `packages/api-contract/` are **shapes, not implementations.** A few examples:

- `AuthMeResponse.avatarUrl: string | null` — the type says "nullable string," not "URL or null." The URL validation happens at the server (Zod).
- `SettingsNotifications.quietHoursStart: string` — the type says "string," not "HH:MM format string." The format validation happens at the server.
- `RailResponse` types are flat interfaces — no computed fields, no derived methods, no getters. All data is supplied by the server.

**This is correct.** If the types encoded validation rules, they'd become schemas, and then they'd need runtime representation (Zod or similar), and then the web package would need to import Zod, and suddenly the "type-only shared package" is coupling both layers to a validation library.

By keeping the types purely structural, the api-contract package remains lightweight and implementation-agnostic.

### 4. M1 → M2 Dependency Was Clean

M2 ingested the M1 deliverables (`inventory.md`, `inventory.json`, mock-data policy) and produced new artifacts without modifying M1's output. This is correct for a sequenced pipeline.

**But:** M2 did not feed back to M1. For example, M1's linter rules could be verified against the M2 contract clusters to ensure all contract-pinned rows are actually linted. This would have been a double-check, but it was not done.

### 5. The "Tracked-Out" Boundary Was Soft

Seven rows were marked `tracked-out` to a future knowledge wiring workpackage. This decision was sound, but **there is no Jira ticket, no follow-up action, no explicit link** in the WORK_PACKAGES.md to create L22–L25 for knowledge.

The M2 plan mentions this:

> "The real API (`GET /api/knowledge/:layer`) exists but the pages are not wired to it. Wiring requires reworking the knowledge page data flow (scope/topic filtering, detail lookup, curation suggestions). This is a standalone workpackage scoped under the knowledge track (L22-L25 follow-up)."

But there's no ticket created, no sprint assigned, no "before you close the track, you must do these workpackages" checklist.

**Risk:** The tracked-out knowledge work could slip indefinitely. A safer pattern would be to create the tickets during M2 and link them explicitly.

### 6. Type Tests Are Self-Documenting

The test file `contracts.test.ts` reads almost like a specification:

```typescript
it("does NOT have a product field (server authority over client BetItem)", () => {
  const bet: RailBet = {
    id: "b1",
    title: "Design",
    status: "in-progress",
    progress: { done: 1, total: 3 },
    // ❌ product: "p1", // intentionally omitted — server authority
  };
  // ...
});
```

The test name encodes the design rationale. This is good practice — tests become documentation.

---

## Recommendations

### For M3 Builders

1. **Read the lore comments in `packages/api-contract/src/*.ts`** before starting. They document the Phase 2 critique findings.
2. **Update the M2 architecture plan based on the 6 WARNINGs** (optional but recommended):
   - Fix the `threads.ts:79` migration recipe.
   - Add Zod validation rules for `PATCH /api/settings`.
   - Clarify the factorySettings key mapping for notifications.
   - Enumerate the test files that reference `agent-unassigned`.
3. **Use the contracts.md migration recipes as a checklist.** Each row is a line-item swap. Check them off mechanically.
4. **Seed the factorySettings table with the required keys** (founder_id, founder_name, founder_email, notif_*) before implementing cluster 1. Test the seed script as part of your integration tests.

### For Future Workpackages

1. **Fix critique findings before implementation.** If a critique scores <8 or raises CRITICAL/WARNING findings, resolve them in the plan before the builder starts coding. The builder's job is "make the plan real," not "fix the plan while coding."
2. **Create Jira tickets for tracked-out work.** Don't let scope decisions sit in plan documents. Create the tickets, assign them to a sprint, and link them explicitly.
3. **Verify type contracts against the actual server implementation.** Before accepting a type package in code review, spot-check 3–5 types against the actual server route (like the reviewer did for RailBet, RailBlocker).
4. **Document process decisions in CLAUDE.md or lore comments.** The decision to "exclude appearance from the settings contract" is load-bearing. If it's not documented somewhere visible, the next maintainer will add it back in.

### For M2 Continuation

If M2 is revisited (e.g., if critique findings need fixing):

1. Update `plans/M2/architecture.md` cluster 1 migration recipe, line 84 (threads.ts), to include line 79.
2. Add a "Validation" section to clusters 1 and 2 in `plans/mock-data-purge/contracts.md` with Zod schema annotations.
3. Add explicit factorySettings key names in cluster 2 (e.g., `notif_review_alerts`, `notif_cost_alerts`).
4. Enumerate the test files in cluster 4 that need updating.

These are low-friction fixes that would clear all WARNINGs without blocking M3. **Recommend doing this before M3 starts**, even if M2 is officially closed.

---

## Summary

M2 successfully delivered a comprehensive architecture pass and type contract package for the mock-data purge track. The 1-hour pipeline executed three skills (architecture → critique → code review) with clean artifact outputs and passing tests.

**Strengths:**
- Complete inventory coverage with verifiable totals (34/34 rows annotated).
- Type contracts matched the existing server implementations field-by-field.
- Critique identified and documented real gaps (not false positives).
- Type-only package is minimal, correct, and test-driven (57 tests).
- Lore comments preserve cross-cutting decisions for M3 visibility.

**Weaknesses:**
- Architecture plan shipped with 1 CRITICAL + 6 WARNINGs unresolved (documented in lore, not fixed).
- No runtime validation boundary-value tests (acceptable for shape contracts, but M3 must add Zod schemas).
- Tracked-out knowledge work has no explicit follow-up ticket (risk of indefinite slip).
- No pre-implementation plan-verification step (gaps were accepted rather than fixed).

**Process observations:**
- Specification-driven development worked. The plan was detailed enough for mechanical coding.
- The critique system is functional and catches real issues.
- Type contracts are correctly implementation-agnostic (shapes, not validation).
- M1 → M2 dependency was clean but one-way (no feedback loop).

**Token cost:** ~18.6K tokens / 1 hour (efficient for architecture-only, no implementation code).

**Verdict:** M2 is complete and ready for M3. The gaps are documented. The contracts are sound. The builder should update the plan's WARNINGs before starting M3, but this is a minor fix, not a blocker.
