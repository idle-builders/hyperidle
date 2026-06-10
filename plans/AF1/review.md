# AF1 Code Review

**Verdict: DONE**

The implementation faithfully delivers the architecture plan (including all three WARNING mitigations from the Phase 2 critique) and satisfies all five acceptance criteria. No blocking findings. Two low-severity findings below.

## AC Completeness

| AC | Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | `npm run check` type-checks every package incl. web -- not an empty set | PASS | Dynamic discovery finds all 11 packages (verified by running `npm run check`; summary table lists all 11 including `web` and `pipeline`). |
| AC2 | Type error in non-excepted file -> exit non-zero + names the file | PASS | Injected `const x: string = 123` into `packages/api-contract/src/index.ts`; gate exited 1 and output included `packages/api-contract/src/index.ts(19,7): error TS2322`. CI fails transitively via attestation chain (no CI changes needed -- correct per plan Decision 4). |
| AC3 | `typecheck-debt.json` enumerates exactly the broken units and nothing else | PASS | 10 entries match the ground-truth table (shared, db, design-system, desktop, eslint-plugin-design, eval, fabric, server, web, pipeline). `api-contract` is NOT listed (verified clean by gate). |
| AC4 | `npm run verify` passes immediately, no regression | PASS | Attestation for commit `afca4c82` present with `status: "passed"`. Gate exits 0 on clean tree. |
| AC5 | Removing a still-broken package -> gate fails. PLUS crash guard + stale ratchet | PASS | (a) Removed `shared` from debt list -> gate exited 1 with 155 errors. (b) Crash guard: corrupted `api-contract/tsconfig.json` with `{"extends":"./nonexistent.json"}` -> tsc exit 2 with zero parseable errors -> gate reported CRASHED and exited 1. (c) Stale ratchet: added clean `api-contract` to debt list -> gate reported STALE and exited 1. |

## Lens Findings

### Architecture

**Plan compliance: full.** The implementation matches every plan decision:

- Decision 1 (per-package fan-out): implemented exactly.
- Decision 2 (debt file shape): implemented exactly, field-by-field match.
- Decision 3 (gate semantics): all 5 rules implemented and verified live.
- Decision 4 (no CI changes): confirmed, no CI files touched.
- Decision 5 (check rewiring): `package.json` change matches plan diff.
- Decision 6 (dynamic discovery): implemented, addressing W2 from the critique.
- W1 (crash guard): implemented. `rawParsedCount` (pre-filter) is the sentinel, not `ownErrors` (post-filter). Correctly avoids false-triggering on packages with only reference-noise errors.
- W3 (AF2-AF5 binding contract): documented in the architecture plan.

The builder extracted the verdict logic into `scripts/lib/typecheck-verdict.ts` as a pure function, beyond what the plan specified. The plan's appendix said "if a future refactor makes the gate complex enough to warrant unit tests (e.g., extracting the error-parsing logic into a pure function), that's the time to add them." The builder made this judgment call during implementation. The extraction is clean and well-motivated: the verdict function has 5 decision rules with interaction effects, warranting unit coverage.

**Layer integrity:** Pure build tooling. No runtime code, no layer crossings. Tests live in `packages/api-contract/` per CLAUDE.md rules.

### Security

N/A. Pure build tooling with no API endpoints, no user input, no secrets, no outbound requests. Correctly scoped.

### Adversarial

**The Saboteur:** No backdoors. The gate's integrity depends on (a) the `ERROR_LINE_RE` regex matching tsc output, (b) the own-file filter comparing package names, and (c) the crash guard catching zero-parseable-line failures. All three were verified against real tsc output. One edge case: if a non-excepted package's tsconfig.json is deleted, dynamic discovery silently removes it from the gate. The orphaned-debt-entry guard catches this only for debt-listed packages. For non-debt packages (currently only `api-contract`), deletion would be a silent regression. In practice this requires deleting a committed file, which git history would catch. Not a gate bypass.

