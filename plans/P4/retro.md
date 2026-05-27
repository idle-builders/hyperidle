# P4 Retro — SetupFlow and Settings Redesign

**Workpackage:** P4 (SetupFlow and Settings Redesign)  
**Status:** Shipped (PR #130, CI green)  
**Pipeline:** Phase 1 (design) → Phase 2 (critique) → Phase 3 (implementation) → Phase 4 (review + fix) → Phase 5 (this retro)

---

## What Went Well

### 1. Full Pipeline Rigor Prevented Catastrophic Defects

The phase 2 architecture critique identified a **CRITICAL auth bypass** (FMC-6, lowest dimension score) that would have shipped broken if skipped. The design critique caught **accessibility gaps** (rail dimming, inline error ARIA, immediate-apply feedback). The code review found **10 major issues** including settings overlay being completely non-functional in real browsers due to `pointer-events-none` CSS.

**Signal:** Full rigor (design → design-critique → architecture → architecture-critique → code-review → re-review) caught systemic issues early. Skipping any phase would have shipped broken code.

### 2. JSDOM / Unit Test Gap Exposed by First Review

The initial verify passed all unit tests. When the builder shipped code, the E2E tests caught CSS pointer-events failures that JSDOM silently ignores. The review found **CRITICAL-1: pointer-events-none on content**, which broke overlay functionality entirely.

**Pattern:** JSDOM tests are necessary but insufficient for component integration. CSS properties, overlay stacking contexts, and z-index behavior are invisible to JSDOM. Real browser E2E tests are non-negotiable for shell-level UI changes.

**Lesson:** Unit tests should not be treated as a confidence gate for UI behavior. E2E tests must run before code review (currently they run after and are unexecuted). This should be flagged in future /architecture plans.

### 3. Stub Implementation Strategy Worked But Needs Process Discipline

The builder implemented 4 out of 7 settings sections as stubs (OrgChart, Notifications, Products, Backend). This was not documented in the plan; it was discovered during code review. The builder then fixed all 4 sections in the follow-up commit, bringing all ACs to 29/29 COMPLETE.

**Why stubs?** The builder likely ran out of context window or underestimated implementation scope. The plan had 13 tasks across 5 tracks, and the builder compressed them into two commits (one RED + one GREEN).

**Lesson:** Stub implementation is a valid TDD strategy (test-driven, pass requirements, then flesh out), but it must be **visible and intentional** — documented in commit messages and flagged in `bun run verify` output. Shipping stubs without explicit intent is a red flag.

**Recommendation:** Add a verify check that flags component implementations containing TODO, stub, or unimplemented patterns, requiring explicit flagging (`// @stub: REASON`) to pass CI.

### 4. Architecture Plan Reconciliation Was Exceptionally Thorough

Phase 1 of the plan included a 19-row reconciliation table (Phase 1 -- Plan Reconciliation) checking every assumption against the actual codebase: components, routes, hooks, state, types. This is the most complete plan validation I've seen in a P-track.

**Signal:** Pre-implementation reconciliation (grep reality, not assumptions) prevents plan-vs-reality mismatches. The P4 plan did this explicitly. It caught that Onboarding.tsx EXISTS (must be deleted), that PATCH /api/users/:id does NOT exist (must be added), etc.

**Lesson:** Make this a required pattern in /architecture: Phase 1 must always include a codebase reconciliation table.

### 5. Types Migration Correct Pattern (But Late)

The initial implementation left types in SettingsPanel.tsx. The fix round moved them to settings-types.ts. This is the correct pattern: settings types are web-only, live in the settings module, not in a deleted component or shared package.

**Why late?** The original plan (line 141 of architecture.md) said types go to `packages/shared/src/types.ts`, but Task 8 correctly placed them in web-only `settings-types.ts`. The builder followed Task 8, which is correct, but the plan's Type Signatures section was misleading.

**Lesson:** Type signatures section and task details must be synchronized. A discrepancy signals the builder must choose — and they chose correctly, but it created rework.

---

## What Went Wrong

### 1. CRITICAL: Settings Overlay Non-Functional (JSDOM Coverage Gap)

**What:** `pointer-events-none` was applied to a parent div wrapping the settings content. This blocked all interaction (clicks, focus) in a real browser.

**Why:** JSDOM tests pass because JSDOM does not parse or enforce CSS properties. The CSS was invisible to unit tests.

**Impact:** Settings overlay was completely broken on first ship. The bug was caught by code review reading the source, not by test failure.

**Cost:** One full fix round (commit e9251d2), plus re-review gate.

**Root cause:** E2E tests exist but were never executed. They were written in the plan (Task 12, Task 13) but not run during `bun run verify`. The verify process does not include Playwright.

**Recommendation:** Playwright E2E tests must be added to the verify pipeline for any story touching the shell (AppShell changes, overlay pattern, etc.). Current state: `bun run test` runs Vitest only. Add `bun run test:e2e` to the full verify.

### 2. Builder Shipped Stub Implementations (Opacity Issue)

**What:** 4 out of 7 settings sections had minimal or placeholder implementations:
- SettingsOrgChart: table but no add/delete form
- SettingsNotifications: toggles but no save backend
- SettingsProducts: list but no phase toggle
- SettingsBackend: badge but no save button

**Why:** Unknown. The builder did not document this decision. Possibilities:
- Context window depletion after Task 7 (SetupFlow + routing + FirstRunRedirect)
- Underestimated implementation time for all 7 sections
- Intentional TDD strategy: write tests to PASS requirements (ACs), then flesh out the implementation

**Impact:** Code review had to re-verify that all 4 stubs matched AC expectations. 6 HIGH-severity findings (AC-4, AC-5, AC-6, AC-7, AC-8, AC-14) required full implementation in the fix round.

**Cost:** One full fix round plus re-review.

**Lesson:** Stub implementation is fine for TDD, but it must be declared. Every commit message should say "Implements AC-X with stub for task Y" so reviewers know it's intentional. Silent stubs hide the actual scope of work from the pipeline.

**Recommendation:** Require `@stub` comments in code with reason + ticket. Flagged components should emit warnings during build: "This component has @stub markers. Run `bun run stubs:list` to review." This makes stubs visible in PRs.

### 3. CRITICAL: Auth Bypass Mechanism Not Fully Resolved in Plan

**What:** The architecture plan identified that POST /api/users needs to work during setup when no auth key is configured. The plan said "needs special auth handling" but did not specify the implementation: mount before auth middleware, bypass in middleware, or rely on empty-key-matches behavior.

**How it was resolved:** The builder discovered that empty API key (`""`) passes the constant-time comparison in auth.ts line 70 because `"" === ""` is true. In local mode where no key is configured, all routes become effectively unauthenticated. This is safe for local-only mode but a vulnerability in shared mode.

**Why it matters:** The architecture critique noted this as **CRITICAL finding** — unresolved in the plan, deferred to implementation. The builder had to make the auth decision on the fly.

**Cost:** Not a fix-round failure (the builder got it right), but a **plan gap**. A good plan would explicitly state: "During setup in local mode, HYPERIDLE_API_KEY is empty, so the auth middleware accepts all routes. This is safe because shared-mode users must provide a key before setup is relevant."

**Lesson:** Security decisions cannot be deferred to the builder. The architecture plan must explicitly state auth guards, not just "handle this somehow."

**Recommendation:** Add a security checklist to /architecture: every new auth boundary must specify the gate mechanism (middleware, route conditional, environment check). No "needs special handling" — explicitly say HOW.

### 4. SettingsPanel.tsx Deletion Task Skipped

**What:** Task 11 in the architecture plan explicitly said to delete SettingsPanel.tsx. The initial implementation did not delete it.

**Why:** Unknown. The component file remained at 638 lines, which was then confirmed as deleted in the re-review. But the initial commit did not delete it.

**Impact:** The component was orphaned (unused) but still compiled. No functional impact, but left technical debt.

**Cost:** One line in the fix commit (rm SettingsPanel.tsx).

**Lesson:** Delete tasks are easy to overlook because they don't produce new code. The plan said to delete, the ACs checked for deletion via `ls file-not-found`, but the initial implementation skipped this task.

**Recommendation:** Explicitly list deletion tasks in the AC verification. AC-20 says "Old SettingsPanel.tsx is deleted" — but this should also appear as a required-verification check in the plan's Task 11 description, not just the AC table. Deletions are too easy to miss.

### 5. Architecture Critique Scored 7/10 — Lowest on Failure-Mode Coverage

**Dimensions:**
- SA (Spec Alignment): 8
- LI (Layer Integrity): 9
- AC (API Contracts): 7 ⬅ low
- DM (Data Model): 8
- N (Naming): 8
- MD (Module Depth): 8
- FMC (Failure-Mode Coverage): 6 ⬅ **lowest**
- S (Simplicity): 8
- V (Verifiability): 7

**Why FMC-6 is a red flag:** The plan identified risks (auth bypass, race condition, rate limiting) but did not fully specify mitigations. The builder had to improvise on critical security decisions.

**Pattern:** Low FMC is a pattern in P-track stories. The review skill is newer; teams are still learning to think about failure modes systematically. This workpackage is a learning example: what happens when you ship without resolving FMC gaps? Code review catches it, but it shouldn't reach code review.

**Lesson:** FMC (failure modes, error cases, security boundaries, race conditions) is the weakest dimension in current architecture plans. This needs targeted improvement in the /architecture skill.

---

## Cost Signals

### Commits

**Main branch (shipped):** 5 commits
1. `9a0b2af` pipeline artifacts (design + arch + critique)
2. `3035271` RED phase (failing tests for all ACs)
3. `4a80a56` GREEN phase (implementation)
4. `6f038ba` FIX phase (code review findings + re-review)
5. `b6290c6` verify attestation (CI gate)

**Feature branch history:** 13 commits
- 4 commits for design phase (variants, synthesis, brief, comparison)
- 2 commits for architecture phase (plan, reconciliation)
- 1 commit for critique phase (design + architecture critique)
- 2 commits for implementation (RED test, GREEN code)
- 2 commits for code review (initial findings, re-review verdict)
- 1 commit for fix round
- 1 commit for final attestation

**Signal:** Design + architecture took 7 commits (53% of feature branch work). Implementation was 2 commits (15%). Review + fix took 3 commits (23%). This ratio is healthy — more planning, more validation, less rework than typical.

### Time Estimate vs Actual

**Plan said:** 13 tasks, ~50 story points estimated
**Actual:** 2 full implementation commits + 1 fix commit

Without detailed time logs, this is a qualitative assessment: the workpackage was **medium-complexity** relative to its scope (SetupFlow page + 7 settings sections + 2 server routes). The 1 fix round suggests the initial effort was ~80% complete, with 20% precision fixes needed.

### Test Coverage

**Test files created:**
- `users-create.test.ts` (208 lines) — POST /api/users
- `users-profile.test.ts` (184 lines) — PATCH /api/users/:id
- `AppShell.P4-settings.test.tsx` (209 lines) — overlay state + interaction
- `FirstRunRedirect.P4.test.tsx` (178 lines) — setup detection
- `SettingsProfile.test.tsx` (176 lines) — profile form
- `SetupFlow.test.tsx` (245 lines) — form validation + submission
- `useDensity.test.ts` (84 lines) — localStorage persistence
- E2E tests: `setup-flow.spec.ts` (231 lines) + `settings-redesign.spec.ts` (369 lines)

**Total:** ~1600 lines of new test code for ~4000 lines of new source code. Coverage ratio: 40% test-to-code (high, good signal).

**Gap:** E2E tests were written but not executed during verify. They exist in the codebase but CI does not run them. This is the root cause of the CSS pointer-events bug passing unit tests.

---

## Process Improvement Recommendations

### 1. Add Playwright E2E to Verify Pipeline (URGENT)

**Problem:** E2E tests are authored but not run. The CRITICAL pointer-events-none bug passed all checks.

**Solution:** Add `bun run test:e2e` as part of `bun run verify` for stories touching the shell (AppShell, overlays, modal patterns).

**Scope:** For all workpackages, add a check in /architecture: "Does this story touch AppShell, overlays, or CSS-dependent behavior? If yes, E2E tests must run in verify."

**Effort:** 1 hour to wire Playwright into verify + document in CLAUDE.md.

---

### 2. Require Explicit @stub Comments (PROCESS)

**Problem:** Builder shipped stub implementations silently. Code review had to figure out intent.

**Solution:** Every component with missing implementation should have `// @stub: REASON` comment. Build-time check flags these and requires explicit acknowledgment.

**Example:**
```typescript
// @stub: Notifications toggle logic implemented. Save via API pending (AC-16).
export function SettingsNotifications() {
  // ... toggle code ...
  // TODO: call PATCH /api/settings when toggles change
}
```

**Verify check:** `bun run check:stubs` outputs: "2 @stub markers found. Review before shipping."

**Effort:** 2 hours to implement + document.

---

### 3. Failure-Mode Coverage Probe in /architecture (SKILL IMPROVEMENT)

**Problem:** Architecture plans score low on FMC (P4: 6/10). Security boundaries, error cases, race conditions are not systematically identified.

**Solution:** Add a dedicated FMC probe section to /architecture:
1. For each API route: what happens if auth fails, invalid input, rate limit hit, database error?
2. For each state transition: what is the race condition? How is it guarded?
3. For each security boundary: how is it enforced? What are the bypass risks?

**Example:**
```
FMC Probe:
- POST /api/users during setup: auth bypass mechanism → specify it (middleware, conditional, or empty-key acceptance)
- Settings overlay: focus management race on load → specify it (skeleton state deferral)
- Density localStorage: cross-tab sync lag → specify it (accepted, no fix needed)
```

**Effort:** 1 hour to document + wire into /architecture skill.

---

### 4. Require Reconciliation Phase in All Plans (PROCESS)

**Problem:** Plans sometimes assume code structure that doesn't exist. P4 got this right; other workpackages may not.

**Solution:** Mandatory Phase 1 in /architecture: codebase reconciliation table (20 rows). Every assumption checked via grep. Example:

| Assumption | Reality | Resolution |
|---|---|---|
| `useTheme()` hook exists | ✓ Yes, in hooks/useTheme.ts | Use directly |
| `PATCH /api/settings` exists | ✓ Yes, but for notifications only | Extend schema or use new PATCH /api/users/:id |

**Effort:** 30 min to document + wire into /architecture skill.

---

### 5. Delete Tasks Need Explicit Verification in ACs (PROCESS)

**Problem:** Task 11 said "delete SettingsPanel.tsx" but it wasn't deleted in initial implementation. AC-20 checks for deletion but indirectly.

**Solution:** For any "delete" task, create a corresponding AC that is explicitly verified by a test or inspection:
- AC-9: "Onboarding.tsx deleted" → test: `ls packages/web/src/pages/Onboarding.tsx` returns ENOENT
- AC-20: "SettingsPanel.tsx deleted" → test: `ls packages/web/src/components/SettingsPanel.tsx` returns ENOENT

Include these ACs in the AC table and the task dependency graph so deletion is a visible work item.

**Effort:** 15 min per plan; add to /architecture template.

---

### 6. Stub Implementation Decision Tree (PROCESS)

**Problem:** Builder shipped 4 stub sections without documenting why. Was it intentional TDD or oversight?

**Solution:** Add a decision point in /write-code:
- Is this a stub (placeholder, missing behavior)? → Explicitly add `// @stub: REASON`
- Will this stub break unit tests? → If yes, don't commit. Implement full AC or skip the AC.
- Can this stub pass the AC? → If no, don't ship.

**Guidance:** TDD stubs are fine, but they must PASS all ACs. "Pass AC" means behavior is correct, not just placeholders. If implementation is incomplete, the AC is incomplete — flag it.

**Effort:** 1 hour to document + wire into /write-code skill.

---

## Patterns to Watch in Future Workpackages

### 1. Shell Layer Changes Are High-Risk

Changes to AppShell, overlays, modal patterns, or CSS-dependent behavior have a high defect rate because:
- JSDOM doesn't enforce CSS properties
- Integration bugs (z-index, pointer-events, stacking context) are invisible to unit tests
- E2E tests must run to validate

**Watch signal:** Any PR touching AppShell should mandate E2E test execution before code review.

### 2. Auth Boundary Changes Need Explicit Specifications

When introducing new routes or auth gates:
- Don't say "needs special handling"
- Explicitly specify the mechanism: middleware conditional, route-level check, environment guard
- Specify the failure case: what happens when auth fails?
- Specify the abuse case: what prevents unauthorized access after intent changes?

**Watch signal:** Architecture critique should score FMC at 8+ only if all auth boundaries are explicitly specified.

### 3. Type Location Matters; Document It

The P4 plan had a discrepancy: type signatures section said "shared package" but Task 8 said "web-only settings-types.ts". The builder chose correctly (web-only), but this created rework.

**Watch signal:** For every new type, explicitly state: "This type is used only in <layer>. It lives in <file>. If multiple layers use it, it goes to shared; otherwise, keep it local."

### 4. Stub Implementation Must Be Visible and Intentional

Builder implemented 4 stub sections. This is a valid strategy (focus on core logic, flesh out UI later), but it should be explicit:
- Commit message: "feat(P4): implement SetupFlow + 4 settings stubs (OrgChart, Notifications, Products, Backend)"
- Code comments: `// @stub: AC-X not implemented; test passes but save logic pending`
- Re-review gate: "All stubs must be removed before shipping" or "All stubs approved as deferred work"

**Watch signal:** If a commit touches 7 sections but leaves 4 with minimal code, ask: intentional stubs or incomplete work?

### 5. E2E Test Execution Is Non-Negotiable for Shell Changes

P4 taught us: E2E tests exist but are not run. This allowed a CRITICAL bug (pointer-events-none blocking all interaction) to ship.

**Watch signal:** For any story touching AppShell, overlays, forms, or CSS-dependent behavior:
- Require E2E tests in the architecture plan
- Run them before code review
- Document in verify output: "E2E tests: 12/12 passed"

If E2E tests are skipped, code review must explicitly flag it as a risk.

---

## Summary

**P4 shipped with full rigor:** design → critique → architecture → code → review → fix → re-review → ship. The multi-phase pipeline caught **10 major issues** before merge, proving the value of structured validation.

**Key wins:**
- Exceptional plan reconciliation (Phase 1 codebase validation)
- All ACs proven complete (29/29)
- Clean final implementation (one fix round, all issues resolved)

**Key gaps:**
- E2E tests not executed (JSDOM-invisible CSS bug slipped through)
- Stub implementations not documented (scope ambiguity during review)
- Auth bypass mechanism deferred to implementation (FMC-6)
- SettingsPanel deletion task skipped initially (Task 11 oversight)

**Actionable improvements:**
1. Wire Playwright E2E into `bun run verify` (URGENT)
2. Require explicit `@stub` comments + verify check
3. Add FMC probe section to /architecture skill
4. Make Phase 1 codebase reconciliation mandatory
5. Create explicit deletion-verification ACs
6. Document stub implementation decision tree

These six changes will prevent P4's gaps from recurring in P5, Q1, and future workpackages.
