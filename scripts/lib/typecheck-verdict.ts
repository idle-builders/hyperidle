/**
 * AF1: Pure verdict function for the typecheck gate.
 *
 * This module is the testable core of scripts/typecheck-gate.ts.
 * It takes per-package tsc results and the debt list as pure inputs
 * and returns a verdict (pass/fail + offending units + messages).
 *
 * The gate script orchestrates discovery and tsc execution,
 * then calls computeVerdict() for the decision logic.
 *
 * @lore AF1: Extracted from typecheck-gate.ts to allow unit testing without
 * mocking execSync or spawning real tsc processes. The verdict function is
 * a pure function of PackageResult[] + Set<string> — all side effects live
 * in the gate script. This separation is the reason we can write fast,
 * deterministic unit tests for the gate's decision logic.
 */

// -- Types --

export interface DebtEntry {
  owner: string;
  errors: number;
  note: string;
}

export interface DebtFile {
  description: string;
  packages: Record<string, DebtEntry>;
}

export interface PackageResult {
  name: string;
  /** Number of own-package type errors (after filtering reference noise). */
  ownErrors: number;
  /** Whether this package is on the exception (debt) list. */
  excepted: boolean;
  /**
   * True when tsc exited non-zero but produced zero parseable error lines.
   *
   * @lore AF1 crash-guard: This guards against tsc crashing (OOM, invalid
   * tsconfig, internal compiler error) producing a false-green result.
   * We check rawParsedErrors > 0 rather than ownErrors > 0 to avoid
   * false-triggering when all errors are filtered as reference noise
   * (TS6305/TS6307/TS6059). A package whose only output is reference noise
   * has rawParsedErrors > 0 but ownErrors == 0 — NOT a crash.
   * Only when rawParsedErrors == 0 AND exitCode != 0 is it a crash.
   */
  crashed: boolean;
  /** First N error lines for human-readable failure context. */
  errorLines: string[];
  /** Full tsc output — surfaced when crashed === true for diagnosis. */
  rawOutput: string;
}

export type VerdictOutcome = "PASS" | "FAIL";

export interface VerdictResult {
  outcome: VerdictOutcome;
  crashedPackages: PackageResult[];
  failedNonExcepted: PackageResult[];
  staleExcepted: PackageResult[];
  messages: string[];
}

/**
 * Compute the gate verdict from per-package tsc results.
 *
 * Decision rules (priority order):
 * 1. Crashed package (tsc exited non-zero with zero parseable lines) → FAIL always.
 * 2. Non-excepted package with own errors → FAIL.
 * 3. Excepted package with zero own errors (stale entry) → FAIL.
 * 4. Otherwise → PASS.
 *
 * @param results  Per-package tsc results (after error parsing and filtering).
 * @param excepted Set of package names on the debt exception list.
 */
export function computeVerdict(
  results: PackageResult[],
  excepted: Set<string>,
): VerdictResult {
  throw new Error("not implemented");
}
