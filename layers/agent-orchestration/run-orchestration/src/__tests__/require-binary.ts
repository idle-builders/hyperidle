/**
 * A hard-fail gate for a plain CLI binary a test needs on PATH.
 *
 * @lore Google Drive phase: per-package copy of
 * `layers/agent-orchestration/connections/src/__tests__/require-binary.ts`
 * (itself a copy of harness-registry's) — a cross-package dev import is not a
 * legal edge here either, so this package gets its own. A third copy of the
 * same ten lines; consolidating them is a later tidy, not this item's call.
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
