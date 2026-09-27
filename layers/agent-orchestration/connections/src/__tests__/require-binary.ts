/**
 * A hard-fail gate for a plain CLI binary a test needs on PATH.
 *
 * @lore A local copy of `layers/agent-execution/harness-registry/src/__tests__/require-binary.ts`
 * (same hard-fail semantics and message shape) — a cross-layer dev import of
 * the original is not a legal edge (agent-orchestration may never import
 * agent-execution, even in the development world — governance reads the
 * import, not the intent). The binary-on-PATH check is the honest gate here:
 * the probes read configs and exec CLIs, never a model.
 */

import { execFileSync } from "node:child_process";

/** True iff the named executable resolves on PATH. */
export function isBinaryOnPath(binary: string): boolean {
	try {
		execFileSync("which", [binary], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Throw (never skip) if any named binary is absent from PATH.
 *
 * Call at module scope or the top of a `describe()` so a collection-phase throw means "this block
 * cannot run". The message names every missing binary and never echoes a secret.
 */
export function requireBinary(...binaries: string[]): void {
	const missing = binaries.filter((binary) => !isBinaryOnPath(binary));
	if (missing.length === 0) return;
	throw new Error(
		`requireBinary: ${missing.join(", ")} not installed — this integration test cannot complete. ` +
			"Install the CLI, or demote the test to a *.test.ts unit. (Never skipIf to green.)",
	);
}
