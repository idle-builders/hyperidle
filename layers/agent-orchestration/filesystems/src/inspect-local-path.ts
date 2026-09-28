/**
 * InspectLocalPath: probe a local path for git repo + branch status.
 *
 * Reuses the injected `FilesystemsGitRunner` (the existing audited git-spawn path
 * with redaction, timeouts, env allowlist). Never throws — returns safe defaults
 * on any error.
 *
 * @lore: inspect-local-path — currentBranch() returns null for detached HEAD / empty repo; callers register doc_set instead of 400-ing on branch.min(1)
 * @lore: inspect-local-path gitRunner — gitRunnerFactory is a required injected port; never an internal createGitRunner default
 */

import { stat } from "node:fs/promises";
import type { FilesystemsGitRunnerFactory } from "./ports.js";

export interface LocalPathInfo {
	readonly exists: boolean;
	readonly isGitRepo: boolean;
	readonly branch: string | null;
}

/** @internal Use structural type `{ gitRunnerFactory: FilesystemsGitRunnerFactory }` at call sites. */
interface InspectLocalPathDeps {
	readonly gitRunnerFactory: FilesystemsGitRunnerFactory;
}

/**
 * Probe `path` for existence, git status, and current branch.
 * Never throws.
 */
export async function inspectLocalPath(
	path: string,
	deps: InspectLocalPathDeps,
): Promise<LocalPathInfo> {
	const SAFE_DEFAULT: LocalPathInfo = { exists: false, isGitRepo: false, branch: null };

	try {
		await stat(path);
	} catch {
		return SAFE_DEFAULT;
	}

	try {
		const runner = deps.gitRunnerFactory(path);

		const isGitRepo = await runner.revParseIsInsideWorkTree();
		if (!isGitRepo) {
			return { exists: true, isGitRepo: false, branch: null };
		}

		const branch = await runner.currentBranch();
		return { exists: true, isGitRepo: true, branch };
	} catch {
		// Git probe failed — report exists but not a resolvable git repo
		return { exists: true, isGitRepo: false, branch: null };
	}
}