**The New Hire:** The `@lore` comments (5 of them across the two files) explain every non-obvious decision: why per-package fan-out, why TS6305/6307/6059 are filtered, why crash guard checks `rawParsedCount` not `ownErrors`, and why tests live in `api-contract`. The summary table output is self-explanatory. Good onboarding surface.

**The Auditor:** PR claims match the diff. Files changed: `typecheck-debt.json` (new), `scripts/typecheck-gate.ts` (new), `scripts/lib/typecheck-verdict.ts` (new), `packages/api-contract/src/__tests__/typecheck-verdict.test.ts` (new), `package.json` (one-line change), `docs/guides/developer/useful-commands-reference.md` (one-line change). No unexpected files.

### Simplification

**F1 (low) -- Dead parameter: `excepted: Set<string>` in `computeVerdict` is never read.**

`computeVerdict(results, excepted)` accepts the excepted Set as its second parameter, but the function body only reads `r.excepted` (the boolean on each `PackageResult`). The Set is passed by the gate script and by every test, but never dereferenced inside the function. The gate script sets `result.excepted = excepted.has(pkg)` before calling `computeVerdict`, so the information flows through the PackageResult, making the parameter redundant.

This is not a correctness issue -- the function works correctly. But the dead parameter is misleading: a reader would expect the function to use it for something. Either remove the parameter (the function only needs `results`) or use it inside the function (e.g., derive `r.excepted` from the Set inside computeVerdict instead of requiring callers to pre-set it).

**Location:** `scripts/lib/typecheck-verdict.ts` line 79.

**F2 (low) -- Dangling `$schema` reference in `typecheck-debt.json`.**

`typecheck-debt.json` references `"$schema": "./scripts/typecheck-debt.schema.json"` but that file does not exist. The plan called it "optional, for IDE support." Harmless -- IDEs ignore missing schemas -- but it's a broken pointer. Either create the schema file or remove the `$schema` key.

**Location:** `typecheck-debt.json` line 2.

### AI Slop

**F3 (low) -- Unsafe `as RowStatus` cast on a non-matching string.**

Line 191 of `typecheck-gate.ts`: `` status = `QUARANTINED (${owner})` as RowStatus ``. The `RowStatus` type is `"PASS" | "QUARANTINED" | "FAIL" | "CRASHED" | "STALE"`, but the actual runtime value is `"QUARANTINED (AF2)"` which is not a member of that union. The cast silences TypeScript. This violates the project's TypeScript rules ("No unsafe `as` casts"). Since `status` is only used for display, the fix is to change `RowStatus` to `string` or use a template literal type.

**Location:** `scripts/typecheck-gate.ts` line 166, 191.

## Test Quality

17 tests, all importing `computeVerdict` from `scripts/lib/typecheck-verdict.ts` via relative path. Every test calls the function with constructed inputs and asserts on specific fields of the returned `VerdictResult`. No tautological assertions, no `toBeDefined()` only, no filesystem reads.

Coverage:
- Happy path: clean pass, excepted-with-errors pass, multiple-excepted pass (3 tests)
- AC2 (non-excepted fail): single fail, error lines preserved, mixed pass+fail, mixed excepted+non-excepted (4 tests)
- AC5 (removed still-broken): explicit test (1 test)
- Crash guard (W1): non-excepted crash, excepted crash, raw output preserved (3 tests)
- Stale ratchet: stale single, stale message, stale multiple, non-stale excepted with errors (4 tests)
- Combined: full 11-package passing scenario, crash+fail interaction (2 tests)

AC1 and AC4 are structural/integration properties verified by running the gate and verify, not unit-testable.

The `makeResult` helper is lean and the `makeExcepted` helper is a thin wrapper. No over-abstraction. The test file header documents which ACs map to which test suites.

## Summary

Three low-severity findings, none blocking:
- F1: Dead `excepted` parameter in `computeVerdict` (simplification)
- F2: Dangling `$schema` reference (simplification)
- F3: Unsafe `as RowStatus` cast (TypeScript rules)

All acceptance criteria verified live. The implementation is clean, well-documented, and matches the architecture plan.
