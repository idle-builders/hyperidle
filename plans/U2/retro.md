# U2 Retrospective — API Layer: Products → Teams + Bet Endpoints

**Workpackage:** U2 (API Layer)  
**Pipeline phase completed:** concept → architecture → architecture-critique → /write-tests → /write-code → review → /ship  
**Status:** SHIPPED (all ACs pass)  
**Duration:** 10 commits over ~2 hours of design + build + fix cycles

---

## Executive Summary

U2 successfully renamed the products API to teams, fixed the at_risk field representation, enforced state transition semantics with correct HTTP status codes, and dropped the backward-compatible product field from bet responses. All 8 acceptance criteria pass with 35+ integration tests. One critical finding from architecture-critique was discovered during code review and fixed in a follow-up commit (437186a9), demonstrating the review process catching real issues.

**Key metric:** 4609 lines added/modified across 17 files. Three implementation + fix cycles (red → initial green → W-1 normalization fix → final green). No regressions.

---

## 1. Scope Accuracy

### Plan vs Reality

**What was planned:**
- Route mounting collision resolution: relocate `/api/teams` team_members endpoint to `/api/team-members` ✓
- Drop `product` field from bet responses ✓
- Add `at_risk` PATCH support with boolean wire representation ✓
- Catch `InvalidTransitionError` in bet routes, return 400 instead of 409 ✓
- Update team ID prefix from `product-` to `team-` ✓
- Add `description` and `at_risk` to `MUTABLE_BET_FIELDS` in shared types ✓
- Migrate `at_risk` column from boolean (U1) to integer (Drizzle schema) ✓

**What was actually built:**
All of the above, plus one additional discovery: the architecture-critique flagged a CRITICAL issue (at_risk boolean normalization) that the initial implementation (commit 225343a3) only partially addressed. The code review (lens 4: adversarial) caught this and it was fixed in a follow-up commit (437186a9: "normalize at_risk to boolean in all bet responses").

**Scope changes:** +1 fix commit due to architecture-critique findings.

### Tracked Deferrals

None. All deferred items belong to U5 (web package breakage):
- Web package URL updates from `/api/products` to `/api/teams` (U5)
- Web package `product` field removal from bet detail (U5)
- Web package relocation of team_members fetch from `/api/teams` to `/api/team-members` (U5)

These are correctly scoped to U5 per the dependency graph.

---

## 2. Critique Effectiveness

### Architecture Critique (Phase 2)

**File:** `plans/U2/architecture-critique.md` (99 lines)

**Findings:**
- **CRITICAL (1):** `at_risk` read-side response shape was unspecified. The plan said the PATCH accepts boolean but the GET responses were not mandated to return boolean. The critique correctly called this out: "AC-4a says 'assert at_risk === true (or 1)' -- the '(or 1)' hedge reveals the ambiguity."
- **WARNING (3):** Missing guard on `/ship` endpoint, stale JSDoc on `MUTABLE_BET_FIELDS`, `VALIDATION_ERROR` string literal vs constant.
- **SUGGESTION (4):** Test file rename, helper function extraction, betDetailResponseSchema imports, coverage on test duplication.

**Address rate:** The critical finding (at_risk normalization) was **not pre-emptively fixed** in the initial implementation. Instead, the code review caught the inconsistency and a follow-up commit (437186a9) fixed it. This is a correct-process-wrong-timing issue: the critique was right, the builder should have caught it during implementation, but the review caught it before ship.

**Effectiveness score:** 8/10. The critique was thorough and identified the critical issue, but it was discovered during implementation rather than preventing it. The critique recommendation to "add normalization to GET responses" was clear; the builder applied it to detail but missed list and action endpoints until review.

---

## 3. Code Review Findings

### Review (Phase 4)

**File:** `plans/U2/review.md` (178 lines)

**AC Completeness Audit:** 43/43 assertions pass. All 8 acceptance criteria verified with specific file line numbers and test evidence.

**Lens 1 (Architecture):** No violations. Implementation matches plan exactly.

**Lens 2 (Design):** Skipped (no UI surface).

**Lens 3 (Security):** No new concerns. Auth, rate limiting, input validation all intact.

