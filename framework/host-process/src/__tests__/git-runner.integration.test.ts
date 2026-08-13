/**
 * AO2 — GitRunner new verbs: REAL on-disk round-trip.
 *
 * N1 (plan §6): This file exercises the REAL git runner (createGitRunner) against
 * real on-disk state. A Fake-only test cannot prove the real argv shape and git
 * semantics are correct — that is what this test provides.
 *
 * Tests: worktreeAdd / worktreeRemove / clone / bundle using real git processes
 * on a temp bare repo or a temp clone.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitRunner } from "../git/git-runner.js";

// Helper: create a minimal bare git repo with one commit for use as a remote.
async function createBareRepo(dir: string): Promise<string> {
	const bareDir = path.join(dir, "bare.git");
	fs.mkdirSync(bareDir, { recursive: true });
	const runner = createGitRunner(bareDir);
	await runner.init("main");
	// Create an initial commit so the repo is non-empty.
	const tmpFile = path.join(bareDir, "README.md");
	fs.writeFileSync(tmpFile, "# test\n");
	await runner.add([]);
	await runner.commit("initial", "test-bot", "bot@example.com");
	return bareDir;
}

// Helper: create a non-bare clone of a bare repo for worktree testing.
async function createWorkingClone(bareDir: string, parentDir: string): Promise<string> {
	const workDir = path.join(parentDir, "clone");
	fs.mkdirSync(workDir, { recursive: true });
	const runner = createGitRunner(workDir);
	await runner.clone(bareDir, "main");
	return workDir;
}

describe("GitRunner — real on-disk round-trip (filesystem inbound verbs)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-git-runner-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("clone: shallow-clones a local bare repo into the working dir", async () => {
		const bareDir = await createBareRepo(tmpDir);
		const cloneDir = path.join(tmpDir, "cloned");
		fs.mkdirSync(cloneDir, { recursive: true });

		const runner = createGitRunner(cloneDir);
		await runner.clone(bareDir, "main", { depth: 1 });

		expect(fs.existsSync(path.join(cloneDir, "README.md"))).toBe(true);
		const isGit = await runner.revParseIsInsideWorkTree();
		expect(isGit).toBe(true);
	});

	it("bundle: creates a valid git bundle file", async () => {
		const bareDir = await createBareRepo(tmpDir);
		const cloneDir = path.join(tmpDir, "cloned-for-bundle");
		fs.mkdirSync(cloneDir, { recursive: true });

		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const runner = createGitRunner(cloneDir, { logger });
		await runner.clone(bareDir, "main");

		const bundlePath = path.join(tmpDir, "captured.bundle");
		await runner.bundle(bundlePath, "refs/heads/main");
		expect(logger.debug).toHaveBeenLastCalledWith(
			"git spawn",
			expect.objectContaining({
				args: ["bundle", "create", bundlePath, "refs/heads/main"],
				timeoutMs: 120_000,
			}),
		);

		expect(fs.existsSync(bundlePath)).toBe(true);
		// A valid git bundle starts with "# v2 git bundle\n".
		const header = fs.readFileSync(bundlePath, "utf-8").slice(0, 20);
		expect(header).toMatch(/^# v\d git bundle/);
	});

	it("worktreeAdd / worktreeRemove: creates and removes a worktree", async () => {
		const bareDir = await createBareRepo(tmpDir);
		const mainClone = await createWorkingClone(bareDir, tmpDir);

		// worktreeAdd — creates a new branch 'agent/test-sess' from HEAD.
		const worktreePath = path.join(tmpDir, "worktree-out");
		const hostRunner = createGitRunner(mainClone);
		await hostRunner.worktreeAdd(worktreePath, "agent/test-sess", { createBranch: true });

		expect(fs.existsSync(worktreePath)).toBe(true);
		expect(fs.existsSync(path.join(worktreePath, "README.md"))).toBe(true);

		// The worktree is a proper git repo.
		const wtRunner = createGitRunner(worktreePath);
		expect(await wtRunner.revParseIsInsideWorkTree()).toBe(true);

		// worktreeRemove — cleans up the worktree.
		await hostRunner.worktreeRemove(worktreePath, { force: true });

		// After remove, the directory should be gone.
		expect(fs.existsSync(worktreePath)).toBe(false);
	});

	it("worktreeAdd + commit + bundle: full capture round-trip", async () => {
		const bareDir = await createBareRepo(tmpDir);
		const mainClone = await createWorkingClone(bareDir, tmpDir);

		const sessionId = "sess-roundtrip";
		const branch = `agent/${sessionId}`;
		const worktreePath = path.join(tmpDir, "wt-capture");

		// 1. Add worktree on a new branch.
		const hostRunner = createGitRunner(mainClone);
		await hostRunner.worktreeAdd(worktreePath, branch, { createBranch: true });

		// 2. Edit a file in the worktree.
		fs.writeFileSync(path.join(worktreePath, "agent-output.txt"), "authored change\n");

		// 3. Stage + commit via the worktree runner.
		const wtRunner = createGitRunner(worktreePath);
		await wtRunner.add([]);
		const sha = await wtRunner.commit("agent output", "agent-bot", "agent@example.com");
		expect(sha).toHaveLength(40);

		// 4. Bundle the session branch.
		const bundlePath = path.join(tmpDir, `${sessionId}.bundle`);
		await wtRunner.bundle(bundlePath, `refs/heads/${branch}`);
		expect(fs.existsSync(bundlePath)).toBe(true);

		// 5. Verify the bundle can be cloned and contains the commit.
		const verifyDir = path.join(tmpDir, "verify");
		fs.mkdirSync(verifyDir, { recursive: true });
		const verifyRunner = createGitRunner(verifyDir);
		await verifyRunner.clone(bundlePath, branch);
		expect(fs.existsSync(path.join(verifyDir, "agent-output.txt"))).toBe(true);
		const content = fs.readFileSync(path.join(verifyDir, "agent-output.txt"), "utf-8");
		expect(content).toBe("authored change\n");

		// 6. Worktree remove.
		await hostRunner.worktreeRemove(worktreePath, { force: true });
		expect(fs.existsSync(worktreePath)).toBe(false);
	});

	it("pins the filesystems consumer contract for staging, inspection, unstage, and reachability", async () => {
		const repoDir = path.join(tmpDir, "consumer-contract");
		fs.mkdirSync(repoDir);
		const runner = createGitRunner(repoDir);

		expect(await runner.revParseIsInsideWorkTree()).toBe(false);
		await runner.init("main");
		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "first\n");
		await runner.add(["tracked.txt"]);
		expect(await runner.diffCached()).toBe(false);
		const sha = await runner.commit("initial", "test-bot", "bot@example.com");
		expect(sha).toMatch(/^[0-9a-f]{40}$/);
		expect(await runner.diffCached()).toBe(true);
		expect(await runner.lsFiles()).toEqual(["tracked.txt"]);
		expect(await runner.currentBranch()).toBe("main");

		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "second\n");
		await runner.add([]);
		expect(await runner.diffCached()).toBe(false);
		await runner.restoreStaged(["tracked.txt"]);
		expect(await runner.diffCached()).toBe(true);
		expect(fs.readFileSync(path.join(repoDir, "tracked.txt"), "utf8")).toBe("second\n");

		const reachable = await runner.lsRemote(repoDir);
		expect(reachable).toEqual({ reachable: true });
		const unreachable = await runner.lsRemote(path.join(tmpDir, "missing.git"));
		expect(unreachable.reachable).toBe(false);
		expect(unreachable.reason).toBeTruthy();
	});

	it("rejects option-shaped paths before destructive git operations", async () => {
		const bareDir = await createBareRepo(tmpDir);
		const runner = createGitRunner(bareDir);

		await expect(runner.bundle("-output.bundle", "refs/heads/main")).rejects.toThrow(
			"must not start with '-'",
		);
		await expect(runner.worktreeAdd("-worktree", "agent/test")).rejects.toThrow(
			"must not start with '-'",
		);
		await expect(runner.worktreeRemove("-worktree")).rejects.toThrow("must not start with '-'");
		await expect(runner.restoreStaged(["-unsafe"])).rejects.toThrow("must not start with '-'");
	});
});

// ---------------------------------------------------------------------------
// AV1 W2 — createGitRunner().currentBranch() direct unit coverage
// ---------------------------------------------------------------------------

describe("GitRunner.currentBranch() — committed → branch string; no-commit → null", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "av1-current-branch-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("repo with commits: currentBranch() returns the branch name", async () => {
		// Init + commit → rev-parse --abbrev-ref HEAD returns the branch name
		const repoDir = path.join(tmpDir, "committed-repo");
		fs.mkdirSync(repoDir);
		const runner = createGitRunner(repoDir);
		await runner.init("main");
		fs.writeFileSync(path.join(repoDir, "README.md"), "hello\n");
		await runner.add([]);
		await runner.commit("initial commit", "test-bot", "bot@example.com");

		const branch = await runner.currentBranch();

		expect(branch).toBe("main");
	});

	it("repo with no commits: currentBranch() returns null (empty branch → degrade to doc_set)", async () => {
		// Init WITHOUT any commit → rev-parse exits non-zero → null
		const repoDir = path.join(tmpDir, "empty-repo");
		fs.mkdirSync(repoDir);
		const runner = createGitRunner(repoDir);
		await runner.init("main");
		// No commit — HEAD does not exist yet

		const branch = await runner.currentBranch();

		expect(branch).toBeNull();
	});
});
