/**
 * GitWorktreeAdapter reuse — the same working folder and branch are reused
 * across multiple runs of the same task/conversation without errors.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitRunner } from "../../../src/git-runner.js";
import { RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps, Filesystem } from "../mounter.js";

function makeLocalCodeFs(repoPath: string, branch = "main"): Filesystem {
	return {
		id: "fs-wt-reuse",
		teamId: "team-1",
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: { kind: "code", repo: repoPath, branch },
		writeback: "git",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
	};
}

function createSourceRepo(parentDir: string): string {
	const repoDir = path.join(parentDir, "source-repo");
	fs.mkdirSync(repoDir, { recursive: true });
	execSync("git init -b main", { cwd: repoDir });
	execSync('git config user.email "t@t.com"', { cwd: repoDir });
	execSync('git config user.name "T"', { cwd: repoDir });
	fs.writeFileSync(path.join(repoDir, "README.md"), "# Source\n");
	execSync("git add -A && git commit -m init", { cwd: repoDir });
	return repoDir;
}

describe("GitWorktreeAdapter reuse", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-wt-reuse-"));
		process.env.HYPERIDLE_SPACES_DIR = tmpDir;
	});

	afterEach(() => {
		delete process.env.HYPERIDLE_SPACES_DIR;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeDeps(): AdapterDeps {
		return { gitRunnerFactory: (p: string) => createGitRunner(p) };
	}

	it("reuses an existing worktree on the second mount (same path, same branch)", async () => {
		const sourceRepo = createSourceRepo(tmpDir);
		const sandboxPath = path.join(tmpDir, "sandbox");
		fs.mkdirSync(sandboxPath, { recursive: true });
		const workBranch = "agent/task-abc";

		const mounter = new RegistryFilesystemMounter(makeDeps());
		const fs1 = makeLocalCodeFs(sourceRepo);

		// First mount
		const result1 = await mounter.mount({ filesystem: fs1, sandboxPath, workBranch });
		expect(result1.success).toBe(true);

		const mountAt = path.join(sandboxPath, "source-repo");
		expect(fs.existsSync(mountAt)).toBe(true);

		// Write a sentinel file inside the worktree
		const sentinelPath = path.join(mountAt, "run1.txt");
		fs.writeFileSync(sentinelPath, "from-run-1");

		// Second mount — should reuse, not error
		const result2 = await mounter.mount({ filesystem: fs1, sandboxPath, workBranch });
		expect(result2.success).toBe(true);

		// Sentinel from run 1 must still be present (no re-creation of worktree)
		expect(fs.readFileSync(sentinelPath, "utf8")).toBe("from-run-1");

		// The worktree is on the same branch
		const branchOut = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: mountAt,
			encoding: "utf8",
		});
		expect(branchOut.trim()).toBe(workBranch);
	});

	it("reuses after worktree is re-added when branch exists but worktree was removed", async () => {
		const sourceRepo = createSourceRepo(tmpDir);
		const sandboxPath = path.join(tmpDir, "sandbox2");
		fs.mkdirSync(sandboxPath, { recursive: true });
		const workBranch = "agent/task-relink";

		const mounter = new RegistryFilesystemMounter(makeDeps());
		const fs1 = makeLocalCodeFs(sourceRepo);

		// First mount — creates branch and worktree
		const result1 = await mounter.mount({ filesystem: fs1, sandboxPath, workBranch });
		expect(result1.success).toBe(true);

		const mountAt = path.join(sandboxPath, "source-repo");

		// Simulate cleanup: remove the worktree (branch stays in repo)
		execSync(`git -C "${sourceRepo}" worktree remove "${mountAt}"`);
		fs.rmSync(mountAt, { recursive: true, force: true });

		// Second mount — branch exists, worktree was removed
		const result2 = await mounter.mount({ filesystem: fs1, sandboxPath, workBranch });
		expect(result2.success).toBe(true);
		expect(fs.existsSync(mountAt)).toBe(true);

		const branchOut = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: mountAt,
			encoding: "utf8",
		});
		expect(branchOut.trim()).toBe(workBranch);
	});
});
