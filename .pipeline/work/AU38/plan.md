# AU38 — Each test isolates its own data; the framework stops wiping the database

## Work package

**Outcome.** A service integration test arranges data nobody else can collide with, and asserts only on
data it arranged. The `db` fixture stops issuing a 49-table `TRUNCATE` before every test, and the suite
stays green — including when files run concurrently against one shared database.

**Why this matters.** Three costs, all currently paid on every run.

The first is time. The fixture truncates all 49 tables per **test**, not per file (`test-fixtures.ts:49`
calls `checkout()`, which calls `truncateAllTables`). At ~2,800 service integration tests and ~40ms per
truncate measured on a three-file trace, that is on the order of 110s per full run spent deleting rows
no test needed deleted. This number is arithmetic from a sample, not a measured total — quantifying it
exactly is part of the work, not a claim to build on.

The second is a ceiling on everything else. Wiping shared state is only safe when one test touches the
database at a time, so the lane cannot be made more parallel and cannot share one long-lived database
across files. The per-file PGlite boot documented in `test-pool.ts` (~1.47s × 324 files ≈ 476s, matching
vitest's own reported `setup 472.89s`) is a **separate** cost, but the fix for it — one out-of-process
database serving many files — is blocked by this one. Tests that assume an empty world cannot share a
world. So this work package is worth doing for its own saving and is also the precondition for a larger
one.

The third is correctness. "The database is empty when my test starts" is an assumption no production
code may make, and a suite built on it cannot catch the class of bug where a query is missing a tenant,
team, or owner predicate. A test asserting `toHaveLength(1)` against a table containing exactly one row
because everything else was deleted proves nothing about whether the query filters.

Not doing it keeps the slowest lane slow, keeps the larger optimisation locked, and keeps a category of
missing-predicate bug invisible.

**What exists today.** `framework/db/src/__testing__/test-pool.ts` allocates one PGlite instance per test
file and, on every `checkout()`, runs `TRUNCATE TABLE <49 tables> RESTART IDENTITY CASCADE`.
`test-fixtures.ts` wires that into the per-test `db` fixture. The tests themselves are overwhelmingly
written against the empty world this guarantees: across 338 integration test files, 36 use
`randomUUID`/`nanoid` for any identifier, 148 assert with `toHaveLength(...)`, and 28 separate files
insert the literal `id: "t1"`. No scoped-identifier helper exists in any `__testing__` directory.

AU32 ("Tests arrange worlds production can actually produce") established the neighbouring discipline —
an arranged entity gets its companion rows — and is the precedent for a suite-wide test change landing
as one work package.

**Missing delta.** Tests do not own their isolation. Identity is hardcoded and therefore collides, and
assertions read whole tables rather than the rows the test created. Both must change before the wipe can
be removed; removing the wipe first would turn ~300 files red at once.

**Depends on.** None. AU32 has shipped and is precedent rather than a blocker; the table ownership from
AU30 is already in place. The service lane's per-file PGlite boot is downstream of this work, not
upstream of it.

**Complexity.** L

**Engineering tier.** production — the suite is the proof the shipped system works, and this changes how
every service integration test establishes its own truth.

**Pre-build.** `/architecture` required. Two things need deciding before any file is edited, and neither
is a refinement question about the goal:

1. **How identity is scoped**, given production ID formats must still be honoured — a per-test prefix, a
   generated UUID, a helper the fixture injects, or a per-test schema/database. These have very
   different blast radii and the wrong one is ~300 files of rework.
2. **How the change lands.** ~300 files cannot be reviewed as one diff. The sequencing needs to state
   what makes each intermediate commit safe, and the truncate must not be removed until the suite passes
   without relying on it.

`/architecture` must produce a per-pattern verdict, not one blanket answer — an unqualified
`toHaveLength` on a table is a different fix from one on a filtered API response, and only some of the
148 files genuinely break.

**Constraints.** The suite must be green at every commit; a staged migration may not park the lane red.
Assertions may be re-homed or tightened but never weakened to pass — a test that stops asserting
something it used to assert is a regression, not a migration. Production code may not be changed to
accommodate a test.

**Out of scope.** Moving the service lane off PGlite, or running one out-of-process database across
files — that is the follow-on this work package unblocks, and it should be registered separately once
this lands. The harness lane. The unit lane's own fixtures. Any change to which tables exist or who owns
them.

## Acceptance criteria

- No code path in the `db` test fixture truncates, drops, or otherwise empties a table between tests.
- Every service integration test passes when its file runs against a database already populated by
  other tests' data, rather than an empty one.
- No two service integration tests insert a colliding primary key into the same table.
- Every assertion in the service integration lane is satisfied by data the test itself arranged; none
  depends on the absence of rows the test did not create.
- The full service integration lane is green, with a test count no lower than before the change.
- A test that reads a table without scoping to its own arranged data fails a repeatable check, so the
  old pattern cannot silently return.

## Validation scenarios

- Given two test files that both arrange a team, when they run against one shared database, then both
  pass and neither observes the other's team.
- Given a test that arranges one bet and asserts on the bet list, when another test's bets are already
  present in the table, then the assertion still passes because it is scoped to the arranged bet.
- Given the truncate removed from the fixture, when the full service integration lane runs, then it is
  green and reports no fewer tests than before.
- Given a newly written test that asserts on an unscoped whole-table read, when the repeatable check
  runs, then it is reported rather than passing quietly.
