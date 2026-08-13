# AU38 — External Review

**Review type:** External, independent review  
**Date:** 2026-08-13  
**Reviewer position:** Not the AU38 planner or builder  
**Reviewed tree:** `/Users/tg/hyperidle/.worktrees/AU38`, branch `chore/AU38-test-self-isolation`, committed HEAD `0f7ebe6a7`, plus the worktree's uncommitted no-truncate and `isolate: false` capstone changes  
**Pipeline verdict:** **NOT DONE**  
**Investment verdict:** **Kill AU38 as a merge candidate. Preserve the branch read-only as evidence and a source for selective salvage.**

## Executive verdict

Do not merge this branch and do not continue increments 8–10 on its current architecture.

The outcome remains worth pursuing: the service integration lane is much too slow, and the recorded `isolate: false` experiment shows a large available improvement. The implementation is not worth saving wholesale. Its central causal claim is wrong, its proof model does not match its acceptance criteria, it weakens existing test behavior, and its intended final configuration remains very far from green.

The correct recovery is a fresh work package and branch from current `origin/main`: set the service lane to `isolate: false` while keeping per-test database cleanup, then fix only the reproduced module-cache, timer, environment, mock, and singleton leaks. Measure the remaining cleanup cost afterward. Treat dirty-world query correctness as targeted contamination testing, not the default environment for every service integration test.

Sunk cost must not influence this decision. Continuing this branch would add more semantic review cost and more assertion loss in order to defend a direction that is not required for the measured performance prize.

## Decisive runtime evidence

The review ran the intended capstone configuration in the existing worktree: the fixture wipe removed and the service Vitest project set to `isolate: false`.

Two full service-lane runs failed differently:

| Run | Failed files | Failed tests | Passed tests | Skipped tests |
|---|---:|---:|---:|---:|
| 1 | 111 | 387 | 2,474 | 4 |
| 2, JSON reporter | 91 | 330 | 2,531 | 4 |

The second run reported 2,865 total tests. Thirty-three failing files had not been changed by AU38. The changing failure set confirms order-dependent coupling remains. Failures included duplicate primary keys, global-state assertions, configuration state leaked between tests, notification queue contamination, and timer/module behavior.

This is not a nearly complete migration. Whole test families remain incompatible with the intended architecture. For example, `layers/core-api/src/__tests__/notifications/notification-queue.integration.test.ts` still passes fixed IDs through the `enqueue` repository helper; runtime produced duplicate primary-key failures such as `n-throttle`, `n-sent`, and `u-1`.

## The central premise is false

The plan says the failed real-PostgreSQL experiment and the failed `isolate: false` experiment failed for the same data-isolation reason. The evidence does not support that.

The recorded `isolate: false` experiment already reduced:

- setup CPU time from 2,831 seconds to 40.6 seconds;
- wall time from 1,170 seconds to 258 seconds.

That experiment still called `truncateAllTables()` before every test. Fixed IDs, unscoped database reads, and cross-test row collisions therefore could not be the cause of its failures. Its failures were shared module registry, mocks, timers, environment, and singleton state. The measured 4.5× wall-time improvement was already available without rewriting hundreds of test files or removing database cleanup.

The PostgreSQL experiment failed for other reasons recorded by the plan itself: PGlite/PostgreSQL behavioral differences and connection-pool leakage. Those are also not proof that every service integration test must run against a permanently dirty shared database.

The analogy in the architecture—shared database and shared module registry are “the same bet”—was treated as causality. It is not.

## Acceptance-criteria review

| Acceptance criterion | Result | Evidence |
|---|---|---|
| No fixture path empties tables between tests | **FAIL / uncommitted** | The removal exists only as an uncommitted edit to `framework/db/src/__testing__/test-pool.ts`. Committed HEAD still truncates. |
| Every service test passes against a populated database | **FAIL** | 91–111 files and 330–387 tests failed in two capstone runs. |
| No colliding primary keys | **FAIL** | Runtime produced repeated duplicate-key failures, including unchanged notification tests. |
| Every assertion relies only on data arranged by that test | **FAIL** | Unchanged files remain; the lint rules cannot prove this property; several migrated assertions were weakened instead. |
| Full lane green with no test-count reduction | **FAIL** | Full lane is red. The stored 2,845 baseline is also stale against the later recorded 2,861 floor. |
| Unscoped reads fail a repeatable check | **FAIL** | R2 recognizes only a narrow direct Drizzle syntax and accepts any `.where(...)`, regardless of whether it uses test-owned data. |

