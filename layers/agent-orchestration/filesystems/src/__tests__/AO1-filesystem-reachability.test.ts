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
 *   AC2  — FilesystemTokenResolver seam: resolveToken
 *   LIVE — Lane A: hermetic git ls-remote (file://) + fs.access probes (no network, no secrets)
 *
 * Source of truth: plans/AO1/architecture.md §v2 (Reachability rework v2)
 *
 * @lore AU19 Increment 2b: `filesystem-reachability.ts` moved to
 * `@hyperidle/filesystems`; imports repointed there. This test file itself
 * STAYS in `packages/server` — `probeGitRemote`/`resolveFilesystemState` now
 * take a REQUIRED `gitRunnerFactory` port (`FilesystemsGitRunnerFactory`).
 * AU26 A2/C1: `createGitRunner` now comes from `@hyperidle/host-process` (the
 * `git-export` package that used to host it is deleted), closing this
 * forward-reference (same "closing" idiom as `work`'s `UserStoreReader` → `users`).
 */

import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveFilesystemState } from "@hyperidle/filesystems";
import { createGitRunner } from "../../../src/git-runner.js";
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
});

// probeLocalPath, probeGitRemote, repoToUrl suites moved to
// layers/core-api/filesystems/src/__tests__/probe-internals.test.ts
// (AU20 Ag2 barrel collapse — these are internal probe functions).

// @lore AU44 b2: FILESYSTEM_KINDS and WRITEBACK_MODES were dissolved from
// @hyperidle/domain-model; the literals are inlined in the route's Zod enum
// where the single reader was. Tests for those constants are removed here.

// repoToUrl suite moved to probe-internals.test.ts (AU20 Ag2 barrel collapse).
