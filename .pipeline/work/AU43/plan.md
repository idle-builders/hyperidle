# AU43 — Delete everything the audit convicted

## Work package

**Outcome.** Every method, export, door, table and column the destroyer audit marked `DELETE` is gone
from the repository, along with the tests that only existed to reach it. The product behaves exactly
as it does today, because none of it was reachable.

**Why this matters.** The audit found 423 convicted rows against 1,713 audited. That is code every
future reader has to understand before changing anything near it, every agent has to load before
working, and every rename has to drag along. It also actively misleads: several of the convictions are
features that *look* implemented — a settings screen that saves, a table that gets written, an event
that gets emitted — and do nothing. Deleting them makes the shipped truth honest.

**What exists today.** `work/AU20/destroy/FULL-AUDIT.md` carries one row per audited symbol with a
verdict and the traced evidence behind it. 423 rows are `DELETE`, spanning dead exports, doors with no
caller, tables with no writer, columns nothing reads, whole features that never ran, and packages that
dissolve to nothing.

**Missing delta.** The removal itself, done in an order that keeps each step reviewable.

**Depends on.** None.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Not required. The audit is the specification; every row carries its evidence and its
blast radius. No design or refinement phase — this changes no user-facing surface, because nothing
being removed is reachable.

**Constraints.**
- **Rows marked `FINISH` or `PLUGIN` are out of scope and must not be touched.** Track BA owns that
  code and is responsible for cleaning it up as it finishes each feature. Removing it here would
  delete a capability instead of relocating it.
- Table and column drops are in scope, migrations included.
- Work in small batches, each ending either committed or reverted. A batch must never hand a dirty
  tree to the next one.
- Within a batch, make every edit first and typecheck once. Re-running the full check after each
  micro-edit is what stalled the previous attempt at this work for hours.
- A row may survive only with a recorded reason. Silent scope reduction is the failure mode this work
  package is most exposed to, given its size.

**Out of scope.** Merging or simplifying anything that survives — that is the following work package.
Behaviour changes of any kind. Rewriting a surviving implementation while removing its dead neighbours.

## Acceptance criteria

- Every row the audit marks `DELETE` is either removed from the repository or carries a written reason
  it survived, and that list of survivors is short enough for the founder to read and accept.
- No row marked `FINISH` or `PLUGIN` is modified.
- `npm run verify` passes, and the full test suite passes.
- The product's observable behaviour is unchanged: every user-facing surface that worked before works
  after.
- Dropped tables and columns have migrations, and the database can be created from scratch and migrated
  from the current schema without error.
- No orphans remain: no import of a removed symbol, no route registration for a removed handler, no
  scheduled job for a removed timer, no test that only existed to reach removed code.

## Validation scenarios

- Given the audit's delete list, when the pass is complete, then each listed symbol is absent from the
  repository or appears on the accepted survivor list with a reason.
- Given a fresh database, when migrations run, then the schema matches the post-deletion model and no
  dropped table remains.
- Given the running product, when a person exercises each main surface, then everything behaves as it
  did before the pass.