Overall pipeline verdict: **NOT DONE**.

## Requirements problems

### The outcome mixes three separate goals

AU38 combines:

1. make `isolate: false` safe and capture its measured setup improvement;
2. remove per-test database cleanup;
3. turn the entire integration suite into a missing-predicate detector.

Only the first is required for the already measured 4.5× improvement. The second has an estimated saving of roughly 110 seconds based on a small sample, not a measured full-lane CI result. The third is a correctness-testing strategy, not a prerequisite for either runtime optimization.

These should have been separate decisions and separate work packages.

### The shared-database AC is not what the architecture runs

The plan and validation scenarios describe files running against one shared database. The implementation uses four Vitest workers, each with its own in-process PGlite instance. Each worker's leading file begins with an empty database. The architecture critique explicitly recorded this gap.

Therefore the ordinary lane cannot deterministically prove that every file passes against pre-existing foreign data. Worker allocation and file order can mask violations. The two review runs' changing failure counts demonstrate that nondeterminism in practice.

### Empty-world behavior is sometimes the requirement

“The database is empty when my test starts” is not universally invalid. Controlled isolation is correct for tests of:

- first boot and default configuration;
- empty-list and no-result responses;
- global queue behavior;
- fixed production singleton rows;
- exact pagination totals;
- bootstrap and idempotent seeding.

Contamination should be arranged explicitly where the behavior under test is tenant/team/owner scoping. Making every test inherit arbitrary earlier state destroys valid contracts elsewhere.

## Architecture problems

### Permanently dirty shared state makes test order semantic

Production-fixed rows cannot always be scoped. Factory/bootstrap IDs, server configuration, and credential catalog names are deliberate singletons. One test can mutate such state and affect every later test in the same worker. Re-upserting one known field does not prove all fields were restored or that a later test saw its intended starting state.

Before/after counts can also hide missing first-call behavior: if an earlier test already inserted the production-fixed rows, a later “idempotency” test can prove the second call added nothing without proving that the first call creates the required state.

### The scoped-ID helper is overbuilt

`makeScopedIds()` mints a random token, hashes token plus label with SHA-256, manually shapes UUID version/variant bits, and caches the result. A per-test `Map<label, randomUUID()>`, with `next()` returning `randomUUID()`, gives the required stable-per-label and unique-per-test behavior with less code and less custom cryptographic formatting.

The helper may be useful for targeted contamination tests or new tests. Its current complexity is not justified.

### Lint rules provide false assurance

`no-literal-entity-ids` only catches direct string literals in object or array literals passed directly to `.insert(...).values(...)`. It misses IDs:

- passed through variables, spreads, seed helpers, repositories, or API calls;
- written by raw SQL, updates, upserts, or other writers;
- stored in non-`id` unique keys.

It also flags non-entity values such as model, tool, and community identifiers, which created permanent waivers.

`no-unscoped-table-read` only recognizes direct `db.select().from()` chains. It treats any `.where(...)` as scoped even when the predicate is a shared status, timestamp, or other global value. It misses repository reads, API reads, raw SQL, relational queries, deletes, and helper abstractions.

Current waivers contain 11 R1 files and 6 R2 files. These rules are a narrow style check, not enforcement of AC3, AC4, or AC6. Founder approval of a syntactic approximation did not amend the stronger acceptance criteria, so the proof claim remains false.

## Concrete assertion regressions

The plan explicitly forbids weakening assertions. AU38 nevertheless changes behavioral tests into shape or tautology checks.

Examples:

- `layers/core-api/src/__tests__/conversations.integration.test.ts`: “returns empty list when no threads” no longer proves an empty list or zero pagination total. It looks for one random nonexistent UUID and checks response types.
- `layers/core-api/src/__tests__/daily-digest.integration.test.ts`: “returns empty array when no queued items” no longer proves the digest is empty. It proves only that an ID the test never inserted is absent.
- `layers/core-api/src/__tests__/P2-org-routes.integration.test.ts`: “org chart is empty” drops the `edges` length-zero assertion and keeps only array-shape checks.
- `layers/core-api/src/routes/__tests__/products.integration.test.ts`, `routines.routes.integration.test.ts`, and `notifications.routes.integration.test.ts`: empty-response tests are renamed to “returns an array regardless of world state” and reduced to shape checks.
- Pagination totals and global operation counts are repeatedly changed from exact values to `toBeGreaterThanOrEqual`, which can allow duplicates or unrelated processing to pass.

