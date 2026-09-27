/**
 * GitWorktreeAdapter mounts a code filesystem as a git worktree and excludes
 * scaffolding paths (CLAUDE.md/AGENTS.md) from the worktree's git info/exclude.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitRunner } from "../../../src/git-runner.js";
import { RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps, Filesystem } from "../mounter.js";

async function createSourceRepo(parentDir: string): Promise<string> {
	const repoDir = path.join(parentDir, "source-repo");
	fs.mkdirSync(repoDir, { recursive: true });
	execSync("git init -b main", { cwd: repoDir });
	execSync('git config user.email "test@test.com"', { cwd: repoDir });
	execSync('git config user.name "Test"', { cwd: repoDir });
	const runner = createGitRunner(repoDir);
	// Create files including AGENTS.md + CLAUDE.md (self-host case).
	fs.writeFileSync(path.join(repoDir, "README.md"), "# Source Repo\n");
	fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "# AGENTS\n");
	fs.writeFileSync(path.join(repoDir, "CLAUDE.md"), "# CLAUDE\n");
	fs.writeFileSync(path.join(repoDir, ".mcp.json"), '{"mcpServers":{}}\n');
	await runner.add([]);
	await runner.commit("initial", "test", "test@test.com");
	return repoDir;
}

function makeFs(repoPath: string): Filesystem {
	return {
		id: "fs-wt-test",
		teamId: "team-1",
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: { kind: "code", repo: repoPath, branch: "main" },
		writeback: "git",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
	};
}

describe("GitWorktreeAdapter integration", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-wt-adapter-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeDeps(): AdapterDeps {
		return {
			gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
		};
	}

	it("mount: creates a worktree with source files at sandboxPath", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs(repoPath),
			sandboxPath,
		});

		expect(result.success).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, "README.md"))).toBe(true);
		// Git worktree is a real git repo.
		const wtRunner = createGitRunner(sandboxPath);
		expect(await wtRunner.revParseIsInsideWorkTree()).toBe(true);
	});

	it("mount: writes git/info/exclude with scaffolding paths (resolves worktree gitdir)", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath });

		// In a worktree, .git is a file pointing to the real gitdir.
		// Resolve the real gitdir to find info/exclude.
		const dotGit = path.join(sandboxPath, ".git");
		const dotGitContent = fs.readFileSync(dotGit, "utf-8").trim();
		const match = dotGitContent.match(/^gitdir:\s*(.+)$/);
		const gitDir = match?.[1]?.trim() ? path.resolve(sandboxPath, match[1].trim()) : null;
		expect(gitDir).not.toBeNull();

		const excludeContent = fs.readFileSync(path.join(gitDir!, "info", "exclude"), "utf-8");
		// Key scaffolding paths should be excluded.
		expect(excludeContent).toContain("/.fabric");
		expect(excludeContent).toContain("/context");
		expect(excludeContent).toContain("/knowledge");
		expect(excludeContent).toContain("/.claude");
	});
});
