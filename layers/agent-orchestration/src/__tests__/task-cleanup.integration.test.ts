/**
 * cleanupTaskWorktrees removes git worktrees mounted inside a task's working folder.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { writeAgentRunConfig } from "@hyperidle/run-orchestration";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createGitRunner } from "../git-runner.js";
import { cleanupTaskWorktrees } from "../runner/task-cleanup.js";

async function seedAgent(db: HyperIdleDb, id: string, name: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name,
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

describe("cleanupTaskWorktrees", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-task-cleanup-"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("removes a git worktree mounted inside the task working folder", async ({ db }) => {
		const agentId = "agent-cleanup-1";
		const agentName = "Cleaner";
		const taskId = "task-wt-1";

		// Seed the agent and its run config with a known space path.
		await seedAgent(db, agentId, agentName);
		const spacePath = path.join(tmpDir, "space");
		fs.mkdirSync(spacePath, { recursive: true });
		await writeAgentRunConfig(db, agentId, { spacePath });

		// Create the working folder and mount a git worktree inside it.
		const workingFolder = path.join(spacePath, "tasks", taskId);
		fs.mkdirSync(workingFolder, { recursive: true });

		const repoPath = await makeSourceRepo(tmpDir);
		const mountAt = path.join(workingFolder, path.basename(repoPath));
		fs.mkdirSync(mountAt, { recursive: true });
		execSync(`git worktree add "${mountAt}" -b agent-task-wt-1`, { cwd: repoPath });

		// Confirm the worktree was added.
		const worktreeList = execSync("git worktree list", { cwd: repoPath, encoding: "utf8" });
		expect(worktreeList).toContain(mountAt);

		await cleanupTaskWorktrees(db, agentId, agentName, taskId);

		// The worktree should be removed from the source repo.
		const afterList = execSync("git worktree list", { cwd: repoPath, encoding: "utf8" });
		expect(afterList).not.toContain(mountAt);
	});

	test("does nothing when the task working folder does not exist", async ({ db }) => {
		const agentId = "agent-cleanup-2";
		const agentName = "Cleaner";
		const taskId = "task-wt-nonexistent";

		await seedAgent(db, agentId, agentName);
		const spacePath = path.join(tmpDir, "space2");
		fs.mkdirSync(spacePath, { recursive: true });
		await writeAgentRunConfig(db, agentId, { spacePath });

		// Should not throw even when there's no working folder.
		await expect(cleanupTaskWorktrees(db, agentId, agentName, taskId)).resolves.toBeUndefined();
	});
});