Client-side filtering of a global endpoint response can be appropriate for a row-containment test. It is not an equivalent replacement for a test of the global endpoint's exact empty, total, ordering, queue, or pagination behavior.

Three changed integration files also have fewer `expect()` calls than `origin/main`: `P2-org-routes.integration.test.ts`, `conversations.integration.test.ts`, and `daily-digest.integration.test.ts`.

## Scope and branch condition

The committed diff against `origin/main` is:

- 263 files;
- 17,235 additions;
- 11,758 deletions;
- 86 branch-only commits;
- seven commits behind current `origin/main` at review time.

Most committed changes are test-world files; production code was not changed. That makes selective salvage possible, but does not make the combined diff reviewable or safe.

The worktree also contains uncommitted capstone edits and an untracked failure-classification script. No implementation `review.md` exists. `progress.json` stops at batch 5 while commit history claims completion through batch 7g.

The root lockfile contains unrelated npm normalization churn beyond registering the new workspace plugin. This should not be carried into any recovery.

## Process review

### Simplicity stop was ignored

Repository instructions require stopping before implementation when a change is estimated at 1,000 or more lines and challenging the assumptions that made it complex. Architecture knowingly scheduled roughly 313 files. Actual churn is roughly 29,000 changed lines. No effective simplicity stop occurred.

### Refinement was skipped despite unresolved requirements

`progress.json` says refinement was skipped because outcome, ACs, and boundaries were settled. Architecture then found a direct conflict over whether `isolate: false` was inside or outside AU38 and required a founder interpretation. That is evidence the requirements were not settled.

### Green-at-every-commit claim is unsupported

The plan requires the service lane to remain green at every commit. Commit history contains explicit red-lint fixes, unused-import fixes, formatting fixes, and a migration root-cause correction. The durable progress artifact records one lane result through batch 5, while dozens of later commits are not backed by recorded full-lane evidence.

### Review failed to challenge causality

Architecture critique reproduced inventories and counts thoroughly. It did not challenge the premise that database contamination was required for the `isolate: false` performance gain, even though the experiment retained per-test truncation. It also accepted a proof arrangement it acknowledged could not expose foreign rows to every file.

## What is salvageable

Preserve the branch as a read-only quarry until recovery is complete. Useful material includes:

- CI timing measurements and the measured `isolate: false` prize;
- inventory of files using mocks, timers, module state, fixed IDs, raw SQL, production-fixed rows, and global reads;
- the per-pattern analysis as research, after rechecking its conclusions;
- selected assertion improvements that are independently reviewed and demonstrably stronger;
- possibly a simplified scoped-ID fixture for new or explicitly contaminated tests.

Do not salvage wholesale:

- the mass rewrite of hundreds of tests;
- the current lint plugin as proof of isolation;
- the no-wipe capstone;
- the claim that a permanently dirty database is the correct default test world;
- unrelated lockfile churn.

## Recommended recovery

### Work package A — capture the measured performance prize

1. Start a fresh branch from current `origin/main`.
2. Change only the service project to `isolate: false`.
3. Keep per-test database cleanup unchanged.
4. Reproduce failures before fixing them.
5. Fix only shared module-cache, mock, timer, environment, app lifecycle, and singleton leaks.
6. Run the full service lane repeatedly and with varied ordering or seeds.
7. Prove the result in CI and record test count plus setup/import/test/wall timing.

This should be a bounded change around the reproduced failure cluster, not a suite-wide migration.

### Work package B — decide whether cleanup removal is worth doing

Only after work package A lands:

1. Measure total per-test truncate cost in the real CI configuration.
2. Compare transaction rollback, cheaper cleanup, per-file cleanup, and database-template approaches.
3. Preserve hermetic defaults unless measured evidence justifies a different mechanism.
4. If the expected implementation again exceeds 1,000 lines, stop and return to the founder before building.

### Work package C — targeted contaminated-world correctness

Add small explicit tests that seed foreign tenant/team/owner data before exercising queries where missing predicates are a real risk. These tests should demonstrate the relevant production boundary directly. Do not make unrelated global-list, boot, queue, or singleton tests inherit arbitrary foreign state.

## Final decision

**Kill the current AU38 implementation path. Do not delete the branch yet. Do not merge it. Do not continue its capstone.**

Create a fresh, bounded performance work package around `isolate: false` with database cleanup retained. Mine AU38 only for evidence and independently reviewed improvements.

That is the lowest-cost route to the measured speedup and the safest route to preserving the meaning of the integration suite.
