#!/usr/bin/env tsx
/**
 * AR1 — honest-harness-guard: fails the build when a harness-facing integration
 * test stubs/scripts/mocks the harness it is supposed to exercise against the real
 * binary, or gates itself with a `skipIf`-on-absent availability check.
 * (architecture.md Mechanism 3 + Decision 2/3/5.)
 *
 * Usage:
 *   npx tsx scripts/honest-harness-guard.ts --check            # CI mode (rides `lint`)
 *   npx tsx scripts/honest-harness-guard.ts --write-allowlist  # (re)generate the debt ledger
 *
 * File selection is PATH-ONLY via isHarnessIntegrationPath (single source —
 * scripts/lib/honest-harness-predicate.ts), so the guard and the attestation
 * floor agree on exactly which files are "agentic".
 *
 * Three checks over the selected files:
 *   1. Lane checks (immediate, NEVER allowlisted): no `*.real-harness.test.ts`
 *      file, no `vitest.real-harness.config.ts`, no `test:real-harness` script.
 *   2. skipIf-on-absent check (immediate, NEVER allowlisted): a skip-when-absent
 *      availability gate in a selected file is always a violation — that is the
 *      pattern requireHarness replaces.
 *   3. Stub-content check (allowlisted, monotonic-shrink): a selected file that
 *      constructs/imports/mocks a fake harness seam. Known debt is tracked in
 *      honest-harness-guard.allowlist.json; the allowlist only ever shrinks.
 *
 * Allowlist rules:
 *   dirty + allowlisted        → PASS  (known debt; AR2–AR6 convert it)
 *   dirty + NOT allowlisted    → FAIL  (new offender — real harness or demote to *.test.ts)
 *   clean + allowlisted        → FAIL  (debt paid — remove from allowlist)
 *   allowlisted path missing   → FAIL  (stale entry)
 *
 * @lore AR1: the guard is a standalone tsx check (not an eslint rule) because it
 *   reasons about whole-repo facts (does the dead .real-harness config exist?) and
 *   owns a stateful monotonic-shrink allowlist — neither fits ESLint's per-file AST
 *   model. It rides `npm run lint` (precedent: ag7-no-divergent-classes.ts) so CI's
 *   Lint step enforces it with no new CI job.
 */
export { isHarnessIntegrationPath } from "./lib/honest-harness-predicate.js";
export declare function isStubDirty(source: string): boolean;
export declare function hasAbsentSkipIf(source: string): boolean;
export interface GuardFile {
    /** Repo-relative POSIX path. */
    path: string;
    /** File source (empty string if missing). */
    source: string;
    /** Whether the file exists on disk. */
    exists: boolean;
}
export interface GuardResult {
    path: string;
    violation: string | null;
}
/**
 * Apply the lane/skipIf/stub-content rules to a set of pre-read files against the
 * allowlist. Returns one result per input file plus one per stale allowlist entry.
 */
export declare function checkGuardRules(files: GuardFile[], allowlist: string[]): GuardResult[];
//# sourceMappingURL=honest-harness-guard.d.ts.map