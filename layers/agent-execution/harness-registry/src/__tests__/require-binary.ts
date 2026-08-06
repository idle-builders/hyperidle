/**
 * A hard-fail gate for a plain CLI binary a test needs on PATH.
 *
 * Same shape as `requireHarness`, and deliberately a different function: a harness is the thing
 * that RUNS A MODEL (`builtin`, `claude`, `codex`, `opencode`, `cursor-agent`) and nothing else.
 * `gh` is the GitHub CLI — a test that shells out to it needs the binary present, but calling that
 * requirement "a harness" put a credential probe inside the vocabulary of model execution.
 *
 * @lore AU28 Ruling 15: `gh` used to sit in `HarnessName`, in the binary map, in a type carve-out,
 * and behind `requireHarness("gh")` in two integration tests. All of that said `gh` is a harness. It
 * is not, and the one production use — `gh auth status --json hosts` — makes no model call at all.
 * The gate itself was never the problem, so it moved here rather than being deleted: the test still
 * cannot complete without the binary, and the run still hard-fails instead of skipping to green.
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