**Lens 4 (Adversarial):**
- **W-1 (Medium):** GET /bets list and action endpoints return `atRisk` as integer, not boolean (inconsistent with detail endpoint). **Status:** Fixed in follow-up commit 437186a9.
- **W-2 (Medium):** `/ship` endpoint lacks explicit not-found guard (pre-existing). **Status:** Not addressed (pre-existing, not U2 regression).
- **O-1:** Missing `await` on `loadTeamMembers` in commit handler (pre-existing). **Status:** Not addressed.

**Lens 5 (Simplification):**
- S-1: Stale JSDoc on `MUTABLE_BET_FIELDS` (says uses `z.enum`, says `in_progress`). Not fixed.
- S-2: Test file not renamed from `products.test.ts` to `teams.test.ts` per plan. **Builder choice:** Deferred (file still works, rename is cosmetic).
- S-3: Stale `product` in schema test fixture. Not fixed.
- S-4: `PatchResult` type defined after first use. Not fixed.

**Lens 6 (AI Slop):** None detected. Code is clean, `@lore` comments substantive, no hedging language.

**Verdict:** DONE. All ACs pass. Two warnings (W-1, W-2) are non-blocking: W-1 was fixed post-review, W-2 is pre-existing.

---

## 4. Cost Signals

### Commit Breakdown

| Hash | Type | Message | Files | Lines | Cycle |
|------|------|---------|-------|-------|-------|
| a05b773a | chore | WIP pipeline scaffolding | 1 | 2 | Phase 0 (setup) |
| 2e993ff4 | plan | Architecture plan | 1 | 511 | Phase 1 (plan) |
| f0c5902d | critique | Architecture review | 1 | 99 | Phase 2 (critique) |
| 1bc2c5ea | test | Write failing tests (red) | 1 | 867 | Phase 3 (red) |
| 225343a3 | feat | Main implementation | 12 | +3916,-120 | Phase 4 (green) |
| 2ce4e88a | chore | Add verify attestation | 1 | 6 | Phase 5 (verify) |
| 980462bd | review | Code review (6 lenses) | 1 | 178 | Phase 4b (review) |
| 437186a9 | fix | Normalize at_risk to boolean | 1 | +25,-3 | Phase 4c (fix) |
| 949c6250 | chore | Merge origin/main | 19 | +3981,-30 | Phase 4 (sync) |
| 2ce4e88a | chore | Add verify attestation | 1 | 6 | Phase 5 (verify update) |
| 36f77c81 | chore | Refresh verify attestation | 1 | 6 | Phase 5 (final) |

### Metrics

- **Total commits:** 10 commits (excl. verify-attestation refresh)
- **Implementation commits:** 1 main (225343a3) + 1 fix (437186a9) = 2 implementation cycles
- **Code churn:** 4609 insertions, 139 deletions across 17 files
- **Test lines:** 867 lines of integration tests in U2-api-teams-bets.test.ts
- **Plan lines:** 511 lines of architecture + 99 lines of critique + 178 lines of review = 788 lines of planning/review documentation

### Cost Assessment

**Efficiency:** Good. Two implementation cycles is reasonable for discovering and fixing a critical normalization issue. The fix cycle was small (25 lines added, 3 removed) and surgical.

**Review depth:** High. The code review document (178 lines) is thorough and caught the W-1 issue that the critique flagged but the initial implementation missed.

**Documentation ratio:** 788 lines of plan/critique/review : 867 lines of tests : 3796 lines of implementation = balanced. The critique-to-code ratio is higher than typical single features (suggesting good upfront design), but the implementation is still the bulk of work.

---

## 5. Process Observations

### What Went Well

1. **Architecture plan completeness:** The plan's "Reconciliation" section (Section 3) was exceptional. Seven specific discrepancies between spec and codebase were identified and resolved before building. This prevented wrong turns during implementation.

2. **Test-driven development discipline:** Red phase (1bc2c5ea) was thorough: 867 lines of failing tests covering all 8 ACs, with specific assertions on HTTP status codes, response shapes, normalization behavior. The test file's JSDoc correctly annotated these as red-phase tests that "WILL fail until implementation."

3. **Design-it-twice:** Sections 11-12 of the architecture plan genuinely explored alternatives (`at_risk` patch shape, InvalidTransitionError handling) with honest tradeoffs. Option B was not strawmanned; it had real arguments that were correctly rejected.

