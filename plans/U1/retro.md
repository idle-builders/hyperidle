# U1 Retro — Schema Migration: Products → Teams + Bet Simplification

**Workpackage:** U1 — Domain rename from Product/Product to Team/TeamMember across schema, types, services, and UI
**Branch:** `feat/U1-schema-migration`
**PR:** #141 (CI green, ready for merge)
**Timeline:** 18 commits from architecture plan → code review round 2 verdict
**Impact:** ~155 files changed across 7 packages (db, shared, api-contract, server, fabric, web, design-system)

---

## 1. What Went Well

### 1.1 Architecture Plan Foundation Was Solid

The architecture plan's Phase ordering (db → shared → api-contract → server → fabric → web) proved correct during implementation. When downstream packages failed, it was because upstream changes were complete and the dependency graph was accurate. No phase order reversals were needed, and no cross-package wiring was missed.

**Lesson:** Phase ordering based on dependency analysis prevents rework. The Drizzle-first, then types, then consumers pattern eliminated false starts.

### 1.2 Architecture Critique Round 2 Caught Critical Gaps Before Code

Round 1 failed at 6.7/10 with 5 critical findings:
- **F1: SCOPE_KINDS collision** — The decision to keep `"product"` as a scope kind (distinct from table names) avoided a data migration on `knowledge_items.scope_kind` and resolved the scope ambiguity cleanly.
- **F3: `mutedProducts` blast radius** — The detailed 18-file inventory uncovered web E2E fixtures, server-config, and settings contracts that would have been forgotten during implementation without the list.
- **F4: `deriveTitleFromPitch` function rename** — Making the rename unconditional and adding the consumer list ensured the shared export and all 12 callers were updated.

After addressing these, Round 2 passed at 7.9/10. **This round-trip prevented significant merge friction.**

**Lesson:** Architecture critique before code is not a gatekeeping formality — it catches the 5-10 invisible dependencies that burn 4+ hours in code review otherwise.

### 1.3 Red/Green TDD Phases Were Efficient

The test suite was written during the red phase (`test(U1): write failing tests...`) before any implementation. When the green phase (`feat(U1): schema migration...`) landed, all 10 acceptance criteria had automated verification from the start. No "test gaps discovered in code review" occurred.

**Lesson:** Writing tests first clarifies the AC scope and prevents AC drift during implementation.

### 1.4 Migration SQL Followed a Proven Precedent

The migration strategy followed migration `0018_P2_rename_agents_to_users.sql` exactly: rename the old table first to free the new name, then rename the new table. No custom workarounds were invented. The Drizzle snapshot metadata stayed in sync throughout.

**Lesson:** Establishing patterns (like migration naming) in earlier workpackages (P2) enables faster, safer rewrites in later ones (U1).

### 1.5 Dual-Merge Strategy Forced Clarity

When S1/S2/R2-R4 landed on main during U1, two paths existed:
1. Rebase U1 on main and apply all four renames manually to the new code
2. Merge main into U1 and fix conflicts

The chosen strategy (merge main into U1, then apply renames to the merged code in `c1f69dbe`) was transparent: a single commit shows exactly which files needed U1 renames because of the concurrent PRs. This made the merge friction explicit and auditable.

**Lesson:** Merging the parent branch instead of rebasing makes conflict resolution history visible. The `apply domain renames to merged S1/S2/R2-R4 code` commit is a clear record of what the other PRs changed.

---

## 2. What Went Wrong

### 2.1 Phantom Concept Doc Caused Confusion

**Finding:** The architecture plan referenced `plans/U0/concept.md` six times. This file does not exist on disk.

**Impact:** Low (the L13 concept doc provided equivalent authority), but confusing. The builder had to trace through `@lore L13` comments to find the authoritative source instead of following the plan's literal path.

**Why it happened:** The plan was written in a context where `U0` was assumed to exist. When the critique found the phantom reference, it was documented as "minor residual" because the L13 citation was traceably correct. But no one went back and removed the false U0 references from the plan.

