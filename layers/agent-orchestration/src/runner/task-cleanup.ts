import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { TaskView } from "@hyperidle/domain-model";
import { readAgentRunConfig } from "@hyperidle/run-orchestration";
import { createGitRunner } from "../git-runner.js";
import type { CoreDoor } from "./core-door.js";

const logger = createLogger({ pkg: "agent-orchestration.runner" });

/** Task states that mean no run will ever start for the task again. */
const TERMINAL_TASK_STATES = new Set(["done", "killed"]);

/**
 * Scan every task directory inside the agent's space and remove git worktrees
 * for any task core says is done or killed.
 *
 * Best-effort: each per-task failure is logged and skipped. Called at runner
 * start and after each inbox pass so stale worktrees are reclaimed promptly
 * without depending on any single code path closing the task.
 *
 * Uses `readAgentRunConfig` (never creates the space) so a fresh agent whose
 * space was never written is a no-op.
 */
export async function cleanupFinishedTaskWorktrees(
	db: HyperIdleDb,
	agentId: string,
	door: CoreDoor,
	key: string,
): Promise<void> {
	const config = await readAgentRunConfig(db, agentId);
	if (!config.spacePath) return;

	const tasksDir = path.join(config.spacePath, "tasks");
	if (!fs.existsSync(tasksDir)) return;

	let taskDirs: fs.Dirent[];
	try {
		taskDirs = fs.readdirSync(tasksDir, { withFileTypes: true }).filter((e) => e.isDirectory());
	} catch {
		return;
	}

	for (const taskDir of taskDirs) {
		const taskId = taskDir.name;
		try {
			const opened = await door.call<TaskView>(key, "open_task", { id: taskId });
			if (!opened.ok) continue;
			if (!TERMINAL_TASK_STATES.has(opened.data.task.state)) continue;

			await removeWorktreesInFolder(agentId, taskId, path.join(tasksDir, taskId));
		} catch (err) {
			logger.warn("cleanupFinishedTaskWorktrees: cleanup for task failed", {
				agentId,
				taskId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
}

/**
 * Remove every git worktree found directly inside `workingFolder`.
 * Non-force: if a worktree has uncommitted changes the removal is skipped (logged).
 */
async function removeWorktreesInFolder(
	agentId: string,
	taskId: string,
	workingFolder: string,
): Promise<void> {
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
			if (!stat.isFile()) continue;
			dotGitContent = fs.readFileSync(dotGit, "utf8").trim();
		} catch {
			continue;
		}

		const match = dotGitContent.match(/^gitdir:\s*(.+)$/);
		if (!match?.[1]) continue;
		const gitDir = path.resolve(subdir, match[1].trim());

		const sep = path.sep;
		if (!gitDir.includes(`${sep}worktrees${sep}`)) continue;

		const mainRepo = path.resolve(gitDir, "../../..");

		try {
			await createGitRunner(mainRepo).worktreeRemove(subdir);
		} catch (err) {
			logger.warn("cleanupFinishedTaskWorktrees: worktree remove failed", {
				agentId,
				taskId,
				subdir,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
}
