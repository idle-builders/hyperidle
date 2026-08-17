# AU44 — Fold the packages and shrink what survived

## Work package

**Outcome.** The packages the audit found to be boundaries nobody needed are dissolved into the code
that actually uses them, and the methods and types that survived the deletion pass are cut back to the
shape they would have if written today. Roughly twenty packages stop existing.

**Why this matters.** After the deletion pass the repository is smaller but still shaped by decisions
nobody would make again: type-only packages that centralise contracts one consumer reads, "port"
packages with a single implementation, formatters and helpers that live together only because they
were homeless, and surviving functions carrying parameters, overloads and options no caller passes.
Package boundaries are the expensive kind of clutter — they force import ceremony, dependency blocks
and build wiring on work that should be a function call.

**What exists today.** `work/AU20/destroy/FULL-AUDIT.md` carries 72 rows marked `MERGE` and 327 marked
`SIMPLIFY`, each naming a target or the specific shrink. Alongside them, most framework packages carry
a package-level verdict — dissolve into a named service, dissolve into a named consumer, split between
owners, or genuinely stay shared — with the measured consumer list behind it.

**Missing delta.** Performing the folds and the shrinks.

**Depends on.** AU43 — the deletion pass. Running these in the other order means merging and
simplifying code that is about to be deleted, and a large share of the simplify rows shrink further or
disappear entirely once their dead callers are gone.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Architecture required for the package dissolves only. Which packages fold into which
consumer is decided by the audit, but several targets interact — three packages around harness
capability and protocol have overlapping recommendations, and one pair of audits disagreed about
whether two of them are one thing. That disagreement needs settling before the folds start. The
signature and type shrinking needs no pre-build.

**Constraints.**
- **Rows marked `FINISH` or `PLUGIN` are out of scope and must not be touched.** Track BA owns them.
- Package boundaries enforced by the governance rules are decided by those rules, not by this work. If
  a fold would violate an enforced boundary, the fold does not happen and the row is recorded as
  surviving with that reason.
- No behaviour changes. A simplification that alters what a caller observes is a behaviour change and
  belongs in a different work package.
- Small batches, each committed or reverted. Every edit within a batch first, then one typecheck.

**Out of scope.** Deleting anything — that was the previous pass. Rewriting a surviving implementation
beyond the shrink the audit names. Changing which service owns which table.

## Acceptance criteria

- Every row the audit marks `MERGE` or `SIMPLIFY` is either performed or carries a written reason it
  survived, and the survivor list is short enough for the founder to read and accept.
- Every package the audit marks for dissolution is either gone, with its survivors relocated to the
  named owner, or recorded as surviving with a reason.
- No row marked `FINISH` or `PLUGIN` is modified.
- `npm run verify` passes and the full test suite passes.
- The product's observable behaviour is unchanged.
- No package remains whose only exports are re-exports of another package's symbols.

## Validation scenarios

- Given the audit's merge and simplify lists, when the pass is complete, then each row is performed or
  appears on the accepted survivor list with a reason.
- Given a dissolved package, when the repository is searched for it, then neither the package nor any
  import of it remains.
- Given the running product, when a person exercises each main surface, then everything behaves as it
  did before the pass.