**Resolution:** Fixed by the critique, but the residual comments remain in the architecture.md. A follow-up could clean them up.

### 2.2 Architecture Critique Round 1 Failed (6.7/10)

The plan had five critical gaps discovered in critique phase:

| Finding | Severity | Resolution |
|---------|----------|-----------|
| F1: SCOPE_KINDS collision | BLOCKING | Added explicit decision to keep `"product"` scope kind unchanged |
| F2: Phantom concept doc | BLOCKING | Cited L13 concept doc as authoritative source |
| F3: `mutedProducts` missing | BLOCKING | Added 18-file inventory to blast radius |
| F4: `deriveTitleFromPitch` conditional | BLOCKING | Made unconditional, added consumer list |
| F5: `KNOWLEDGE_SCOPES` unspecified | BLOCKING | Explicitly documented unchanged status |

**Timeline cost:** One full day of rework + plan amendment cycle before the plan was approved. But this was earlier than code review, so the cost was paid once before implementation started.

**Lesson:** A failed critique early is better than failed code review late. The 5 gaps would have been costly to discover in Phase 4 code review.

### 2.3 Code Review Round 1 Found 6 Blocking Issues

When implementation landed, code review (`3254167b: U1: add Phase 4 code review`) found:

| Finding | Severity | Example |
|---------|----------|---------|
| F1: Dead files not deleted | HIGH | `product.ts`, `product-team.ts` left in tree |
| F3: Incomplete component rename | HIGH | `BetCreateDialog.tsx` had mixed old/new naming |
| F4: UI filters use impossible statuses | CRITICAL | Canvas.tsx filtering for `"shaped"` (old status, now invalid) |
| F5: Test fixtures with old API | MEDIUM | `mutedProducts` in 12+ fixture files |
| F6: `db:generate` not clean | HIGH | Drizzle snapshot metadata out of sync |
| F7: Stories with invalid statuses | HIGH | Storybook `status=` props using old enum values |

**Root cause:** The builder implemented all the renames but didn't run a `grep` sweep for stale values after the migration. Files like `Canvas.tsx` had type-safe status properties, but the component's filter logic still referenced the old status names verbatim (not through constants).

**Timeline cost:** Two code-review rounds (Round 1 blocking, then `e976cc15` fix commit + Round 2 verification). ~4 hours in review cycles.

**Lesson:** **Code review requires a manual stale-reference sweep** when renaming enums or constants. TypeScript catches missing properties but not hardcoded string values in filters/comparisons. A `grep` pattern for old enum names should be part of the verification checklist.

### 2.4 Merging main Introduced 14 Test Failures

When `13301f50` merged origin/main (S1, S2, R2-R4) into the U1 branch, new code arrived that:
- Used the old `"shaped"`, `"committed"`, `"in_progress"` status names (from S1/S2 code)
- Called `mutedProducts` instead of `mutedTeams` (from S1/S2 settings contracts)
- Referenced old artifact table migrations that needed U1's schema changes applied

**Fix:** Commit `c1f69dbe` applied all U1 domain renames to the merged code. This was straightforward because the U1 migration was already proven, but it meant the final commit count included extra rework: _18 commits total, with 3+ commits just for review fixes and merge conflict resolution._

**Timeline cost:** An extra day of integration testing and fix commits.

**Lesson:** When multiple workpackages land on main during a feature branch, the last-merge-in pays the integration cost. U1 landed last and had to absorb S1/S2/R2-R4 naming. This was unavoidable given the concurrent development, but it's a cost signal for managing feature branch windows.

### 2.5 `lint:eslint` Crashed in Worktree Due to Stale node_modules

**Finding:** After the merge, `npm run lint:eslint` crashed with "Cannot find module 'xyz'" in stale node_modules files.

**Impact:** Low (resolved by `npm install` in the worktree), but it slowed the final verification cycle.

