/**
 * `resolveFilesystemState` decides reachable/needs_attention for a
 * filesystem: writeback:none short-circuits to reachable; a bare-local path
 * probes real git (file://) or the real fs; a connection-backed source
 * without a resolvable token is needs_attention; a shorthand `owner/repo`
 * normalizes to its github URL before probing. Hermetic — real temp git
 * repos and real fs, no network, no secrets.
 */

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveFilesystemState } from "@hyperidle/filesystems";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitRunner } from "../../../src/git-runner.js";

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

// ─── Inline noop resolver ────────────────────────────────────────────────────
// @lore AU20 R-filesystems: NoopAuthResolver class deleted from @hyperidle/filesystems
// barrel. Tests that needed a noop use this inline structural object instead.
const noopAuthResolver = {
	resolveToken: async (_connectionId: string) => null,
};

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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
		);
		expect(state).toBe("needs_attention");
	});

	it("connection-backed + real resolver (canResolve=true) + no git token → git probe runs", async () => {
		// A fake resolver that returns no raw token.
		// resolveToken() → null means ls-remote runs without auth (public/local repo is fine).
		const fakeResolver = {
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
			{ authResolver: fakeResolver, gitRunnerFactory: createGitRunner },
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
			{ authResolver: noopAuthResolver, gitRunnerFactory: createGitRunner },
		);
		expect(state).toBe("needs_attention");
	});

	it("normalizes an owner/repo shorthand to its github https URL before probing", async () => {
		let observed = "";
		const factory = (() => ({
			lsRemote: async (url: string) => {
				observed = url;
				return { reachable: true };
			},
		})) as unknown as Parameters<typeof resolveFilesystemState>[1]["gitRunnerFactory"];
		const state = await resolveFilesystemState(
			{
				id: "fs-shorthand",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-1",
				resourceRef: JSON.stringify({ kind: "code", repo: "owner/repo", branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: noopAuthResolver, gitRunnerFactory: factory },
		);
		expect(state).toBe("reachable");
		expect(observed).toBe("https://github.com/owner/repo.git");
	});
});
