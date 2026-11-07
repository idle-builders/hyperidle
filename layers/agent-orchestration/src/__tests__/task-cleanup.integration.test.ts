/**
 * cleanupFinishedTaskWorktrees scans the agent's space for task directories
 * and removes git worktrees for tasks core says are done or killed.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { writeAgentRunConfig } from "@hyperidle/run-orchestration";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createGitRunner } from "../git-runner.js";
import type { CoreDoor } from "../runner/core-door.js";
import { cleanupFinishedTaskWorktrees } from "../runner/task-cleanup.js";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: id,
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

async function makeSourceRepo(parent: string): Promise<string> {
	const repoDir = path.join(parent, "source-repo");
	fs.mkdirSync(repoDir, { recursive: true });
	execSync("git init -b main", { cwd: repoDir });
	execSync('git config user.email "test@test.com"', { cwd: repoDir });
	execSync('git config user.name "Test"', { cwd: repoDir });
	const runner = createGitRunner(repoDir);
	fs.writeFileSync(path.join(repoDir, "README.md"), "# Test\n");
	await runner.add([]);
	await runner.commit("initial", "test", "test@test.com");
	return repoDir;
}

/** A minimal fake door that returns a fixed task state for each task id. */
function makeFakeDoor(taskStates: Record<string, string>): CoreDoor {
	return {
		call: vi.fn(async (_key: string, action: string, args: unknown) => {
			if (action === "open_task") {
				const id = (args as { id?: string }).id ?? "";
				const state = taskStates[id];
				if (!state) return { ok: false as const, problems: [{ message: "not found" }] };
				return {
					ok: true as const,
					data: { task: { id, state }, ancestors: [] },
				};
			}
			return { ok: false as const, problems: [{ message: "unknown action" }] };
		}),
	} as unknown as CoreDoor;
}

describe("cleanupFinishedTaskWorktrees", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-task-cleanup-"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("removes worktrees for done and killed tasks; leaves in-progress alone", async ({
		db,
		runnerDb,
	}) => {
		const agentId = "agent-cleanup-scan";

		await seedAgent(db, agentId);
		const spacePath = path.join(tmpDir, "space");
		fs.mkdirSync(spacePath, { recursive: true });
		await writeAgentRunConfig(runnerDb, agentId, { spacePath });

		const repoPath = await makeSourceRepo(tmpDir);

		// Set up three task directories with worktrees.
		const tasks: Array<{ id: string; state: string; branch: string }> = [
			{ id: "task-done", state: "done", branch: "agent/task-done" },
			{ id: "task-killed", state: "killed", branch: "agent/task-killed" },
			{ id: "task-active", state: "in_progress", branch: "agent/task-active" },
		];

		const mountPaths: Record<string, string> = {};
		for (const task of tasks) {
			const workingFolder = path.join(spacePath, "tasks", task.id);
			fs.mkdirSync(workingFolder, { recursive: true });
			const mountAt = path.join(workingFolder, path.basename(repoPath));
			fs.mkdirSync(mountAt, { recursive: true });
			execSync(`git worktree add "${mountAt}" -b "${task.branch}"`, { cwd: repoPath });
			mountPaths[task.id] = mountAt;
		}

		const door = makeFakeDoor({
			"task-done": "done",
			"task-killed": "killed",
			"task-active": "in_progress",
		});

		await cleanupFinishedTaskWorktrees(runnerDb, agentId, door, "agent-key");

		// Worktrees for done + killed are removed from the source repo.
		const afterList = execSync("git worktree list", { cwd: repoPath, encoding: "utf8" });
		expect(afterList).not.toContain(mountPaths["task-done"]);
		expect(afterList).not.toContain(mountPaths["task-killed"]);
		// In-progress task worktree stays.
		expect(afterList).toContain(mountPaths["task-active"]);
	});

	test("does nothing when the agent has no space configured", async ({ db, runnerDb }) => {
		const agentId = "agent-cleanup-nospace";
		await seedAgent(db, agentId);
		// No writeAgentRunConfig — spacePath is null.

		const door = makeFakeDoor({});
		await expect(
			cleanupFinishedTaskWorktrees(runnerDb, agentId, door, "key"),
		).resolves.toBeUndefined();
	});

	test("does nothing when the tasks directory does not exist", async ({ db, runnerDb }) => {
		const agentId = "agent-cleanup-notasks";
		await seedAgent(db, agentId);
		const spacePath = path.join(tmpDir, "space-notasks");
		fs.mkdirSync(spacePath, { recursive: true });
		// No tasks/ directory created.
		await writeAgentRunConfig(runnerDb, agentId, { spacePath });

		const door = makeFakeDoor({});
		await expect(
			cleanupFinishedTaskWorktrees(runnerDb, agentId, door, "key"),
		).resolves.toBeUndefined();
	});
});
