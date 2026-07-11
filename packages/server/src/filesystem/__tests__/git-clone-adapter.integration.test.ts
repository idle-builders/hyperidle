/**
 * AO2 — GitCloneAdapter integration test.
 *
 * AC1: mount shallow-clones a bare repo; files present.
 * AC2: captureBack commits + named-ref bundle.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Filesystem } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitRunner } from "../../services/git-export-runner.js";
import { GitCloneAdapter } from "../git-clone-adapter.js";
import type { AdapterDeps } from "../mounter-registry.js";

// Create a local bare-style repo (works for local clone with git-cli).
async function createSourceRepo(parentDir: string): Promise<string> {
	const repoDir = path.join(parentDir, "source-repo");
	fs.mkdirSync(repoDir, { recursive: true });
	const runner = createGitRunner(repoDir);
	await runner.init("main");
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
	let capturesDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-clone-adapter-"));
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
			db: null as never,
		};
	}

	it("mount: clones the repo into sandboxPath", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sandboxPath = path.join(tmpDir, `sandbox-${randomUUID()}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new GitCloneAdapter(makeDeps());
		const result = await adapter.mount({
			filesystem: makeFs(repoPath),
			sandboxPath,
			auth: null,
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

		const adapter = new GitCloneAdapter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath, auth: null });

		// In a regular clone, .git is a directory.
		const excludeContent = fs.readFileSync(
			path.join(sandboxPath, ".git", "info", "exclude"),
			"utf-8",
		);
		expect(excludeContent).toContain("/.fabric");
		expect(excludeContent).toContain("/CLAUDE.md");
	});

	it("captureBack: commits authored changes and produces a named-ref bundle", async () => {
		const repoPath = await createSourceRepo(tmpDir);
		const sessionId = randomUUID();
		const sandboxPath = path.join(tmpDir, `sandbox-${sessionId}`);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const adapter = new GitCloneAdapter(makeDeps());
		await adapter.mount({ filesystem: makeFs(repoPath), sandboxPath, auth: null });

		// Agent authors a new file.
		fs.writeFileSync(path.join(sandboxPath, "agent-out.txt"), "clone capture test\n");

		const result = await adapter.captureBack({
			filesystem: makeFs(repoPath),
			sandboxPath,
			sessionId,
		});

		expect(result.success).toBe(true);
		expect(result.captured).toBe(true);
		expect(result.capturePath).toBeDefined();
		expect(fs.existsSync(result.capturePath!)).toBe(true);

		// Bundle should be cloneable and contain the authored file.
		const verifyDir = path.join(tmpDir, "verify");
		fs.mkdirSync(verifyDir, { recursive: true });
		const vRunner = createGitRunner(verifyDir);
		await vRunner.clone(result.capturePath!, "main");
		expect(fs.existsSync(path.join(verifyDir, "agent-out.txt"))).toBe(true);
	});
});
