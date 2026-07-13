/**
 * AO1 — Unit + Lane A live-proof tests for filesystem reachability.
 *
 * Lane A: CI-live, hermetic, real git + real fs, NO network/secret.
 *   - Real temp git repo → file:// ls-remote → reachable (exit 0)
 *   - Non-existent file:// path → needs_attention (exit non-zero)
 *   - Real existing folder → reachable (fs.access R_OK)
 *   - Non-existent folder → needs_attention (ENOENT)
 *
 * Lane B: LOCAL-ONLY, real PAT + real GitHub → see AO1-reachability-lane-b.integration.test.ts
 *
 * Coverage:
 *   AC5  — resolveFilesystemState: writeback:none → reachable; local probe → real result;
 *            NoopAuthResolver + connectionId → needs_attention
 *   AC3  — FILESYSTEM_KINDS does not include SoR kinds
 *   AC2  — FilesystemAuthResolver seam: canResolve / sourceOf / resolve shape
 *   LIVE — Lane A: hermetic git ls-remote (file://) + fs.access probes (no network, no secrets)
 *
 * Source of truth: plans/AO1/architecture.md §v2 (Reachability rework v2)
 */

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	NoopAuthResolver,
	probeGitRemote,
	probeLocalPath,
	repoToUrl,
	resolveFilesystemState,
} from "@hyperidle/core-app";
import { FILESYSTEM_KINDS, WRITEBACK_MODES } from "@hyperidle/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ─── Lane A: Hermetic temp-repo setup ────────────────────────────────────────

let tempRepoDir: string;
let missingPath: string;
let existingDir: string;

beforeAll(() => {
	// Create a real git repo in a temp dir — used for file:// ls-remote probes.
	tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao1-git-probe-"));
	existingDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao1-fs-probe-"));
	missingPath = path.join(os.tmpdir(), `ao1-does-not-exist-${Date.now()}`);

	// git init + at least one commit so ls-remote exits 0.
	cp.execSync("git init -b main", { cwd: tempRepoDir, stdio: "ignore" });
	cp.execSync("git config user.email test@hyperidle.local", { cwd: tempRepoDir, stdio: "ignore" });
	cp.execSync("git config user.name Test", { cwd: tempRepoDir, stdio: "ignore" });
	fs.writeFileSync(path.join(tempRepoDir, "README.md"), "probe");
	cp.execSync("git add README.md", { cwd: tempRepoDir, stdio: "ignore" });
	cp.execSync("git commit -m 'probe'", { cwd: tempRepoDir, stdio: "ignore" });
});

afterAll(() => {
	// Clean up temp dirs.
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

// ─── resolveFilesystemState — pure logic ─────────────────────────────────────

describe("resolveFilesystemState — pure reachability logic (AC5)", () => {
	it("writeback:'none' → 'reachable' regardless of connectionId (no probe)", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-1",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-abc",
				// A non-existent path — proves writeback:none short-circuits before any probe.
				resourceRef: JSON.stringify({ kind: "code", repo: "/definitely/not/real", branch: "main" }),
				writeback: "none",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("reachable");
	});

	it("bare-local code (connectionId null) + real existing path → 'reachable'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-la1",
				teamId: "team-1",
				source: "local",
				kind: "code",
				connectionId: null,
				// tempRepoDir is a real directory — access(R_OK) succeeds.
				resourceRef: JSON.stringify({ kind: "code", repo: tempRepoDir, branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("reachable");
	});

	it("bare-local code (connectionId null) + missing path → 'needs_attention'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-la2",
				teamId: "team-1",
				source: "local",
				kind: "code",
				connectionId: null,
				resourceRef: JSON.stringify({ kind: "code", repo: missingPath, branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("needs_attention");
	});

	it("bare-local doc_set (connectionId null) + real folder → 'reachable'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-la3",
				teamId: "team-1",
				source: "obsidian",
				kind: "doc_set",
				connectionId: null,
				resourceRef: JSON.stringify({ kind: "doc_set", folder: existingDir }),
				writeback: "file",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("reachable");
	});

	it("bare-local doc_set (connectionId null) + missing folder → 'needs_attention'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-la4",
				teamId: "team-1",
				source: "obsidian",
				kind: "doc_set",
				connectionId: null,
				resourceRef: JSON.stringify({ kind: "doc_set", folder: missingPath }),
				writeback: "file",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("needs_attention");
	});

	it("connection-backed + NoopAuthResolver → 'needs_attention'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-3",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-missing",
				resourceRef: JSON.stringify({
					kind: "code",
					repo: "https://github.com/owner/repo",
					branch: "main",
				}),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("needs_attention");
	});

	it("connection-backed + real resolver (canResolve=true) + no git token → git probe runs", async () => {
		// A fake resolver that always resolves but returns no raw token.
		// resolveToken() → null means ls-remote runs without auth (public/local repo is fine).
		const fakeResolver = {
			canResolve: async (_connectionId: string) => true,
			sourceOf: async (_connectionId: string) => "github",
			resolve: async (_connectionId: string) => null as null,
			resolveToken: async (_connectionId: string): Promise<string | null> => null,
		};

		// The probe path: kind=code, connectionId non-null, fakeResolver.resolveToken=null
		// → no rawToken → git ls-remote without auth against the file:// repo → reachable.
		const state = await resolveFilesystemState(
			{
				id: "fs-la5",
				teamId: "team-1",
				source: "local",
				kind: "code",
				connectionId: "conn-real",
				resourceRef: JSON.stringify({
					kind: "code",
					repo: `file://${tempRepoDir}`,
					branch: "main",
				}),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: fakeResolver },
		);
		expect(state).toBe("reachable");
	});

	it("doc_set + connectionId + NoopAuthResolver → 'needs_attention'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-5",
				teamId: "team-1",
				source: "gdrive",
				kind: "doc_set",
				connectionId: "conn-gdrive",
				resourceRef: JSON.stringify({ kind: "doc_set", folder: "/notes" }),
				writeback: "file",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("needs_attention");
	});
});