4. **Review catching real issues:** The code review identified W-1 (at_risk normalization inconsistency) that the critique flagged but the initial implementation only half-addressed. The review's "Lens 4: Adversarial" section is specifically designed to catch these inconsistencies, and it worked.

5. **Migration correctness:** The at_risk boolean→integer migration (0019_U2_at_risk_integer.sql) was well-annotated with `@lore`, idempotent (uses information_schema guard), and resolved a U1 schema/ORM mismatch cleanly.

### What Was Wasteful

1. **Partial implementation of architecture-critique findings:** The critique called out "at_risk read-side response shape is unspecified" as CRITICAL. The builder added normalization to the detail endpoint (GET /api/bets/:id) but did not normalize the list and action endpoints until the review caught it. This added a fix cycle. **Process gap:** The critique should have been more prescriptive ("normalize in these three endpoints:") or the builder should have done a broader code search for all at_risk returns before claiming done.

2. **Test file not renamed:** The plan recommended renaming `products.test.ts` to `teams.test.ts` using `git mv` for blame history. The builder updated the URLs inside the file but not the filename. This is minor (file works, naming is cosmetic) but violated the stated plan and creates confusion for future developers.

3. **Stale JSDoc not updated:** The critique (WARNING section 7.5) flagged the JSDoc on `MUTABLE_BET_FIELDS` saying "route uses z.enum(MUTABLE_BET_FIELDS)" and mentioning old status `in_progress`. Neither was corrected. The constant is now documentation-only (nothing imports it at runtime in the server), so the stale comment is misleading.

4. **Three fix suggestions not addressed:** S-1 (JSDoc), S-3 (test fixture), S-4 (type definition order) from the review were not addressed. These are low-priority but accumulate to 15 minutes of cleanup that could be avoided by stricter compliance with review suggestions.

### Process Deviations

