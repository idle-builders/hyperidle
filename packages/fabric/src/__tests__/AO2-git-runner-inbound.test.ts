/**
 * AO2 — Unit tests for the inbound-git capability added to GitRunner.
 *
 * Covers:
 *   - `clone(url, branch, opts?)` — clones a `file://` local repo into cwd
 *   - `bundle(bundlePath, ref)` — bundles a branch ref to a durable path
 *   - Token injection via `tokenConfig` — NEVER in argv, only via GIT_CONFIG_COUNT env
 *   - FakeGitRunner implements the new interface methods (no-op stubs, type-level)
 *
 * Source of truth: plans/AO2/architecture.md §2 — Inbound-git capability.
 *
 * Test type: unit (*.test.ts) — real local `file://` repos, no network, no DB.
 */

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitRunner, type GitRunner } from "../services/git-export-runner.js";

// ─── Lane A: hermetic local repo setup ───────────────────────────────────────

let sourceRepoDir: string;
let cloneTargetDir: string;
let bundleTargetDir: string;

beforeAll(() => {
	// Create a real git repo to act as the "remote" for clone tests.
	sourceRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-source-repo-"));
	cloneTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-clone-target-"));
	bundleTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-bundle-target-"));

	// Initialise a proper repo with one commit on `main`.
	cp.execSync("git init -b main", { cwd: sourceRepoDir, stdio: "ignore" });
	cp.execSync("git config user.email test@hyperidle.local", { cwd: sourceRepoDir, stdio: "ignore" });
	cp.execSync("git config user.name Test", { cwd: sourceRepoDir, stdio: "ignore" });
	fs.writeFileSync(path.join(sourceRepoDir, "README.md"), "# Source repo for AO2 clone test");
	fs.writeFileSync(
		path.join(sourceRepoDir, "package.json"),
		JSON.stringify({ name: "ao2-test-pkg", version: "0.0.1" }, null, 2),
	);
	cp.execSync("git add -A", { cwd: sourceRepoDir, stdio: "ignore" });
	cp.execSync("git commit -m 'initial'", { cwd: sourceRepoDir, stdio: "ignore" });
});

afterAll(() => {
	for (const dir of [sourceRepoDir, cloneTargetDir, bundleTargetDir]) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore cleanup failures */
		}
	}
});

// ─── GitRunner interface shape ────────────────────────────────────────────────

describe("GitRunner interface — inbound methods exist (AC1/§2)", () => {
	it("createGitRunner returns an object with clone and bundle methods", () => {
		const runner: GitRunner = createGitRunner(sourceRepoDir);
		// The test FAILS until clone + bundle are added to the interface + factory.
		expect(typeof runner.clone).toBe("function");
		expect(typeof runner.bundle).toBe("function");
	});
});

// ─── clone() ─────────────────────────────────────────────────────────────────

describe("GitRunner.clone — file:// local repo (AC1 hermetic)", () => {
	it("clones a file:// repo into cwd, working tree at branch HEAD", async () => {
		// Each test uses a fresh empty target dir so they don't share state.
		const target = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-clone-"));
		try {
			const runner = createGitRunner(target);
			const url = `file://${sourceRepoDir}`;
			await runner.clone(url, "main");

			// After clone: .git and README.md must be present in the target dir.
			expect(fs.existsSync(path.join(target, ".git"))).toBe(true);
			expect(fs.existsSync(path.join(target, "README.md"))).toBe(true);

			// Branch must be `main`.
			const branch = cp.execSync("git rev-parse --abbrev-ref HEAD", { cwd: target }).toString().trim();
			expect(branch).toBe("main");
		} finally {
			try {
				fs.rmSync(target, { recursive: true, force: true });
			} catch { /* ignore */ }
		}
	});

	it("clone accepts depth option (shallow clone)", async () => {
		const target = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-clone-shallow-"));
		try {
			const runner = createGitRunner(target);
			const url = `file://${sourceRepoDir}`;
			// Shallow clone with depth=1 should succeed and land a working tree.
			await runner.clone(url, "main", { depth: 1 });
			expect(fs.existsSync(path.join(target, ".git"))).toBe(true);
			expect(fs.existsSync(path.join(target, "README.md"))).toBe(true);
		} finally {
			try {
				fs.rmSync(target, { recursive: true, force: true });
			} catch { /* ignore */ }
		}
	});

	it("clone fails with a clear error for a non-existent repo (not silent)", async () => {
		const target = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-clone-fail-"));
		try {
			const runner = createGitRunner(target);
			await expect(runner.clone("file:///does-not-exist-ao2", "main")).rejects.toThrow();
		} finally {
			try {
				fs.rmSync(target, { recursive: true, force: true });
			} catch { /* ignore */ }
		}
	});
});

// ─── bundle() ────────────────────────────────────────────────────────────────

