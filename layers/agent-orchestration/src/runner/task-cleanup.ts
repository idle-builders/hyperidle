import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { deriveWorkingFolder, ensureAgentSpace } from "@hyperidle/run-orchestration";
import { createGitRunner } from "../git-runner.js";

const logger = createLogger({ pkg: "agent-orchestration.runner" });

/**
 * Remove git worktrees that were mounted into an agent's working folder for a task.
 *
 * Best-effort: each removal failure is logged and skipped rather than aborting
 * the cleanup of the remaining worktrees. Called when a task moves to "done" so
 * the source repos don't accumulate stale worktree entries under their `.git/worktrees/`.
 */
export async function cleanupTaskWorktrees(
	db: HyperIdleDb,
	agentId: string,
	agentName: string,
	taskId: string,
): Promise<void> {
	let spacePath: string;
	try {
		spacePath = await ensureAgentSpace(db, agentId, agentName);
	} catch (err) {
		logger.warn("cleanupTaskWorktrees: could not resolve agent space", {
			agentId,
			error: err instanceof Error ? err.message : String(err),
		});
		return;
	}

	const workingFolder = deriveWorkingFolder(spacePath, { taskId });
	if (!fs.existsSync(workingFolder)) return;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(workingFolder, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const subdir = path.join(workingFolder, entry.name);
		const dotGit = path.join(subdir, ".git");

		let dotGitContent: string;
		try {
			const stat = fs.statSync(dotGit);
			// A `.git` directory is a plain repo, not a worktree — skip it.
			if (!stat.isFile()) continue;
			dotGitContent = fs.readFileSync(dotGit, "utf8").trim();
		} catch {
			continue;
		}

		const match = dotGitContent.match(/^gitdir:\s*(.+)$/);
		if (!match?.[1]) continue;
		const gitDir = path.resolve(subdir, match[1].trim());

		// A real worktree gitdir lives under <mainRepo>/.git/worktrees/<name>/.
		const sep = path.sep;
		if (!gitDir.includes(`${sep}worktrees${sep}`)) continue;

		// Three levels up from the worktree gitdir is the main repo root.
		const mainRepo = path.resolve(gitDir, "../../..");

		try {
			await createGitRunner(mainRepo).worktreeRemove(subdir, { force: true });
		} catch (err) {
			logger.warn("cleanupTaskWorktrees: worktree remove failed", {
				agentId,
				taskId,
				subdir,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
}
