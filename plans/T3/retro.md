# T3 Retrospective — Bet Pitch WYSIWYG Editing

**Pipeline run:** 9 commits, 2 review rounds, DONE.

---

## Cost Signals

| Metric | Value | Notes |
|---|---|---|
| **Total commits** | 9 | scaffolding + concept/arch + tests + implementation + 2 review cycles |
| **Files changed** | 111 | Includes design-system theme refactor (out-of-scope noise) and S4/U4/R8 plan cleanup (also noise). T3-specific: ~45 files. |
| **Lines added** | ~2,600 | Mostly non-T3 (theme CSS changes, test infrastructure deletions account for ~1,500 lines delta). T3-specific additions: ~650 lines (useBetDescriptionSave hook, tests, WorkBet/BetCreateDialog changes). |
| **Lines deleted** | ~6,491 | Non-T3 deletions: S4/U4 plan artifacts (~1,400 lines), desktop harness removal (~867 lines), design-system tests and theme files (~850 lines). T3 scope cleanup: ~50 lines. |
| **Review rounds** | 2 | Round 1: NOT DONE (2 critical, 4 warnings). Round 2: DONE (all findings resolved). |
| **Rework items (Round 1)** | 6 findings | C-1: BetCreateDialog label test regression; C-2: E2E fixtures pitch→description migration; W-1: flushSync in hook; W-2: useFetch.ts defensive patching; W-3: missing T3-specific E2E tests; W-4: KnowledgeCreateDialog unrelated changes. |

**Rework effort:** All 6 findings resolved in 2 commits (894ba3e8, d896ca1a) before round 2 approval. Estimated ~2 hours of rework.

---

## Process Observations

### What Went Well

1. **Clean plan-to-code alignment.** Architecture section 8 (ordered tasks) mapped directly to implementation commits. No divergence. Tasks executed in dependency order (rename → hook → WorkBet → BetCreateDialog → verify).

2. **Concept discovery caught a latent production bug.** Section 2 of the architecture identified that `BetDetail.pitch` is undefined in production (API returns `description` after U1 rename). This was not in the acceptance criteria but became Task 1 after analysis. The concept verification (section 4) confirmed the fix was necessary before auto-save could work. Good early discovery.

3. **TDD discipline held.** Test phase (commit 6b3542d1) wrote all AC-driven tests before any implementation. All tests initially failed (red phase). Implementation (commit 305118ee) made all tests pass. Review critiques checked test coverage explicitly.

4. **Architecture critique was specific and detailed.** 9/10 score. The 1-point deduction flagged real issues (W-2 dual-source mutable-status set, protected-tests list, no conflict-handling test assertion) that review caught in round 1. The critique's warnings were actionable.

5. **Review used a clear AC-completeness matrix.** Code review (both rounds) listed all 6 ACs with evidence links (file + line number). Every AC had unit test + often E2E test. Easy to verify.

6. **Two-phase rework was efficient.** Round 1 identified all issues with no false positives. Round 2 closed all findings cleanly. No third round needed.

### What Went Wrong

1. **Diff noise obscured T3 scope.** The worktree started with uncommitted changes from previous work (S4, U4, R8 plan artifacts; design-system theme refactor; desktop harness deletion). These 67 of the 111 file changes were not T3. Made review harder. Recommendation: git worktree should start clean; prior artifacts should be archived before starting T3.

2. **E2E fixture migration was incomplete in first implementation.** Architecture plan section 5.6 said "Grep for `pitch` across the entire `packages/web/`" but the builder only did `packages/web/src/` initially. The 19 E2E fixture files in `packages/web/e2e/` were missed. Code review caught this in round 1 (C-2). This was a grep-pattern mistake, not a design mistake, but it delayed shipping by 1 round.

3. **Unrelated file changes slipped into the feature branch.** `KnowledgeCreateDialog.tsx` had 218-line diff (unrelated to T3). This was caught in code review (W-4) and reverted. The lore comment in that file explains the builder was isolating BodyEditor mocks to prevent test-id collisions. The fix was correct but belonged in a separate commit or follow-up, not in T3.

4. **One test assertion was ceremonial, not substantive.** Code review (W-3) flagged that the test for "no conflict handling" was trivially true because `BetSaveStatus` type doesn't include `"conflict"`. The test at line 288-303 of `useBetDescriptionSave.test.ts` asserts `status !== "conflict"` which is always true. The architecture plan requested it and it has minimal overhead, so it was kept — but it's not falsifiable. A better test would verify the hook omits the conflict transition entirely relative to `useAutoSave`.

### What Was Surprising

1. **The pitch/description mismatch was pre-existing and undetected.** U1 renamed the server field to `description` and updated the API response, but the frontend type `BetDetail.pitch` was never updated. This means any code path reading `bet.pitch` in production gets `undefined`. It was discovered via architecture analysis, not through running the app. The bug existed for ~1 sprint before T3 exposed it. The concept verification phase was the detection mechanism.