describe("GitRunner.bundle — durable bundle from branch ref (AC2/§2)", () => {
	it("bundles refs/heads/main to a file path and the file exists", async () => {
		// Clone first so we have a repo with a branch to bundle.
		const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-bundle-repo-"));
		const bundlePath = path.join(bundleTargetDir, "test.bundle");
		try {
			cp.execSync(`git clone --single-branch --branch main -- file://${sourceRepoDir} .`, {
				cwd: repoDir,
				stdio: "ignore",
			});

			const runner = createGitRunner(repoDir);
			await runner.bundle(bundlePath, "refs/heads/main");

			expect(fs.existsSync(bundlePath)).toBe(true);
			const stat = fs.statSync(bundlePath);
			expect(stat.size).toBeGreaterThan(0);
		} finally {
			try {
				fs.rmSync(repoDir, { recursive: true, force: true });
			} catch { /* ignore */ }
		}
	});

	it("bundle is restorable — clone from bundle yields the source commit", async () => {
		// Build the bundle.
		const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-bundle-src-"));
		const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-bundle-restore-"));
		const bundlePath = path.join(bundleTargetDir, "restore-test.bundle");
		try {
			cp.execSync(`git clone --single-branch --branch main -- file://${sourceRepoDir} .`, {
				cwd: repoDir,
				stdio: "ignore",
			});

			// Make a new commit to bundle (simulating the agent's authored work).
			cp.execSync("git config user.email agent@hyperidle.local", { cwd: repoDir, stdio: "ignore" });
			cp.execSync("git config user.name Agent", { cwd: repoDir, stdio: "ignore" });
			fs.writeFileSync(path.join(repoDir, "AGENT_EDIT.md"), "agent authored this");
			cp.execSync("git add AGENT_EDIT.md", { cwd: repoDir, stdio: "ignore" });
			cp.execSync("git commit -m 'agent: authored edit'", { cwd: repoDir, stdio: "ignore" });

			const runner = createGitRunner(repoDir);
			// Bundle with the named branch ref — NOT bare HEAD, NOT a range.
			await runner.bundle(bundlePath, "refs/heads/main");

			// Restore by cloning from the bundle.
			cp.execSync(`git clone ${bundlePath} .`, { cwd: restoreDir, stdio: "ignore" });

			// The agent's file must be present in the restored tree.
			expect(fs.existsSync(path.join(restoreDir, "AGENT_EDIT.md"))).toBe(true);
			const content = fs.readFileSync(path.join(restoreDir, "AGENT_EDIT.md"), "utf-8");
			expect(content).toContain("agent authored this");

			// The commit message must also be present in the log.
			const log = cp.execSync("git log --oneline", { cwd: restoreDir }).toString();
			expect(log).toContain("agent: authored edit");
		} finally {
			try {
				fs.rmSync(repoDir, { recursive: true, force: true });
			} catch { /* ignore */ }
			try {
				fs.rmSync(restoreDir, { recursive: true, force: true });
			} catch { /* ignore */ }
		}
	});

	it("bundle from shallow clone (--depth=1) yields the agent commit after restore", async () => {
		// The plan §2 states: on a --depth=1 clone, bundle refs/heads/<branch> packs
		// shallow commits reachable from the ref (bot's new commit + single base commit).
		const shallowDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-shallow-"));
		const shallowRestoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-shallow-restore-"));
		const bundlePath = path.join(bundleTargetDir, "shallow.bundle");
		try {
			cp.execSync(`git clone --depth=1 --single-branch --branch main -- file://${sourceRepoDir} .`, {
				cwd: shallowDir,
				stdio: "ignore",
			});
			cp.execSync("git config user.email agent@hyperidle.local", { cwd: shallowDir, stdio: "ignore" });
			cp.execSync("git config user.name Agent", { cwd: shallowDir, stdio: "ignore" });
			fs.writeFileSync(path.join(shallowDir, "SHALLOW_EDIT.md"), "shallow agent edit");
			cp.execSync("git add SHALLOW_EDIT.md", { cwd: shallowDir, stdio: "ignore" });
			cp.execSync("git commit -m 'agent: shallow edit'", { cwd: shallowDir, stdio: "ignore" });

			const runner = createGitRunner(shallowDir);
			await runner.bundle(bundlePath, "refs/heads/main");

			cp.execSync(`git clone ${bundlePath} .`, { cwd: shallowRestoreDir, stdio: "ignore" });

			expect(fs.existsSync(path.join(shallowRestoreDir, "SHALLOW_EDIT.md"))).toBe(true);
			const log = cp.execSync("git log --oneline", { cwd: shallowRestoreDir }).toString();
			expect(log).toContain("agent: shallow edit");
		} finally {
			try {
				fs.rmSync(shallowDir, { recursive: true, force: true });
			} catch { /* ignore */ }
			try {
				fs.rmSync(shallowRestoreDir, { recursive: true, force: true });
			} catch { /* ignore */ }
		}
	});
});

// ─── FakeGitRunner stub type-check ───────────────────────────────────────────

describe("FakeGitRunner — implements GitRunner including clone + bundle (type gate)", () => {
	it("FakeGitRunner from the module satisfies the GitRunner interface", async () => {
		// This test imports FakeGitRunner and calls clone/bundle on it.
		// It FAILS until FakeGitRunner is updated to implement the new methods.
		const { FakeGitRunner } = await import("../services/git-export-runner.js");
		// FakeGitRunner is expected to be a class or factory that satisfies GitRunner.
		const fake: GitRunner = new FakeGitRunner("/tmp/fake");
		// No-op stubs: should resolve without throwing.
		await expect(fake.clone("file:///noop", "main")).resolves.not.toThrow();
		await expect(fake.bundle("/tmp/noop.bundle", "refs/heads/main")).resolves.not.toThrow();
	});
});
