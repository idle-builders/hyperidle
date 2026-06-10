# Retro — AF1: Make the typecheck gate real and self-protecting

Z8-001 root cause: `npm run check` ran `tsc -p` against an empty `include` → vacuously green while ~1,861+ type errors shipped. Fixed with a per-package fan-out gate (`scripts/typecheck-gate.ts` + pure `scripts/lib/typecheck-verdict.ts`), a machine-readable quarantine list (`typecheck-debt.json`, 10 packages), a crash guard, and a stale-entry ratchet. CI gets teeth transitively via verify→attestation.

## Key observations

1. **Spec error estimate was 2.4× too low (1,861 → 4,474 actual).** The spec counted with `tsc -b`, which stops early on dependency failures and undercounts. The per-package fan-out revealed the true scope across 10 broken packages. AF2–AF5 scoping should budget against 4,474, not the spec's number. Ground-truth measurement during plan reconciliation paid off.

2. **Critique caught a real gate-integrity hole the plan missed (W1 crash guard).** When `tsc` crashes (OOM, invalid tsconfig) it exits non-zero with zero parseable error lines — the naive gate would falsely pass. The architecture-critique flagged it; the designer folded the guard into the plan; the builder implemented it (checks raw parsed count, not the filtered count); code review verified it live. Producer/evaluator separation earned its keep.

3. **Builder extracted a pure `computeVerdict()` function so gate logic is unit-testable through imports.** Satisfies CLAUDE.md's "tests import code" rule for what is nominally a build script — 17 tests exercise 5 decision rules + 2 guards against fabricated inputs, no mocks.

4. **Dynamic package discovery replaced a hardcoded list + compensating guard.** Critique W2 → the gate now globs `packages/*/tsconfig.json` and is self-maintaining: a new package is automatically brought under the gate.

5. **The stale-entry ratchet is a binding contract for AF2–AF5.** Draining a package to zero errors requires removing its `typecheck-debt.json` entry in the same commit, or `npm run check` fails. Documented in the plan; the gate's failure message is actionable.

6. **Clean pipeline discipline.** Architecture → critique → revision → tests → code → review → refactor → attestation. No reverts, no WIP-cleanup commits, no rework loops.

## Cost signals

- 1 critique round (score 8/10, no CRITICAL) → no re-critique needed; 3 WARNINGs folded in a single designer revision.
- 1 review round → DONE first pass; 3 low findings applied in one builder follow-up.
- 0 BLOCKERs, 0 NOT-DONE cycles.
