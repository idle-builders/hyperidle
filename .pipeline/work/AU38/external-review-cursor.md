# AU38 — External Review (measured counterfactual)

**Review type:** External, independent review
**Date:** 2026-08-13
**Reviewer position:** Not the AU38 planner or builder
**Reviewed tree:** `/Users/tg/hyperidle/.worktrees/AU38`, branch `chore/AU38-test-self-isolation`, committed HEAD `0f7ebe6a7`, plus the worktree's uncommitted no-truncate edit
**Pipeline verdict:** **NOT DONE**
**Investment verdict:** **Kill AU38 as a merge candidate. Keep the branch read-only as a quarry.**

This review differs from the two alongside it in one respect: it does not reason about the
counterfactual, it **ran** it. Every number below was measured on this machine tonight, not
inferred from the plan.

## Executive verdict

Do not merge this branch. Do not continue increments 8–10 on its current architecture.

The problem AU38 attacks is real — the service integration lane is the largest single cost in CI.
The solution AU38 chose is not required to fix it. The branch's central causal claim is false, and
the measurement that disproves it is the branch's own measurement, read correctly.

After 86 commits and 263 changed files, the lane on this branch runs **exactly as slow as `main`**.
The entire performance prize is still ahead of the branch, behind a step that is 105 files red.

## Decisive runtime evidence (measured 2026-08-13)

Four full service-lane runs, same machine, same lane, 2,865 tests:

| Tree | Change | Wall | Failed tests | Failing files |
|---|---|---:|---:|---:|
| `origin/main` | one line: `isolate: false`, truncate kept | **88s** | 21 | 12 |
| `origin/main` | same, run 2 | 82s | 7 | 3 |
| `origin/main` | same, run 3 | 88s | 73 | 20 |
| AU38 HEAD `0f7ebe6a7` | 263 files migrated, truncate kept, `isolate: true` | **261s** | 0 | 0 |
| AU38 + uncommitted no-truncate | the capstone, still `isolate: true` | — | 376 | 105 |

Raw results: `/tmp/cf-run1.json`, `/tmp/cf-run2.json`, `/tmp/cf-run3.json`, `/tmp/au38-head.json`.
The counterfactual worktree was created from `origin/main`, run, and removed; the AU38 worktree's
uncommitted changes were stashed for the HEAD run and restored byte-identical afterwards.