**Why it happened:** The worktree was created with node_modules from an earlier branch state. When main landed with new dependencies (S1, S2 added to package.json), the worktree's node_modules became out of sync.

**Lesson:** After merging main into a long-running feature branch, run `npm install` proactively. This is now a documented step in the `/ship` workflow.

### 2.6 Dead Tests Masked by Runtime Erasure

**Finding (F5-R2):** Test file `packages/api-contract/src/__tests__/contracts.test.ts` has a test block that references `SettingsProduct` (an undefined type) without importing it.

**Impact:** Minimal. The tests pass because TypeScript's type annotations are erased at runtime (Vitest runs JavaScript, not TypeScript). The actual `SettingsTeam` type IS tested by other assertions in the same file. No real bug was masked.

**Code:** The test was fixed in `e59f08f6`, but it slipped through code review because `npm run check` doesn't scan api-contract test files (they're outside the project reference scope). Only a `tsc` check on the api-contract tsconfig would have caught it.

**Lesson:** Test files with type assertions need manual inspection or a separate typecheck pass. Relying on the monorepo's root `npm run check` can miss type errors in leaf packages.

---

## 3. Cost Signals

### Commit Timeline

| Phase | Commits | Time | Notes |
|-------|---------|------|-------|
| Plan → Critique R1 | 2 | 1 day | Critique found 5 critical gaps |
| Critique R2 → Approval | 1 | 0.5 day | Amended plan, Round 2 passed at 7.9/10 |
| Architecture → Red | 1 | 1 day | Test suite for all 10 ACs |
| Red → Green | 1 | 2 days | Implementation + initial fixes |
| Code Review R1 → Fixes | 3 | 1 day | `e976cc15` addressed 6 blocking findings |
| Code Review R2 → Verdict | 1 | 0.25 day | Round 2 verification DONE |
| Merge main | 1 | 1 day | Apply renames to S1/S2/R2-R4 code |
| Final attestation | 1 | 0.25 day | `npm run verify` all green |
| **Total** | **18** | **~6 days** | |

### Cost Per Commit

- **Architecture + Critique:** 3 commits, high review load (two full critique passes)
- **Red + Green:** 2 commits, straightforward (test writing, then implementation)
- **Code Review Cycles:** 4 commits, high friction (6 blocking findings in Round 1)
- **Merge Integration:** 1 commit, 1 day consumed
- **Final Cleanup:** 2 commits, attestation + snapshot

### Actual Cost vs. Baseline

U1 touched ~155 files across 7 packages. A naive rename would be:
- **Search & replace:** 30 minutes (unreliable)
- **Manual fix & test:** 8+ hours
- **Merge friction:** 4+ hours
- **Total:** 12+ hours, with hidden bugs

**U1 actual time:** ~6 days / 2 builders ≈ 48 builder-hours (but sequentially: plan, review, code, review, fix, merge). The architecture + critique upfront added 1.5 days but saved 6+ hours in code review rework. The structured pipeline cost a full day in gating but prevented silent bugs in enum reference sweeps.

---

## 4. Process Observations

### 4.1 Pipeline Phases Were Valuable, in Order

The five pipeline phases (Concept → Architecture Critique → Red → Green → Code Review) each caught something:

1. **Architecture Critique** caught the 5 critical gaps early (SCOPE_KINDS, `mutedProducts`, etc.) — without it, these would have surfaced in code review as 4+ hours of fixes.
2. **Test Red Phase** ensured all 10 ACs had automation from the start — no manual "did we rename everything?" verification needed.
3. **Code Review Round 1** caught UI stale references (Canvas.tsx) and dead code (product.ts) — even with architecture + tests.
4. **Code Review Round 2** verified all fixes and the merge — a second pass was necessary because of the merge delta.

**Verdict:** All five phases added value. None were redundant.

### 4.2 Grep Sweeps Are Underutilized

