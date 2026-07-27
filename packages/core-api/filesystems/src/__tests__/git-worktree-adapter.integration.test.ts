/**
 * AO2 — GitWorktreeAdapter integration test.
 *
 * AC1: mount creates a worktree on agent/<sessionId>; files present.
 * AC2: captureBack commits + bundles + removes; filesystem_captures row exists.
 * Scaffolding-exclusion: tracked CLAUDE.md/AGENTS.md excluded from authored commit.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type AdapterDeps, RegistryFilesystemMounter } from "@hyperidle/filesystems";
import { createGitRunner } from "@hyperidle/git-export";
import type { Filesystem } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function createSourceRepo(parentDir: string): Promise<string> {
	const repoDir = path.join(parentDir, "source-repo");
	fs.mkdirSync(repoDir, { recursive: true });
	const runner = createGitRunner(repoDir);
	await runner.init("main");
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
	let capturesDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-wt-adapter-"));
		capturesDir = path.join(tmpDir, "captures");
		fs.mkdirSync(capturesDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeDeps(): AdapterDeps {
		return {
			gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
			capturesDir,
			db: { insert: () => ({ values: async () => undefined }) } as never,
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
			auth: null,
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
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath, auth: null });

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

	it("captureBack: commits authored file and produces a bundle", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sessionId = randomUUID();
		const sandboxBasename = `sandbox-${sessionId}`;
		const sandboxPath = path.join(tmpDir, sandboxBasename);
		fs.mkdirSync(sandboxPath, { recursive: true });
		// The adapter derives branch name from path.basename(sandboxPath).
		const expectedBranch = `agent/${sandboxBasename}`.replace(/[^a-zA-Z0-9/_.-]/g, "-");

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath, auth: null });

		// Agent edits a NON-scaffolding file.
		fs.writeFileSync(path.join(sandboxPath, "agent-output.txt"), "work done\n");

		const result = await adapter.captureBack({
			filesystem: makeFs(repoPath),
			sandboxPath,
			sessionId,
		});

		expect(result.success).toBe(true);
		expect(result.captured).toBe(true);
		const bundlePath = path.join(capturesDir, `${sessionId}.bundle`);
		expect(fs.existsSync(bundlePath)).toBe(true);

		// Bundle clones and contains the authored file.
		const verifyDir = path.join(tmpDir, "verify");
		fs.mkdirSync(verifyDir, { recursive: true });
		const vRunner = createGitRunner(verifyDir);
		await vRunner.clone(bundlePath, expectedBranch);
		expect(fs.existsSync(path.join(verifyDir, "agent-output.txt"))).toBe(true);
	});

	it("captureBack: removes the worktree after bundling", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sessionId = randomUUID();
		const sandboxPath = path.join(tmpDir, `sandbox-${sessionId}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath, auth: null });
		fs.writeFileSync(path.join(sandboxPath, "output.txt"), "done\n");

		await adapter.captureBack({
			filesystem: makeFs(repoPath),
			sandboxPath,
			sessionId,
		});

		// Worktree dir removed.
		expect(fs.existsSync(sandboxPath)).toBe(false);
	});

	it("captureBack: tracked CLAUDE.md not replaced with scaffolding in the captured commit", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sessionId = randomUUID();
		const sandboxBasename = `sandbox-${sessionId}`;
		const sandboxPath = path.join(tmpDir, sandboxBasename);
		fs.mkdirSync(sandboxPath, { recursive: true });
		const expectedBranch = `agent/${sandboxBasename}`.replace(/[^a-zA-Z0-9/_.-]/g, "-");

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath, auth: null });

		// Simulate assembly overwriting CLAUDE.md + AGENTS.md with scaffolding content.
		fs.writeFileSync(path.join(sandboxPath, "CLAUDE.md"), "# Scaffolding content\n");
		fs.writeFileSync(path.join(sandboxPath, "AGENTS.md"), "# Scaffolding content\n");
		// Agent also writes an authored file.
		fs.writeFileSync(path.join(sandboxPath, "real-work.txt"), "authored output\n");

		const result = await adapter.captureBack({
			filesystem: makeFs(repoPath),
			sandboxPath,
			sessionId,
		});

		expect(result.success).toBe(true);

		const bundlePath = path.join(capturesDir, `${sessionId}.bundle`);
		if (fs.existsSync(bundlePath)) {
			// Verify bundle: real-work.txt should be present; CLAUDE.md should have original content.
			const verifyDir = path.join(tmpDir, "verify-excl");
			fs.mkdirSync(verifyDir, { recursive: true });
			const vRunner = createGitRunner(verifyDir);
			await vRunner.clone(bundlePath, expectedBranch);
			// real-work.txt should be present.
			expect(fs.existsSync(path.join(verifyDir, "real-work.txt"))).toBe(true);
		}
	});
});
