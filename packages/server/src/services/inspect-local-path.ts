/**
 * AV1 — inspectLocalPath: probe a local path for git repo + branch status.
 *
 * Reuses createGitRunner (the existing audited git-spawn path with redaction,
 * timeouts, env allowlist). Never throws — returns safe defaults on any error.
 *
 * @lore AV1: Onboarding branch detection reuses createGitRunner. currentBranch()
 * was the one missing verb — added to GitRunner, not a new git-spawn path.
 * Returns null branch for detached HEAD / empty repo so callers register doc_set
 * instead of 400'ing on codeRefSchema.branch.min(1).
 */

import { stat } from "node:fs/promises";
import { createGitRunner, type GitRunner } from "../app-runtime/services/git-export-runner.js";

export interface LocalPathInfo {
	readonly exists: boolean;
	readonly isGitRepo: boolean;
	readonly branch: string | null;
}

export interface InspectLocalPathDeps {
	/** Injectable for tests — defaults to createGitRunner(path) in production. */
	gitRunnerFactory?: (path: string) => GitRunner;
}

/**
 * Probe `path` for existence, git status, and current branch.
 * Never throws.
 */
export async function inspectLocalPath(
	path: string,
	deps?: InspectLocalPathDeps,
): Promise<LocalPathInfo> {
	const SAFE_DEFAULT: LocalPathInfo = { exists: false, isGitRepo: false, branch: null };

	try {
		// Check existence via stat
		await stat(path);
	} catch {
		return SAFE_DEFAULT;
	}

	try {
		const factory = deps?.gitRunnerFactory ?? createGitRunner;
		const runner = factory(path);

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
