/**
 * InspectLocalPath: probe a local path for git repo + branch status.
 *
 * Reuses the injected `FilesystemsGitRunner` (the existing audited git-spawn path
 * with redaction, timeouts, env allowlist). Never throws — returns safe defaults
 * on any error.
 *
 * @lore AV1: Onboarding branch detection reuses createGitRunner. currentBranch()
 * was the one missing verb — added to GitRunner, not a new git-spawn path.
 * Returns null branch for detached HEAD / empty repo so callers register doc_set
 * instead of 400'ing on codeRefSchema.branch.min(1).
 *
 * @lore AU19 Increment 2b: `gitRunnerFactory` is now a REQUIRED injected param
 * (this Service's own `FilesystemsGitRunnerFactory` port, `ports.ts`) instead
 * of an internal `createGitRunner` default (it lives in `@hyperidle/host-process`)
 * (forward-reference, closed when it does; see `ports.ts`'s top `@lore`).
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
		// Check existence via stat
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
