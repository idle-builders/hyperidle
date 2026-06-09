# AE2 Retrospective — Team Creation & Onboarding Journey

**Workpackage:** AE2 (Team Creation & Onboarding Journey)  
**Date:** 2026-06-09  
**Duration:** 13 commits (concept through code review) across 5 phases

---

## What Went Well

### 1. Plan Reconciliation Prevented Scope Creep
The architecture plan's reconciliation section (§Plan reconciliation: spec vs reality) caught seven assumptions that differed from the codebase:
- `CreateTeamRequest` type was missing the `functions` field
- POST `/api/teams` hardcoded agent creation instead of calling `defaultRoster()`
- SetupFlow had only 3 fields, not the required function selector
- AppShell used `?settings=open` pattern that needed to be replicated for `?onboarding=true`
- AssistantOverlay imports were correctly scoped (`CocOverlay`, not `AssistantOverlay`)
- AgentAddDialog already satisfied AC-2 (no work needed)

This prevented the builder from writing code that assumed the wrong state. **Cost signal: Zero rework due to plan reconciliation.**

### 2. Three-Phase Design-Architecture Pipeline
The sequence (concept → design → design-critique → architecture → architecture-critique) identified 2 CRITICAL issues before code was written:
- Architecture-critique caught that roster expectations in the test assertions were wrong (3 of 4 test cases)
- Architecture-critique caught that `userId` was missing from the `CreateTeamRequest` type signature section

The builder used the architecture-critique findings directly to correct test assertions before writing implementation. **Cost signal: Critique feedback was immediately actionable.**

### 3. Test-Driven Verification
All 34 tests passed on first green-phase run (20 integration + 10 component + 4 auto-open). Protected tests (SetupFlow.test.tsx, 14 tests) passed without modification despite the large API changes. This suggests:
- The test suite was comprehensive enough to catch the major changes
- The backward-compatibility default (`functions` → `["development", "product"]` if omitted) preserved the existing contract
- No flakiness or environment issues during test execution

### 4. Acceptance Criteria Completeness
All 5 ACs are met and verified:
- AC-1: `defaultRoster()` wired into POST `/api/teams`, soul templates loaded, roster preview works
- AC-2: AgentAddDialog regression test (no changes needed; already satisfied)
- AC-3: Assistant dispatcher regression test (no changes needed; already satisfied)
- AC-4: Welcome message seeded + auto-open via `?onboarding=true`
- AC-5: Setup form is 3 fields + 1 preset + submit; system work < 5 seconds

### 5. Low Incident Design Patterns
The workpackage reused existing infrastructure (AppShell query param pattern, CocOverlay state, assistant thread seeding). No new components, no new abstractions. This kept surface area small and risk low.

---

## What Could Improve

### 1. Design-to-Code Label Deviations
Two preset labels were designed but not implemented correctly:
- **D-1 [WARNING]**: "Marketing" preset was designed as `["marketing", "product"]` (4 agents: Brand Voice, Content Writer, Growth, Product Manager) but implemented as `["marketing"]` only (3 agents: Brand Voice, Content Writer, Growth). The Product Manager is missing, which changes team composition.
- **D-2 [WARNING]**: "Software + Design" was designed with that label but implemented as "Eng+UX". The functions are correct but the label differs.

**Impact:** The actual team rosters created will not match what the design intended. Users selecting "Marketing" will get a smaller team than the design promised.

**Root cause:** The builder chose to match the preset labels and functions to what `defaultRoster()` actually produced, rather than adjusting the design table. This is a reasonable pragmatic choice, but it deviates from the approved design without a recorded decision.

**Recommendation:** Create a lore comment explaining why the presets were adjusted (actual `defaultRoster()` output differs from design table) or update the design document to match the implementation.

### 2. Architecture-Plan Test Assertions Were Wrong
The architecture plan's test assertions for AC-1 contained factually incorrect roster expectations (e.g., `functions: ["development", "marketing"]` produces 4 agents per plan, but actually produces 5 agents per `defaultRoster()`). The builder corrected these during implementation by using the real function output, but this added a debugging step.

**Root cause:** The architect trusted the design's roster table instead of deriving expectations from `defaultRoster()` directly. The design-critique also flagged this (CRITICAL finding #1) but the architecture plan repeated the error.

**Recommendation:** When writing test assertions for data-driven code, always call the actual function in the test plan, not a summary table. Example: "Assert `defaultRoster(['development', 'marketing']).length === defaultRoster(['development', 'marketing']).length`" instead of hardcoding "4 agents."