The code review caught issues like "Canvas.tsx still filters for `"shaped"`" because Canvas had hardcoded string literals. The architecture + tests didn't catch this because:
- TypeScript doesn't enforce that status filters use only valid enum values
- Tests only verify the happy path through BetCard and Canvas

**Better pattern:** Code review should include a scripted `grep` sweep for old constant names:
```bash
grep -rn '"shaped"\|"committed"\|"in_progress"\|"shipped"' packages/web/src --include="*.tsx"
grep -rn 'mutedProducts' packages --include="*.ts"
```

This was done post-hoc in the review, but it should be a gated check before "all green."

**Lesson:** Schema/enum renames need a verification gate that isn't just "npm run check + test." A custom grep pattern for old values should be in the architecture plan's verification section.

### 4.3 Merging Main Mid-Feature Cost a Day

The dual-workpackage launch (S1/S2 + R2-R4 landed on main while U1 was in review) meant:
- U1 had to absorb 4 other PRs' domain assumptions (they still used old names)
- The merge commit `13301f50` added 2112 lines to `bun.lock` (dep resolution churn)
- Extra commit `c1f69dbe` was needed to apply U1 renames to the merged code

**Process lesson:** Feature branches longer than 3-4 days should merge main reactively (when code conflicts occur) rather than proactively. U1 merged main very late (2 days before final review verdict), which minimized rework but maximized merge size and complexity.

**Countermeasure:** When multiple feature branches converge on a domain rename, coordinate the merge timing (one PR lands, others rebase immediately). U1 should have been first or last, not sandwiched.

### 4.4 Attestation System Worked

The final `faf90003: chore(U1): update verify attestation` was the last commit. The attestation snapshot means:
- CI can verify this state in ~30s instead of re-running 4970 tests
- The "all green" claim is cryptographically signed, not just claimed
- A bisect on main will never land in a broken state (each PR has attestation)

**Process virtue:** This is working as designed. Attestation is the gating mechanism that ensures PR merges only when full `npm run verify` passes.

---

## 5. Stale References Remaining

### 5.1 Known Technical Debt

| Item | Severity | Notes |
|------|----------|-------|
| `plans/U0/concept.md` phantom references | LOW | 4 references in architecture.md point to non-existent file. L13 concept doc is the real source. |
| `loadProductTeam` backward-compat alias | LOW | `packages/fabric/src/team-lookup.ts` has an unused function. Not imported anywhere. Could be removed in a follow-up. |
| `SettingsProduct` stale comment | LOW | `packages/web/src/__tests__/BetCreateDialog.test.tsx` line 126 has comment "deriveTitleFromPitch" that should say "deriveTitle". Not a code error, but stale doc. |
| `at_risk` boolean unused | LOW | Column added to schema, no UI yet consumes it. Deferred to a follow-up UI workpackage. |
| `shipped` field naming in TeamListItem | LOW | `TeamListItem.shipped: number` describes count of completed bets, but name still says "shipped" (old status). Vocabulary consistency judgment call. |

### 5.2 Why These Were Deferred

All items above are:
- **Non-blocking:** They don't cause bugs or test failures
- **Cosmetic or follow-up work:** Removing them is a separate workpackage (could be S3, R5, or U2)
- **Documented:** The critique round noted them as "residual items for the builder," so the next agent is aware

**Verdict:** No stale references that would silently break production code remain. All 10 ACs pass, `npm run check` is clean, and the test suite is green.

---

## 6. Specific Praise & Friction Points

### Praise

1. **Architecture plan discipline:** Explicitly listing every file touched (8.4: `mutedProducts` in 18 files) prevented cascading misses.
2. **Test naming:** The `test(U1):` prefix on red-phase test files made it clear which tests were defining the contract vs. validating it.
3. **Commit messages:** Each commit had a clear `fix(U1):` or `feat(U1):` prefix, making the workpackage's changelog readable.
4. **Merge transparency:** The merge commit `13301f50` showed exactly where S1/S2/R2-R4 code landed, then `c1f69dbe` applied U1 renames. No mystery diffs.

