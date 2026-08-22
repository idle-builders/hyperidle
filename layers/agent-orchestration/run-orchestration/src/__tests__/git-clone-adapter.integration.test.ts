/**
 * AO2 — GitCloneAdapter integration test.
 *
 * AC1: mount shallow-clones a bare repo; files present.
 * AC2: captureBack is a declared no-op (AU43 stage 2 — write code removed).
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { createGitRunner } from "../../../src/git-runner.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps, Filesystem } from "../mounter.js";

// Create a local bare-style repo (works for local clone with git-cli).
async function createSourceRepo(parentDir: string): Promise<string> {
	const repoDir = path.join(parentDir, "source-repo");
	fs.mkdirSync(repoDir, { recursive: true });
	execSync("git init -b main", { cwd: repoDir });
	execSync('git config user.email "test@test.com"', { cwd: repoDir });
	execSync('git config user.name "Test"', { cwd: repoDir });
	const runner = createGitRunner(repoDir);
	fs.writeFileSync(path.join(repoDir, "README.md"), "# Source\n");
	await runner.add([]);
	await runner.commit("initial", "test", "test@test.com");
	return repoDir;
}

function makeFs(repoUrl: string, branch = "main"): Filesystem {
	return {
		id: "fs-clone-test",
		teamId: "team-1",
		source: "github",
		kind: "code",
		connectionId: "conn-123",
		resourceRef: { kind: "code", repo: repoUrl, branch },
		writeback: "git",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
	};
}

describe("GitCloneAdapter integration", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-clone-adapter-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeDeps(): AdapterDeps {
		return {
			gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
		};
	}

	it("mount: clones the repo into sandboxPath", async () => {
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
		const runner = createGitRunner(sandboxPath);
		expect(await runner.revParseIsInsideWorkTree()).toBe(true);
	});

	it("mount: writes .git/info/exclude with scaffolding paths", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath });

		// In a regular clone, .git is a directory.
		const excludeContent = fs.readFileSync(
			path.join(sandboxPath, ".git", "info", "exclude"),
			"utf-8",
		);
		expect(excludeContent).toContain("/.fabric");
		expect(excludeContent).toContain("/CLAUDE.md");
	});

	it("captureBack: returns success no-op (write code removed in AU43 stage 2)", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sessionId = randomUUID();
		const sandboxPath = path.join(tmpDir, `sandbox-${sessionId}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new RegistryFilesystemMounter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath });

		const result = await adapter.captureBack({
			filesystem: makeFs(repoPath),
			sandboxPath,
			sessionId,
		});

		expect(result.success).toBe(true);
		expect(result.captured).toBe(false);
	});
});
