/**
 * AO3 — loadCaptureCodeDiff: filesystem_captures row → CodeDiffPayload.
 *
 * Resolves the AO2-captured git bundle into a CodeDiffPayload for the `code_diff`
 * proof-pane of the `land_change` Proposed Call review.
 *
 * Algorithm:
 *   1. Reject non-git captures (writeback ≠ 'git' or no commitSha).
 *   2. Clone the bundle into an OS temp dir.
 *   3. Run `git show <commitSha>` to get the raw unified diff.
 *   4. Parse the diff into a CodeDiffPayload.
 *   5. Clean up the temp dir.
 *
 * @lore AO3: The bundle's single ref name is intentionally NOT used here — the
 * loader only needs the commitSha (stored on the capture row) to run `git show`.
 * The bundleListHeads verb is used by the HANDLER (to resolve the push ref), not here.
 *
 * @lore AO3: Each GET /api/reviews/:id for a land_change PC clones the bundle on demand.
 * Human-triggered, infrequent → no cache in v1. A cached payload column is a future
 * optimization that would then need a migration — explicitly deferred.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FilesystemCaptureRow } from "@hyperidle/db";
import type { GitRunner } from "@hyperidle/fabric";
import { type CodeDiffPayload, parseUnifiedDiff } from "./parse-unified-diff.js";

export type { CodeDiffPayload };

/**
 * Load a `CodeDiffPayload` from a `filesystem_captures` row by cloning its bundle
 * and parsing the commit's diff.
 *
 * @param capture  The capture row. Must have `writeback='git'` and a non-null `commitSha`.
 * @param runnerFactory  Factory used to create a GitRunner bound to the temp dir.
 *                       Injected so the integration test can pass the real `createGitRunner`.
 * @returns  The `CodeDiffPayload`, or `null` if the capture is not a git capture.
 */
export async function loadCaptureCodeDiff(
	capture: FilesystemCaptureRow,
	runnerFactory: (dir: string) => GitRunner,
): Promise<CodeDiffPayload | null> {
	// Only git captures carry a bundle + commitSha.
	if (capture.writeback !== "git" || !capture.commitSha || capture.capturePath === "none") {
		return null;
	}

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao3-diff-"));
	try {
		const runner = runnerFactory(tmpDir);
		await runner.cloneBundle(capture.capturePath);
		const patch = await runner.show(capture.commitSha);
		const payload = parseUnifiedDiff(patch, `Captured commit ${capture.commitSha.slice(0, 8)}`);
		return payload;
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}