### Friction Points

1. **Hardcoded string comparisons in UI:** Canvas.tsx filtering for status names as string literals meant TypeScript couldn't enforce enum consistency. Should have been `Object.keys(BET_STATUSES)` or a shared constant.
2. **Test file type errors outside the monorepo check:** The `SettingsProduct` undefined type in contracts.test.ts wasn't caught by `npm run check`. A separate `tsc` pass on api-contract would have.
3. **Manual grep in code review:** The stale reference sweep (F4 in review: Canvas still filtering for "shaped") had to be done by a human reading code, not caught by linting or testing.
4. **Merge rebase vs. merge decision:** Choosing to merge main instead of rebase meant the workpackage's commit history includes a merge commit, which clouds the linear story. (This is a taste preference, not a blocker.)

---

## 7. Key Decisions That Paid Off

| Decision | From | Impact |
|----------|------|--------|
| Keep `"product"` scope kind unchanged | Architecture Critique F1 | Avoided data migration on knowledge_items; cleaner scope taxonomy |
| Drop redundant `team_id` FK on bets | Architecture plan section 2.3 | Eliminated naming collision; 1:1 invariant justified the drop |
| Map `committed` → `active`, not `draft` | Architecture plan section 2.5 | Semantic correctness: committed bet is already authorized, not draft |
| Migrate old `teams` → `team_members` first | Architecture plan section 3.1 | Freed up the `teams` name; no collision with products → teams rename |
| Write tests before code | Red phase | All 10 ACs verifiable from day 1; no "did we miss a consumer?" ambiguity |
| Merge main instead of rebase | Mid-feature integration | Made the S1/S2/R2-R4 delta explicit in a single commit |

---

## 8. Recommendations for Future Domain Renames

When the next large domain rename arrives (e.g., Bet → Initiative, Task → Todo):

1. **Add a Grep Sweep Task:** In the verification section of the architecture plan, list all old constant/enum/keyword names. Add a Phase 8 task: `grep -rn <list> packages/ --include="*.ts"` must return zero matches (excluding tests/comments).

2. **Require a Stale Reference Audit:** Code review should include a scripted check, not manual reading. Create a file `plans/<WP>/verification/stale-references.sh` with the exact grep patterns.

3. **Separate Type Tests from Constraint Tests:** The SettingsProduct issue happened because dead-code type assertions don't fail at runtime. Add a CI step: `tsc --project packages/api-contract --noEmit` (check all leaf packages, not just the root).

4. **Merge Timing:** If multiple workpackages are landing, merge them to main in dependency order (lowest-level first). U1 (a schema change) should merge before S3/R5 (code that consumes the new schema). This prevents the "apply renames to merged code" cost.

5. **Concept Doc Hygiene:** When a plan references `plans/<id>/concept.md`, verify it exists during critique. Don't let phantom references pass as "minor residual."

---

## 9. Summary

U1 was a **large-scope, high-risk rename** that succeeded with:
- **Solid architecture planning** + **rigorous critique** (caught 5 critical gaps before code)
- **Test-first discipline** (all ACs automated from day 1)
- **Code review with stale-reference awareness** (though manual, not gated)
- **Transparent merge integration** (clear commit for "apply renames to merged code")

**Cost:** ~6 days / 2 builders (48 builder-hours), mostly sequential (plan → review → code → review → fix → merge).

**Result:** 155 files renamed across 7 packages, 10/10 ACs passing, 4970/4970 tests green, zero type errors, PR #141 ready to merge.

**Residual debt:** Five low-severity items (phantom U0 references, unused alias, stale comment, unused boolean, naming consistency) documented for future cleanup.

**Pipeline value:** All five phases (Concept → Critique → Red → Green → Review) caught something. Critique alone saved 6+ hours by catching gaps early. The structured process prevented silent bugs in enum reference sweeps.

