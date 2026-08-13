# AU38 — Codex External Review

**Review type:** External, independent review  
**Date:** 2026-08-13  
**Reviewed tree:** `.worktrees/AU38`, branch `chore/AU38-test-self-isolation`, committed HEAD `0f7ebe6a7`, plus the existing dirty capstone probe  
**Pipeline verdict:** **NOT DONE**  
**Investment verdict:** **Kill AU38 as a delivery path. Keep the branch only as salvage material.**

## Decision

Do not merge this branch. Do not keep fixing its 376 failures in place.

The original problem is real: the service integration lane is too slow. AU38 chose a much larger solution than the measured performance problem requires. It also weakened existing tests, added a false-confidence lint gate, missed consumers of the shared fixture, and has not proven its intended runtime.

The economic recovery is a fresh work package and branch from current `origin/main`. Capture the `isolate: false` speedup while keeping per-test database cleanup. Test dirty-world query behavior separately with explicit foreign rows.

## Decisive evidence

- 86 branch commits.
- 263 changed files.
- 17,235 additions and 11,758 deletions.
- 234 integration-test files changed.
- The branch was 8 commits behind `origin/main` at review time and already showed merge conflicts.
- Committed HEAD still calls `truncateAllTables()` and still uses `isolate: true`.
- The dirty no-truncate proof recorded 2,865 tests: 2,485 passed, 376 failed, 4 pending, across 105 failing files.
- The current config still has `isolate: true`, so the harder cross-file shared-module and shared-database state has not been proven by that result.
- A fresh affected-unit run produced 6,191 passes and one duplicate-key failure in `AR4b-formation-seam.test.ts`. The shared fixture therefore affects files outside AU38's integration-only migration and lint scope.

This is not a nearly finished implementation. Its committed state has not delivered the outcome; its dirty next step is massively red before the final isolation change.

## Blocking findings

### B1 — The main speedup does not require the mass rewrite

The plan's own `isolate: false` experiment reduced setup CPU time from 2,831 seconds to 40.6 seconds and wall time from 1,170 seconds to 258 seconds while per-test truncation still existed.

With four workers, each worker can keep one PGlite instance and truncate before its sequential tests. The lane contains no `test.concurrent` or `it.concurrent` integration tests. Therefore:

- `isolate: false` captures the large per-file boot saving;
- keeping truncation preserves current database isolation;
- only module cache, mocks, timers, environment, singleton, and lifecycle leaks need fixing;
- removing truncation targets a separate, estimated roughly 110-second cost and a future cross-worker database design.

AU38 incorrectly treats database state and module-registry state as the same cause. They are not. The current architecture pays for a future shared dirty database that the plan itself calls out of scope.

**Impact:** Most of the 29,000-line churn is not required for the measured 4.5x wall-time prize.

### B2 — Runtime acceptance criteria are red

The latest dirty proof contains 376 failures in 105 files. Failure classes include duplicate keys, failed database writes, changed authorization results, leaked global rows, and assertions observing other tests' state.

Committed HEAD has not removed the wipe. The dirty state has not flipped the service project to `isolate: false`. No final end-to-end proof exists.

**Impact:** AC1 through AC5 are not delivered.

### B3 — The lint plugin cannot prove isolation

`no-literal-entity-ids` only inspects direct object and array literals passed to `.insert(...).values(...)`. It misses helpers, variables, spreads, repositories, API writes, raw SQL, updates, and other unique keys.

Concrete miss: `bet-state-machine.integration.test.ts` returns fixed IDs from helper functions and inserts those returned objects. The rule passes the file; the dirty no-wipe run reported 23 failures in it.

`no-unscoped-table-read` accepts any `.where(...)` call without checking whether the predicate uses test-owned data. It misses repository helpers, API responses, raw SQL, relational queries, and other read forms.

The plugin is 686 lines and already needs 11 R1 plus 6 R2 permanent file waivers.

**Impact:** AC6 is not enforced. Green lint creates confidence without semantic proof.

### B4 — Existing test behavior was weakened

The plan says assertions may be tightened or re-homed but never weakened. AU38 violates that constraint.

Examples:

- `products.integration.test.ts`: empty-table behavior became only an array-shape check.
- `conversations.integration.test.ts`: exact pagination total `5` became `>= 5`.
- `conversations.integration.test.ts`: an empty-list test now searches for one random ID that was never inserted and checks response types.
- `bets.integration.test.ts`: an empty global-list assertion filters the response to a unique test team inside the assertion, so unrelated or wrong global data cannot fail it.

These changes preserve test count while reducing what the tests can detect.

**Impact:** The migration damages the suite it is meant to improve and violates the approved plan.

### B5 — Requirements prescribe a harmful universal test world

"Every test runs against accumulated foreign data" is an implementation method, not the needed outcome. It conflicts with valid tests of:

- empty responses;
- exact pagination and global counts;
- first boot and defaults;
- fixed production singletons;
- queues, schedulers, and drains;
- bootstrap and idempotency.

Foreign data is valuable when testing a tenant, team, owner, or actor predicate. It should be arranged explicitly in those tests. Arbitrary residue is a weak, order-dependent oracle.