// ─── Lane A: probeLocalPath (real fs.access) ─────────────────────────────────

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
		// reason surfaces the ENOENT code and the path
		expect(result.reason).toMatch(/ENOENT|enoent|no such/i);
	});

	it("existing file → { state: 'reachable' }", async () => {
		const testFile = path.join(existingDir, "probe.txt");
		fs.writeFileSync(testFile, "probe");
		const result = await probeLocalPath(testFile);
		expect(result.state).toBe("reachable");
	});
});

// ─── Lane A: probeGitRemote (real git ls-remote, file://, no network) ────────

describe("probeGitRemote — real git ls-remote probe (Lane A, hermetic, no network)", () => {
	it("real file:// git repo → { reachable: true }", async () => {
		// LIVE PROOF: real `git ls-remote file://<tempRepoDir>` → exit 0 → reachable
		const url = `file://${tempRepoDir}`;
		const result = await probeGitRemote(url);
		expect(result.state).toBe("reachable");
		expect(result.reason).toBeUndefined();
	});

	it("non-existent file:// path → { reachable: false }", async () => {
		// LIVE PROOF: real `git ls-remote file:///path/does/not/exist` → exit non-zero → needs_attention
		const url = `file://${missingPath}`;
		const result = await probeGitRemote(url);
		expect(result.state).toBe("needs_attention");
		expect(result.reason).toBeDefined();
	});

	it("bogus https:// URL → { reachable: false } (no network — git fails immediately)", async () => {
		// git ls-remote https://localhost:9999/no-such-repo will fail (connection refused / timeout).
		// GIT_TERMINAL_PROMPT=0 ensures it errors immediately without hanging.
		// This tests the non-zero exit → needs_attention path without network.
		const url = "https://localhost:9999/no-such-repo.git";
		const result = await probeGitRemote(url);
		expect(result.state).toBe("needs_attention");
	}, 35_000); // allow up to git's connect timeout
});

// ─── NoopAuthResolver ────────────────────────────────────────────────────────

describe("NoopAuthResolver seam (AC2 / AC5)", () => {
	it("canResolve always returns false", async () => {
		const resolver = new NoopAuthResolver();
		expect(await resolver.canResolve("any-connection-id")).toBe(false);
	});

	it("sourceOf always returns null", async () => {
		const resolver = new NoopAuthResolver();
		expect(await resolver.sourceOf("any-connection-id")).toBeNull();
	});

	it("resolve always returns null", async () => {
		const resolver = new NoopAuthResolver();
		expect(await resolver.resolve("any-connection-id")).toBeNull();
	});
});

// ─── FILESYSTEM_KINDS shared constant (AC3) ──────────────────────────────────

describe("FILESYSTEM_KINDS constant (AC3)", () => {
	it("includes 'code' and 'doc_set'", () => {
		expect(FILESYSTEM_KINDS).toContain("code");
		expect(FILESYSTEM_KINDS).toContain("doc_set");
	});

	it("does NOT include systems-of-record kinds", () => {
		const kinds = FILESYSTEM_KINDS as readonly string[];
		expect(kinds).not.toContain("inbox");
		expect(kinds).not.toContain("crm");
		expect(kinds).not.toContain("ticket_queue");
		expect(kinds).not.toContain("email");
		expect(kinds).not.toContain("calendar");
	});
});

// ─── WRITEBACK_MODES shared constant ─────────────────────────────────────────

describe("WRITEBACK_MODES constant", () => {
	it("includes 'git', 'file', 'none'", () => {
		expect(WRITEBACK_MODES).toContain("git");
		expect(WRITEBACK_MODES).toContain("file");
		expect(WRITEBACK_MODES).toContain("none");
	});
});

// ─── repoToUrl — URL construction (M1 fix proof, hermetic, no network) ────────

describe("repoToUrl — repo reference to git URL (AO1 M1 fix)", () => {
	it("owner/repo short form → https://github.com/<owner>/<repo>.git", () => {
		// The canonical GitHub short form must map to a real HTTPS clone URL,
		// NOT a local file path. This was the M1 correctness bug.
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
