/**
 * AO1 — Unit tests for filesystem probe internals.
 *
 * These tests cover the internal probe functions (`probeLocalPath`,
 * `probeGitRemote`, `repoToUrl`) which are NOT re-exported from the
 * `@hyperidle/filesystems` barrel (AU20 Ag2 barrel collapse). They live
 * inside the `filesystems` package so they can import directly from the
 * module files.
 *
 * Lane A: hermetic, real git + real fs, NO network/secret.
 *   - Real temp git repo → file:// ls-remote → reachable (exit 0)
 *   - Non-existent file:// path → needs_attention (exit non-zero)
 *   - Real existing folder → reachable (fs.access R_OK)
 *   - Non-existent folder → needs_attention (ENOENT)
 *
 * @lore AU20 Ag2: moved from `packages/core-api/src/__tests__/AO1-filesystem-reachability.test.ts`
 * as part of the barrel collapse. The external test retains only the
 * `resolveFilesystemState` / `NoopAuthResolver` suites (which use barrel exports).
 */

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createGitRunner } from "@hyperidle/git-export";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeGitRemote, probeLocalPath, repoToUrl } from "../filesystem-reachability.js";

// ─── Lane A: Hermetic temp-repo setup ────────────────────────────────────────

let tempRepoDir: string;
let missingPath: string;
let existingDir: string;

beforeAll(() => {
	// Create a real git repo in a temp dir — used for file:// ls-remote probes.
	tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao1-probe-git-"));
	existingDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao1-probe-fs-"));
	missingPath = path.join(os.tmpdir(), `ao1-probe-does-not-exist-${Date.now()}`);

	// git init + at least one commit so ls-remote exits 0.
	cp.execSync("git init -b main", { cwd: tempRepoDir, stdio: "ignore" });
	cp.execSync("git config user.email test@hyperidle.local", { cwd: tempRepoDir, stdio: "ignore" });
	cp.execSync("git config user.name Test", { cwd: tempRepoDir, stdio: "ignore" });
	fs.writeFileSync(path.join(tempRepoDir, "README.md"), "probe");
	cp.execSync("git add README.md", { cwd: tempRepoDir, stdio: "ignore" });
	cp.execSync("git commit -m 'probe'", { cwd: tempRepoDir, stdio: "ignore" });
});

afterAll(() => {
	try {
		fs.rmSync(tempRepoDir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
	try {
		fs.rmSync(existingDir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
});

// ─── probeLocalPath (real fs.access) ─────────────────────────────────────────

describe("probeLocalPath — real fs.access probe (Lane A, hermetic)", () => {
	it("existing dir → { state: 'reachable' }", async () => {
		const result = await probeLocalPath(existingDir);
		expect(result.state).toBe("reachable");
		expect(result.reason).toBeUndefined();
	});

	it("missing path → { state: 'needs_attention', reason includes 'ENOENT' }", async () => {
		const result = await probeLocalPath(missingPath);
		expect(result.state).toBe("needs_attention");
		expect(result.reason).toBeDefined();
		expect(result.reason).toMatch(/ENOENT|enoent|no such/i);
	});

	it("existing file → { state: 'reachable' }", async () => {
		const testFile = path.join(existingDir, "probe.txt");
		fs.writeFileSync(testFile, "probe");
		const result = await probeLocalPath(testFile);
		expect(result.state).toBe("reachable");
	});
});

// ─── probeGitRemote (real git ls-remote, file://, no network) ────────────────

describe("probeGitRemote — real git ls-remote probe (Lane A, hermetic, no network)", () => {
	it("real file:// git repo → { reachable: true }", async () => {
		// LIVE PROOF: real `git ls-remote file://<tempRepoDir>` → exit 0 → reachable
		const url = `file://${tempRepoDir}`;
		const result = await probeGitRemote(url, undefined, createGitRunner);
		expect(result.state).toBe("reachable");
		expect(result.reason).toBeUndefined();
	});

	it("non-existent file:// path → { reachable: false }", async () => {
		// LIVE PROOF: real `git ls-remote file:///path/does/not/exist` → exit non-zero → needs_attention
		const url = `file://${missingPath}`;
		const result = await probeGitRemote(url, undefined, createGitRunner);
		expect(result.state).toBe("needs_attention");
		expect(result.reason).toBeDefined();
	});

	it("bogus https:// URL → { reachable: false } (no network — git fails immediately)", async () => {
		// git ls-remote https://localhost:9999/no-such-repo will fail (connection refused / timeout).
		// GIT_TERMINAL_PROMPT=0 ensures it errors immediately without hanging.
		const url = "https://localhost:9999/no-such-repo.git";
		const result = await probeGitRemote(url, undefined, createGitRunner);
		expect(result.state).toBe("needs_attention");
	}, 35_000); // allow up to git's connect timeout
});

// ─── repoToUrl — URL construction ────────────────────────────────────────────

describe("repoToUrl — repo reference to git URL", () => {
	it("owner/repo short form → https://github.com/<owner>/<repo>.git", () => {
		expect(repoToUrl("octocat/Hello-World")).toBe("https://github.com/octocat/Hello-World.git");
		expect(repoToUrl("owner/repo")).toBe("https://github.com/owner/repo.git");
	});

	it("full https:// URL passes through unchanged", () => {
		expect(repoToUrl("https://github.com/owner/repo.git")).toBe(
			"https://github.com/owner/repo.git",
		);
		expect(repoToUrl("https://github.com/owner/repo")).toBe("https://github.com/owner/repo");
	});

	it("full https:// URL without .git passes through unchanged", () => {
		expect(repoToUrl("https://gitlab.com/owner/repo")).toBe("https://gitlab.com/owner/repo");
	});

	it("git@ SSH URL passes through unchanged", () => {
		expect(repoToUrl("git@github.com:owner/repo.git")).toBe("git@github.com:owner/repo.git");
	});

	it("file:// URL passes through unchanged", () => {
		const url = "file:///home/user/myrepo";
		expect(repoToUrl(url)).toBe(url);
	});

	it("absolute local path → file:// URL", () => {
		expect(repoToUrl("/home/user/myrepo")).toBe("file:///home/user/myrepo");
		expect(repoToUrl("/tmp/ao1-test-repo")).toBe("file:///tmp/ao1-test-repo");
	});
});