Read the two bold numbers together. **A one-line change to unmodified `main` makes the lane 3×
faster locally** (4.5× in CI, per the branch's own PR #477). **AU38 HEAD, green, is no faster than
`main` at all.** Every second of the prize remains unclaimed on this branch.

## The central premise is false, and its own measurement proves it

The plan states that the real-PostgreSQL attempt and the `isolate: false` attempt "both failed for
the same reason", that reason being tests which assume an empty database.

The `isolate: false` measurement is commit `714edc9965f77c55175a79fb02547cbb51627adf`
(branch `measure/isolate-false`, PR #477). Its diff is **one line**:

```
-					isolate: true,
+					isolate: false,
```

`truncateAllTables()` was still called before every test in that run. The database *was* still
wiped. Fixed ids, unscoped reads and cross-test row collisions therefore cannot be what failed it.

So the measured 70× setup collapse and 4.5× wall-time improvement were **already available without
touching a single test file**, and the plan's sequencing consequence — "do this first, then
re-attempt" — inverted the correct order.

## What actually blocks `isolate: false`

Three counterfactual runs failed differently (12 / 3 / 20 files). The set is unstable, exactly as
the plan warned — but the *union* across three runs is **30 files**, and it is not a random spread
across the suite. It is one cluster:

```
agent-work-intent-{retention,supersede,baked-payload,production,recovery}
agent-run-{boundary,admission-failed-reengagement-migration}
{threads.assistant-turn,tasks.task-run,connections-added-after,filesystems-added-after}-...-emit
calling-thread-id-bake · baked-transcript-mapping · durable-queue-regressions
routine-scheduler.au15 · server-disposal · agent-lifecycle-projectors
configuration-projection-boot · factory-run-config · AF17-factory-isolation · demo-world-rich
```

These are files that start background work — drain loops, schedulers, boot sequences — and do not
deterministically dispose it, plus a handful of `vi.mock` module-registry leaks. Representative
failures:

- `the drain did not hand off a request row` — a previous file's still-running drain consumed this
  file's row.
- `expected 'pending' to be 'handed_off'` — same cause, four files.
- `expected [ 'run-runtime', 'app-domain', ... ]` disposal-order mismatches — leaked lifecycle.
- `expected 201 to be greater than or equal to 500` — a mocked write-failure that no longer applies
  because the mock leaked in from another file.

**Scoped ids do not touch any of this.** AU38 would have met this identical wall at increment 9,
after all ~300 files had been rewritten. The leak cluster is also a genuine product signal worth
fixing on its own: production components that do not stop their own background work.

## The goal contradicts its own constraint

The plan says assertions "may be re-homed or tightened but never weakened". A permanently dirty
world makes some contracts unstatable, and the branch resolves the conflict by dropping them.
Verified directly against the diff, not taken from the other reviews:

- `layers/core-api/src/__tests__/P2-org-routes.integration.test.ts` — in "returns 200 with edges and
  users arrays when org chart is empty", `expect(body.edges).toHaveLength(0)` is deleted and nothing
  replaces it.
- `layers/core-api/src/__tests__/daily-digest.integration.test.ts` — "returns empty array when no
  queued items" now filters the response to the test's own ids and asserts that filtered list is
  empty. The test inserts nothing, so the assertion cannot fail. A tautology replaced a real check.

"Returns empty when nothing exists", exact pagination totals, global queue behaviour, first-boot
defaults and singleton bootstrap are legitimate contracts that require a controlled world. This is
not a migration defect to grind out over the remaining 105 files; it is the goal consuming the
suite's meaning.

## AC6 is not enforced

Both rules are narrow syntax checks:

- `no-literal-entity-ids` only inspects string literals in object/array literals passed directly to
  `.insert(...).values(...)`. It misses ids from helpers, variables, spreads, repositories, API
  writes, raw SQL, updates, and every non-`id` unique key (names, emails, idempotency keys,
  source-scoped keys). `bet-state-machine.integration.test.ts` returns fixed ids from helper
  functions, passes the rule, and produced 23 failures in the no-truncate run.
- `no-unscoped-table-read` only recognises `db.select().from(...)` chains and accepts *any*
  `.where(...)` as scoped, including a shared status or timestamp predicate. It misses repository
  reads, API reads, relational queries, raw SQL and deletes.

The residual failure classes confirm the gap: 56 of the 105 failing files fail on `insert` — a
second dimension (unique natural keys) the architecture never planned for — not on ids the rule
can see.

## Where the remaining work actually sits

Classification of the branch's own `work-orders.json` (376 failures / 105 files):

| class | files |
|---|---:|
| `insert` failed — unique natural key / FK, not `id` | 56 |
| value assertion against foreign rows | 44 |
| length assertion against foreign rows | 26 |
| HTTP status — actor resolution picks an arbitrary human | 18 |
| unclassified | 21 |

The HTTP-status class deserves note. `resolveApiKeyActorUserId` in
`layers/core-api/src/middleware/auth.ts` resolves the actor as *the first human user in the table*.
That is correct for a single-human local product and wrong the moment the table holds many humans —
which only ever happens in this new test world. Those 18 files are being rewritten to accommodate a
world the product does not run in.

Also: this 105-file number is a **floor, not a ceiling**. It was produced with `isolate: true`, so
each file still starts against its own empty database and the only contamination is between tests
*within* one file. AC2 and the validation scenarios require the cross-file shared world, which has
never been attempted on this branch.

## Process findings

- **Simplicity stop skipped.** The repo rule requires stopping before implementation at 1,000+ lines
  and challenging the assumptions that made it complex. Architecture knowingly scheduled ~313 files;
  actual churn is ~29,000 changed lines. No stop occurred.
- **`/refine` skipped as "settled"**, then architecture immediately produced a scope conflict
  (is the `isolate` flip in or out of AU38?) that needed a founder ruling. The requirements were not
  settled.
- **Critique never challenged causality.** Round 1 and round 2 audited inventories and counts
  rigorously and did not ask whether the truncate caused the `isolate: false` failures. One question
  against the measurement commit would have ended the work package on day one.
- **Green-at-every-commit is unproven.** `progress.json` records one full-lane result through batch
  5; ~40 later commits carry no recorded lane evidence, and several are red-lint and formatting
  repairs.
- **Ruling 2 rests on the false premise.** The single-worker proof run was withdrawn because "once
  `isolate: false` IS the lane configuration, empty-world tests fail in ordinary CI". True — but
  that argument works equally well *without* the migration, which is the point the ruling missed.

## What is salvageable

Keep the branch. Do not merge it. Do not delete it.

Worth mining:

- The CI timing measurements (2,831s → 40.6s setup; 1,170s → 258s wall). The most valuable artifact
  produced by this work package.
- The 30-file leak cluster measured here, and the classification script
  `.pipeline/work/AU38/scripts/expose.ts`.
- The inventory of files using mocks, timers, module state, fixed ids, production-fixed rows.
- Individual assertion improvements, each independently reviewed as genuinely stronger.
- Possibly a scoped-id fixture for new tests — but `Map<label, randomUUID()>`, not SHA-256 with
  hand-set UUID version and variant bits.

Do not salvage: the 263-file rewrite, the lint plugin as proof of isolation, the no-wipe capstone,
the premise that a permanently dirty database is the correct default test world, the lockfile churn.

## Recommended recovery

**WP-A — capture the prize (small).** Fresh branch off current `origin/main`. Set the service
project to `isolate: false`. Keep per-test truncate unchanged. Reproduce, then fix only the ~30
leak files — predominantly by disposing schedulers and drain loops deterministically, which is a
real defect class independent of testing. Run the lane repeatedly and with varied order until the
set is empty and stays empty. Prove in CI; record test count and setup/import/tests/wall.

**WP-B — decide whether the wipe should go at all (only after A).** Measure the real truncate cost
in the CI configuration rather than extrapolating from a three-file sample. Compare cheaper
mechanisms before considering a suite rewrite: per-file wipe instead of per-test, or a
transaction-per-test with rollback. If the implementation again exceeds 1,000 lines, stop and return
to the founder.

**WP-C — targeted dirty-world correctness (independent).** Write a small number of tests that
deliberately seed foreign tenant/team/owner rows before exercising the queries where a missing
predicate is a real risk. That is how you catch missing-predicate bugs. Making all 2,865 tests
inherit arbitrary foreign state does not catch them; it destroys unrelated contracts.

## Final decision

**Kill the current AU38 implementation path.** The sunk cost is real, but continuing costs more than
it recovers: the branch is 8 commits behind `origin/main` and already conflicting, the capstone is
105 files red with the harder half untested, and the payoff it is red for is obtainable from a
one-line diff plus roughly 30 files of leak repair.