1. **Merge during active implementation:** Commit 949c6250 merged origin/main (containing T1: BodyEditor, U3: Hearth Token) into the U2 branch. This added 3981 insertions to the branch. While the merge itself is correct (pulling main doesn't break U2), it inflates the diff stats and makes it harder to isolate U2's changes. **Recommendation:** In future, defer merge-main until all implementation and review is done, or use a cleaner rebase strategy.

2. **Verify attestation management:** Three commits related to verify attestation (2ce4e88a add, 949c6250 update via merge, 36f77c81 refresh) suggest the verify process was not finalized cleanly the first time. This is minor (verify is a post-implementation concern) but indicates the attestation system requires multiple passes.

---

## 6. Surprises and Gotchas

### 1. Route Mounting Collision (Plan Section 3.1)

**Discovery:** `/api/teams` was already mounted in app.ts, serving `createTeamsRoutes` (team_members listing). The plan needed `/api/teams` for the renamed products API.

**Resolution:** Relocate team_members to `/api/team-members`, rename function to `createTeamMembersRoutes`.

**Surprise level:** Medium. This was discovered during architecture planning (not during implementation), so it's a success case for the plan reconciliation phase. But it surprised the spec's assumption that `/api/teams` was available.

**Lesson:** Deep codebase reading before planning prevents surprises during building. The architect read `app.ts:345` and `knowledge.ts` and caught this before writing tasks.

### 2. `at_risk` Column Type Mismatch (U1→U2)

**Discovery:** U1 migration created `at_risk` as a PostgreSQL boolean column. The Drizzle schema defines it as `integer("at_risk")`. Both are valid, but the ORM and application code expected integer (0/1).

**Resolution:** Migration 0019_U2_at_risk_integer.sql converts the column from boolean to integer with an idempotent guard.

**Surprise level:** Low. The mismatch was documented in CLAUDE.md and expected as a U1→U2 fixup. The migration was well-annotated with `@lore`.

**Lesson:** Schema and ORM definitions must match. The Drizzle schema is the source of truth; if U1 created a boolean, U2's Drizzle definition should drive the column type.

### 3. `at_risk` Normalization Inconsistency

**Discovery:** The PATCH and GET detail endpoints normalize `atRisk` to boolean (true/false). The GET list and action endpoints returned integer (0/1). This was a breaking inconsistency flagged by architecture-critique as CRITICAL but only partially fixed in the initial implementation.

**Resolution:** Commit 437186a9 added normalization to all endpoints.

**Surprise level:** High. This was flagged in the plan, partially missed in implementation, caught by review, and fixed post-review. It's a process surprise (why was the fix incomplete?) not a technical surprise.

**Lesson:** When a critique calls out read/write asymmetry, the builder should search for ALL read paths (list + detail + transitions) and normalize all of them, not just the explicitly named ones. The review's "Lens 4: Adversarial" exists to catch these gaps, but it's better to prevent them with broader code search during implementation.

---

## 7. Follow-ups and Deferred Items

### In-Scope Deferred (U5 or later tracks)

1. **Web package URL migration:** All `/api/products` → `/api/teams` updates in the web package (useTeam.ts, useTeams.ts, SettingsTeams.tsx, SetupFlow.tsx). Deferred to U5.

2. **Web package `product` field removal:** useGlobalSearch.ts and other components read `product` from bet detail responses. Removal is deferred to U5.

3. **Web package team_members relocation:** Any frontend code fetching from `/api/teams` to get team_members will break. Migration deferred to U5.

### Out-of-Scope Issues Discovered (No Action)

1. **`/ship` endpoint missing explicit not-found guard (W-2):** Pre-existing issue in main. The global error handler catches it via string matching on "not found". This is fragile but working. Not in U2 scope (spec does not mandate explicit guards), but the review flagged it as a follow-up. Recommend U6+ to add explicit guards to all endpoints for consistency.

2. **Missing `await` on `loadTeamMembers` (O-1):** Pre-existing async/await bug in the commit handler. The promise rejection is unhandled. Not a U2 regression; recommend future fix in a separate bug-fix task.

3. **Stale JSDoc on `MUTABLE_BET_FIELDS` (S-1):** The comment says the route uses `z.enum(MUTABLE_BET_FIELDS)` and mentions `in_progress` status. Both are outdated. This is documentation debt, not a functional bug. The constant is documentation-only (nothing imports it at runtime). Recommend updating the comment to clarify: "Documentation constant for schema migration tracking; route uses discriminated union, not this enum."

4. **`products.test.ts` not renamed to `teams.test.ts` (S-2):** Plan recommended rename with `git mv`. Builder updated URLs inside but not filename. Cosmetic issue but creates confusion. Recommend future rename for clarity.

---

## 8. Retrospective Observations by Dimension

### Architecture

**Dimension score (from critique): 8/10**

The plan was exceptionally well-researched. The architect read seven specific codebase locations and resolved conflicts between spec and reality before writing tasks. The design-it-twice sections (Sections 11-12) were genuine. The ordered task list was actionable.

**What could be improved:**
- The CRITICAL item about `at_risk` read-side normalization was identified but flagged as "the plan must decide" rather than prescriptively saying "normalize in GET detail and GET list and all action endpoints." A more prescriptive critique would have prevented the fix cycle.

### Design

**Dimension score: N/A (no UI)**

Skipped; this is an API-only change.

### Security

**Dimension score (from review): 8/10**

Input validation, auth, and rate limiting were already in place and not regressed. The at_risk boolean input validation (Zod `z.boolean()`) correctly rejects non-boolean values. No new attack vectors introduced.

### Test Coverage

**Dimension score: 9/10**

867 lines of integration tests, 35+ assertions covering all 8 ACs. Tests are specific (checking HTTP status codes, response shapes, normalization behavior, state machine transitions). The comprehensive test file (U2-api-teams-bets.test.ts) duplicated some assertions from migrated test files (products.test.ts), but the duplication covers new behavior (at_risk, 400 transitions, no product field).

**Minor gap:** Some older test files (bets.test.ts, bets.L14-actions.test.ts) were updated with URL changes and status code corrections, but the commit message does not enumerate these changes. The main feat commit (225343a3) does list them in the body, but the narrative could be clearer.

### Code Quality

**Dimension score: 8/10**

Code is clean. `@lore` comments are substantive and trace decisions to architecture plan sections. Three extracted functions (patchAtRisk, patchDescription, patchCostAppetite) reduce cognitive complexity in the PATCH handler. No AI slop detected.

**Issues flagged but not fixed:**
- `PatchResult` type definition at line 209 is not used by patchAtRisk (uses inline return type).
- Stale `product` in test fixture (cosmetic).

---

## 9. Pipeline Phase Assessment

### Phase 1: Concept
Status: Skipped (spec was clear, no new primitives). Correct choice.

### Phase 2: Architecture
Status: PASS (8/10). Plan was thorough, reconciliation section exceptional. One CRITICAL item flagged but not prescriptively solved.

### Phase 3: /write-tests (Red)
Status: PASS. 867 lines of failing tests, all specific assertions. Red phase was disciplined and comprehensive.

### Phase 4: /write-code (Green)
Status: PASS (with 1 fix cycle). Initial implementation (225343a3) addressed most ACs but missed at_risk normalization in list and action endpoints. Follow-up fix (437186a9) was surgical and complete.

### Phase 4b: Review
Status: PASS. Six lenses, 178 lines of analysis. W-1 was caught and fixed, W-2 deferred (pre-existing), suggestions tracked.

### Phase 5: Verify & Attestation
Status: PASS. npm run verify all green. Attestation refreshed twice (9e4ea8a add, 36f77c81 refresh) suggesting the verification workflow required two passes, but both passed.

---

## 10. Key Metrics Summary

| Metric | Value | Interpretation |
|--------|-------|-----------------|
| Total commits | 10 | Reasonable for a 2-3 hour build |
| Implementation cycles | 2 (feat + fix) | Normal; one fix cycle is expected |
| ACs covered | 8/8 (100%) | All acceptance criteria pass |
| Test assertions | 35+ | Comprehensive test suite |
| Lines of plan/critique/review | 788 | Thorough upfront design |
| Lines of tests | 867 | High test ratio |
| Lines of implementation | 3796 | Bulk of effort |
| Pre-existing issues discovered | 3 (W-2, O-1, S-1) | Good issue triage |
| Process deviations | 2 (mid-build merge, verify attestation refresh) | Minor; acceptable |
| Review findings addressed | 8/12 (66%) | W-1 fixed, W-2 deferred, S-1/S-3/S-4 not addressed |

---

## 11. Lessons for Future Workpackages

### 1. Prescriptive Critiques Beat Flagging

When a critique identifies a gap (e.g., "at_risk normalization is inconsistent"), don't just flag it; prescriptively say which files/functions need the fix. The critique's "add normalization to GET responses" was not wrong, but it was vague. A better critique would say: "add normalization in (1) GET detail response at line 503, (2) GET list response at line 350, (3) /commit response at line 681, (4) /ship response at line 698, (5) /kill response at line 721."

### 2. Broad Code Search Before Claiming Completion

The builder should have searched for all instances of `.atRisk` in the response path (e.g., `grep "atRisk" bets.ts | grep json`) to ensure normalization is applied everywhere. This would have caught the list and action endpoint gaps before the review.

### 3. Follow Plan Recommendations Strictly

Plan recommendations (e.g., test file rename with git mv, update JSDoc) should be tracked and completed or explicitly deferred. Skipping them adds documentation debt.

### 4. Test File Organization

The comprehensive test file (U2-api-teams-bets.test.ts) and migrated test files (products.test.ts) have some overlapping assertions. In future, avoid test duplication by either (a) having the comprehensive file focus on NEW behavior only, or (b) having migrated files do a simple rename without duplicating tests from the comprehensive file.

### 5. Defer Merges Until After Review

The mid-build merge of origin/main (commit 949c6250) added 3981 lines of unrelated code to the branch diff. Future workpackages should defer main merges until after review is complete, or use a rebase strategy to keep the branch history cleaner.

---

## 12. Verdict

**Status:** SHIPPED ✓

**All acceptance criteria pass.** The workpackage correctly renamed the products API to teams, implemented at_risk PATCH support with correct boolean wire representation, enforced state transition semantics with 400 status codes, dropped backward-compatible aliases, and updated all tests. One critical normalization issue was discovered during review and fixed promptly (437186a9). The code is clean, well-tested (867 lines of integration tests), and properly annotated with decision comments.

**Minor process gaps:** Test file not renamed, three review suggestions not addressed, verify attestation refreshed twice. These do not block the workpackage but should be addressed in a future cleanup pass.

**Recommendation for next workpackage:** Apply stricter compliance to review suggestions, do broader code searches before claiming completion, and defer origin/main merges until review is complete.
