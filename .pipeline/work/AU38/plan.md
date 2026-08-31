# AU38 — Each test isolates its own data; the framework stops wiping the database

**Status: not done.** The implementation path was killed after external review; the outcome is still
wanted. See *How we work on this*.

## What we need

A service integration test should arrange data nobody else can collide with and assert only on data it
arranged, so the `db` fixture no longer has to empty the world before every test.

Three costs are paid today. **Time** — the fixture truncates all 49 tables per *test*, not per file.
**A ceiling on everything else** — wiping shared state is only safe when one test touches the database
at a time, so the lane cannot be made more parallel and cannot share one long-lived database across
files. In CI (2-vCPU GitHub runner, 329 files) the per-file PGlite boot shows up as `setup` = 2831
CPU-seconds, the single largest number anywhere in CI, larger than the tests themselves and larger than
typecheck and lint combined. **Correctness** — "the database is empty when my test starts" is an
assumption no production code may make, and a suite built on it cannot catch a query missing a tenant,
team, or owner predicate. `toHaveLength(1)` against a table holding exactly one row because everything
else was deleted proves nothing about filtering.

Done means: no fixture path empties a table between tests; every service integration test passes against
a database already populated by other tests; no two tests insert a colliding primary key; every assertion
is satisfied by data the test itself arranged rather than by the absence of rows it did not create; the
full lane green with a test count no lower than before; and a repeatable check that reports an unscoped
whole-table read, so the old pattern cannot return quietly. Assertions may be re-homed or tightened but
never weakened to pass — a test that stops asserting something is a regression, not a migration.
Production code may not change to accommodate a test, and the lane may not be parked red between commits.

Out of scope: moving the service lane off PGlite or running one out-of-process database across files
(the follow-on this unblocks, to be registered separately); the harness lane; the unit lane's own
fixtures; any change to which tables exist or who owns them.

## How it works

Today `framework/db/src/__testing__/test-pool.ts` allocates one PGlite instance per test file and, on
every `checkout()`, runs `TRUNCATE TABLE <49 tables> RESTART IDENTITY CASCADE`; `test-fixtures.ts` wires
that into the per-test `db` fixture. The tests are written against the empty world this guarantees:
across 338 integration files, 36 use `randomUUID`/`nanoid` for any identifier, 148 assert with
`toHaveLength(...)`, and 28 separate files insert the literal `id: "t1"`. No scoped-identifier helper
exists in any `__testing__` directory.

The measured shape of the problem, after two failed attempts and a first-party counterfactual:

- **The performance prize sits behind one config line, not behind test isolation.** Flipping the service
  Vitest project to `isolate: false` while *keeping* the per-test truncate takes `setup` from 2831s to
  40.6s and wall from 1170s to 258s in CI (~3× locally: 299s → 94–103s). Because that run still
  truncated, fixed IDs and unscoped reads cannot have been what made it fail.
- **What blocks `isolate: false` is module-registry and lifecycle leakage, not database state.** The
  failing-file set is order-dependent — 13/5/12 across three local runs, union 23 files, stable core 7.
  The shape is files that start background work (drain loops, schedulers, boot sequences) without
  deterministically disposing it, plus a few `vi.mock` registry leaks.
- **Swapping PGlite for real PostgreSQL** (migrated template database, per-worker `CREATE DATABASE ...
  TEMPLATE`) took database acquisition from ~2172ms to ~7ms but left 213 tests across 52 files failing on
  behavioural differences PGlite never exposed. Two real defects found on the way are worth remembering:
  PGlite's `db.execute()` resolves to `{ rows }` while postgres-js resolves to the array itself (both
  test pools read `.rows` unconditionally), and a per-file connection pool leaks under `isolate: true`
  until `max_connections` is exhausted.

Local timings do not transfer and must not be used to judge any of this — the same lane's `setup` is
494.9s locally against 2831s in CI. Correctness findings do transfer.

## How we work on this

The branch `chore/AU38-test-self-isolation` (HEAD `0f7ebe6a7`, 86 commits, 263 files, 234 integration
test files migrated) is **killed as a merge candidate** — three independent external reviews and a
first-party counterfactual agreed. Measured green, that branch runs the lane at 261s against `main`'s
299s: after the whole migration, essentially none of the prize was captured, and its own next step (the
no-truncate capstone) was 376 tests red across 105 files. Its central claim — that the PostgreSQL and
`isolate: false` attempts failed for the same data-isolation reason — is contradicted by its own
measurement. Keep the branch read-only as a quarry (CI timings, the leak inventory, the per-pattern
analysis, selected assertion improvements); do not salvage the mass rewrite, the lint plugin as proof of
isolation, or the no-wipe capstone. Sunk cost does not enter the decision.

The recovery is three bounded packages, in order, from current `origin/main`:

- **A — capture the measured prize.** Change only the service project to `isolate: false`, keep per-test
  cleanup, reproduce the failures first, then fix only the shared module-cache, mock, timer, environment,
  app-lifecycle and singleton leaks in that ~23-file cluster. Prove it in CI with test count and
  setup/import/test/wall timings, run repeatedly and with varied ordering.
- **B — decide whether removing cleanup is worth doing at all.** Only after A: measure the real per-test
  truncate cost in CI, then compare transaction rollback, cheaper cleanup, per-file cleanup and database
  templates. Keep hermetic defaults unless measurement says otherwise. If the implementation again looks
  like 1,000+ lines, stop and come back before building.
- **C — dirty-world correctness as targeted tests.** Small explicit tests that seed foreign
  tenant/team/owner rows before exercising queries where a missing predicate is a real risk, rather than
  making every global-list, boot, queue or singleton test inherit arbitrary foreign state.

Whether the acceptance criteria above survive B is itself B's question; they were written assuming the
wipe must go, and that assumption is now the thing under test.