**Impact:** The requirement forces semantic rewrites and makes test order part of test meaning.

### B6 — Scope misses shared-fixture consumers

The plan excludes the unit lane, and the lint rules only apply to `*.integration.test.ts`. Removing truncation changes the shared `framework/db` fixture used by non-integration tests too.

The fresh affected-unit run failed the second test in `AR4b-formation-seam.test.ts` because the first test's fixed `users` row remained.

**Impact:** The planned file census and proof boundary are incomplete.

## Acceptance-criteria verdict

| Acceptance criterion | Result | Evidence |
|---|---|---|
| No fixture path wipes tables | **FAIL** | Removal exists only in dirty worktree; committed HEAD still truncates. |
| Every service test passes against populated data | **FAIL** | 376 failures; config still `isolate: true`. |
| No two tests insert colliding keys | **FAIL** | Duplicate-key failures remain; lint misses helper-generated fixed IDs. |
| Assertions depend only on arranged data | **FAIL** | Runtime is red and several assertions were weakened instead of preserved. |
| Full lane green with test count preserved | **FAIL** | Count is above baseline, but 376 tests fail. |
| Repeatable unscoped-read check | **FAIL** | R1/R2 have major semantic holes and permanent waivers. |

Overall verdict: **NOT DONE**.

## Process findings

### Simplicity stop failed

Planning knew the work touched roughly 300 files. Repository rules require stopping and challenging assumptions when a change is expected to exceed 1,000 lines. Actual churn is roughly 29,000 changed lines. The central simpler alternative—`isolate: false` with truncation retained—was not used.

### Red phase happened after 86 commits

Migration commits stayed green because truncation continued to hide the property being changed. No small failing end-to-end proof guarded the new architecture before the mass rewrite. The real exposure step happened after all migration batches and produced 376 failures.

### Architecture review checked inventory, not causality

The critiques thoroughly recounted files, schemas, and syntax patterns. They did not challenge whether no-wipe was required for the measured speedup. They also missed non-integration consumers and accepted a syntactic lint approximation as proof of semantic isolation.

### Commit slicing did not make the result reviewable

Eighty-six commits do not make a 263-file semantic rewrite safe to review. Many changes repeat mechanical ID substitutions while others alter the meaning of global, empty, ordering, and pagination tests.

## Salvage value

Preserve the branch as a read-only quarry until replacement work lands.

Potentially useful:

- timing measurements and the proven `isolate: false` prize;
- the dirty failure JSON and file inventory;
- a simplified scoped-ID helper for targeted contaminated-world tests;
- individual assertion changes that are independently shown to preserve or strengthen behavior;
- inventories of mocks, timers, fixed IDs, raw SQL, and global state.

Do not salvage wholesale:

- the current branch or commit history as a PR;
- the lint plugin as isolation proof;
- weakened empty/global assertions;
- the no-wipe capstone;
- the current architecture verdict;
- mass mechanical migrations without file-by-file semantic review.

The scoped-ID helper itself can be simpler: cache `randomUUID()` per label and let `next()` return `randomUUID()`. SHA-256 derivation and manual UUID bit shaping add no useful property here.

## Recommended replacement

### 1. Performance work package

Start from fresh `origin/main`:

1. Flip the service project to `isolate: false`.
2. Keep per-test truncation.
3. Reproduce the observed 8–12 order-dependent files.
4. Fix module, mock, timer, environment, singleton, and lifecycle leaks, or keep a small explicit isolated project for files that truly need module isolation.
5. Run the full service lane repeatedly and record test count plus setup, import, test, and wall timing in CI.

This should capture most measured value with a small fraction of AU38's blast radius.

### 2. Targeted query-correctness work package

For production reads that must filter by tenant, team, owner, or actor:

1. Seed the test's own row.
2. Seed one explicit foreign row designed to expose the missing predicate.
3. Exercise the real API or service path.
4. Assert that the own row is included and the foreign row is excluded.

This is deterministic and directly tests the production risk.

### 3. Optional cleanup-removal probe

Only after the performance work lands:

1. Measure actual remaining truncate cost in CI.
2. Compare transaction rollback, cheaper cleanup, per-file cleanup, or another bounded mechanism.
3. Stop before implementation if the solution again exceeds 1,000 lines.

## Verification used for this review

- `npm run check`: passed, 55 packages, zero type errors.
- `npm run lint`: failed because the dirty `vitest.integration.config.ts` needs formatting.
- `npm run test`: failed, 6,191 passed / 1 failed; duplicate fixed user ID in `AR4b-formation-seam.test.ts` after truncation removal.
- Parsed `.pipeline/work/AU38/scripts/results.json`: 2,865 total / 2,485 passed / 376 failed / 4 pending.
- `git diff --check` for committed and dirty diffs: passed.

## Final investment call

AU38 is technically repairable but economically poor to repair in place.

**Kill the current delivery path. Do not delete the branch yet. Do not merge it. Do not continue increments 8–10.**

Extract evidence and a few independently reviewed improvements into smaller clean branches. The likely useful performance change is measured, bounded, and does not require the mass rewrite.