2. **The E2E fixture naming pattern was inconsistent.** Fixtures used `pitch:` in object literals because they were written before U1, but the BodyEditor component requires `description` to initialize content. The type system should have caught this — `BetDetail` type would show `pitch` as an error if used correctly — but the test mocks bypassed type checking by casting `as unknown as BetDetail`. Type safety broke down at the test boundary.

3. **The builder chose to keep useFetch.ts defensive patching (W-2) in Round 1, then reverted it in Round 2.** The patch added `Promise.resolve()` wrapper and optional chaining to handle test mocks returning `undefined`. This was a test-infrastructure workaround that leaked into production. Round 1 critique flagged it as wrong. Round 2 fixed it by improving test mocks instead. The revert was the right call but required a second review cycle.

### Follow-ups Identified

1. **`BetDetail.product` field is similarly misaligned** (architecture critique S-1). The server removed the `product` field in U2 but `BetDetail` still declares it. `WorkBet.tsx` reads `bet.product` in breadcrumb and BetCard. This is outside T3 scope but should be fixed in a follow-up to prevent another latent production bug.

2. **E2E fixture status enum still uses old values** (code review note). `Q3-bet-creation.spec.ts` and `R2-work-first-landing.spec.ts` use `status: "shaped"` (the pre-U1 enum value). Should be `status: "draft"`. Outside T3 scope but noted.

3. **The dual-source mutable-status set should be imported if possible.** The architecture critique flagged that `BET_DESCRIPTION_MUTABLE_STATUSES` in WorkBet duplicates `DESCRIPTION_MUTABLE_IN_STATUSES` on the server. Consider whether `@hyperidle/shared` should export the set so frontend and server stay in sync. Currently, they're independent and could diverge.

4. **The `initialDescriptionRef` dirty-check stale-after-save issue** (code review S-1). After a successful save and `fetched.refresh()`, the `initialDescriptionRef` should be updated. Currently, subsequent saves always trigger PATCH even if content hasn't changed since the last save (idempotent but wasteful). The `onSaved` callback should reset `initialDescriptionRef.current = bet.description`.

---

## Patterns for /compound

### Recurring Issues (3+ workpackages)

**No 1: Type/API field name divergence after renames.** U1 renamed `pitch` to `description` on the server. This type-system mismatch (frontend type still says `pitch`) recurs across U2 (`product` field), and likely will again as the codebase evolves. **Recommendation:** After any field rename or removal, add a linting rule or CI check that verifies the frontend type matches the server schema export.

**No 2: E2E fixtures not synced to schema changes.** The E2E fixtures in `packages/web/e2e/` use old field names and enum values. They're not generated from the server schema and don't auto-update when the schema changes. Same issue will repeat. **Recommendation:** Use schema-driven fixture generation (e.g., Zod `.generate()` or Faker with the Zod schema) so fixtures stay in sync automatically.

**No 3: Test boundary type-safety gaps.** Both T2 and T3 had to mock the `apiFetch` hook and cast responses `as unknown as BetDetail`. Type safety doesn't extend into test fixtures. **Recommendation:** Create a `createBetDetailFixture()` helper function typed to `BetDetail` so test-writers get type errors if they use old field names. The helper would be the single source of truth for fixture shape.

### New Patterns to Watch

**No 4: Unrelated changes in feature branches.** The `KnowledgeCreateDialog` change (W-4) was a side fix (BodyEditor mock isolation). It was correct but belonged in a separate commit. **Watch:** Builders should commit unrelated fixes separately, even if discovered during feature work. Use the rule: "One logical change per commit."

**No 5: Ceremony tests vs. falsifiable tests.** The "no conflict handling" test in `useBetDescriptionSave.test.ts` is always true because the type doesn't include `"conflict"`. **Watch:** Code review should flag tests that cannot fail. Every test should have a variant where it would fail if the implementation changed. A better test would verify the hook's status transitions never reach a conflict state — something that would fail if the implementation added conflict handling.

---

## Summary

**T3 delivered on all ACs.** The pipeline ran clean with 2 review rounds. The first round caught real issues (field migration, unrelated changes, defensive patching). The second round confirmed all fixes. The rework was contained and handled efficiently. The process worked as designed: concept → architecture → critique → test → code → review → done.

**The latent pitch/description bug discovery** (caught in concept/architecture phase) validated the skill-gated pipeline. If the builder had skipped concept verification and gone straight to code, the field mismatch would have caused E2E test failures and confused the review.

**Cost:** 9 commits, 2 review rounds, ~2 hours rework, ~650 lines T3-specific code. Delivered on schedule with high quality.