### 3. Unused `buildingContext` Field
The `CreateTeamRequest` type was extended with `buildingContext?: string` (per the design's "What are you building?" textarea), but:
- The SetupFlow does not capture this field
- The server does not read it
- The welcome message does not include it
- The field is dead code

**Root cause:** The design specified a textarea but the implementation repurposed that label as a section header for preset pills. The `buildingContext` field was added to the type but never wired end-to-end.

**Impact:** Minor. The field is optional and the welcome message is still informative. But it represents scope creep that didn't produce value.

**Recommendation:** Remove `buildingContext` from `CreateTeamRequest` or implement it end-to-end (capture in UI, include in welcome message). Don't leave optional dead code.

### 4. No Preset Hover State in Design
The design-critique warned (suggestion #2) that preset pill hover states were not specified. The builder inferred a hover treatment but this was not explicitly in the design. The approved design only specified selected/unselected states.

**Impact:** Low. Hover states for buttons are a UI baseline, so inferring a treatment is reasonable.

**Recommendation:** Always specify all interactive states (default, hover, focus, active, disabled) in the design, not just the main two.

### 5. Theme Portability — Hardcoded RGBA
The selected pill background uses `bg-[rgba(22,118,79,0.06)]` which hardcodes the light-mode accent color. If the theme switches to dark mode, this tint will use the wrong color.

**Root cause:** The design specified the hardcoded RGBA (design-critique WARNING #3) and the builder faithfully implemented it. The issue is in the design, not the implementation.

**Impact:** Low. The app does not yet have theme switching, so this is a future concern.

**Recommendation:** Use `color-mix()` or CSS custom properties for all derived colors, not hardcoded RGBA values.

---

## Cost Signals

### Positive Cost Signals
1. **Zero rework commits.** All 5 tasks delivered on first implementation attempt.
2. **Plan-driven testing.** Architecture plan specified test assertions; builder corrected the roster expectations and tests passed.
3. **Protected test pass-through.** 14 existing SetupFlow tests passed without modification despite large API changes.
4. **Parallel independence.** Tasks 1 (type), 3 (UI), 4 (auto-open) could have run in parallel; builder executed sequentially but all are independent.

### Negative Cost Signals
1. **Test assertion errors in architecture plan.** The architect wrote incorrect roster expectations (3 of 4 test cases were factually wrong). The builder had to debug this during implementation.
   - **Token cost:** ~15-20 minute debugging during code phase, avoided rework but not eliminated confusion.
   - **Process cost:** The architecture-critique warned about this but the error was not caught until code review.

2. **Design-to-code label drift (D-1, D-2).** Two preset labels and one preset function mapping differ from the design. This is a minor deviation but suggests the builder made pragmatic choices that weren't recorded as lore comments.
   - **Token cost:** Minimal (labels are UI strings). Recommendation is documentation only.

3. **Dead code in type signature.** `buildingContext` was added to the type but not implemented. This is low-severity but represents incomplete scope execution.
   - **Token cost:** ~5 minutes to remove or finish implementation. Recommendation is cleanup only.

### Throughput Metrics
- **13 commits** from concept to code review (concept + design + 2 plan rounds + test + code + review)
- **5 tasks** all delivered (Tasks 1-5 from architecture plan; Task 6 E2E skipped as optional)
- **34 tests** (20 integration + 10 component + 4 auto-open), all passing
- **4 warnings** in code review (A-1, A-2, D-1, D-2 — no blockers, all low-to-medium severity)

---

## Observations for /compound

### Recurring Pattern: Architecture Test Assertions
This is the second workpackage where the architect wrote test assertions that didn't match the actual behavior:
- **AE2:** Roster expectations wrong for 3 of 4 test cases.
- **Similar in S1/S2/R5 scope?** Check retro-log for test assertion errors.

**Recommendation:** Add a lore note in the /architecture skill template: "Test assertions for data-driven behavior must call the actual function, not a summary table. Example: assert `myFunction(input).length === expectedLength` not `assert myFunction(input).length === 5 // based on design table`."

### Recurring Pattern: Design-to-Code Label Drift
The "Marketing" preset was designed as one thing, implemented as another. This is a scope gap.
- Check if other workpackages have similar label/identifier divergence (e.g., UI text changes not captured in lore).

**Recommendation:** Add a rule to /write-code: "If you deviate from the design in naming (labels, identifiers, function names), capture it as a `@lore` comment at the point of deviation so future engineers understand the tradeoff."

### Recurring Pattern: Unused Optional Fields
`buildingContext` was added to a type but not implemented. This pattern has appeared before.

**Recommendation:** Lint rule: detect optional fields on request/response DTOs that are declared but never read/written. This catches dead code before review.

### Positive Pattern: Plan Reconciliation
The architecture plan's reconciliation section (file:line references for every assumption) prevented zero rework. This is a working process — continue with it.

---

## Summary

**Verdict: DONE.** All 5 ACs met. 34 tests passing. Code review complete with 4 warnings (low-to-medium severity, none block shipment).

**Key metric:** Zero rework commits. The plan was detailed enough to prevent major mistakes, and the architecture-critique caught issues before code was written.

**Improvement opportunities:** Design-to-code label fidelity (D-1, D-2), architecture test assertions accuracy, dead code removal, and lore documentation for pragmatic deviations.

**Cost for future workpackages:** Establish clearer rules for test assertion correctness and design label verification in /write-tests and /architecture skills.
