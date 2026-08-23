/**
 * Filesystem live proof (hard rule 9, §12).
 *
 * Exercises the REAL GitWorktreeAdapter end-to-end on THIS repo:
 * 1. git worktree add a throwaway branch off origin/main into a temp dir.
 * 2. Drive a real edit + captureBack (real git add/commit/bundle).
 * 3. Assert:
 *    (a) A filesystem_captures row exists.
 *    (b) Its capturePath bundle clones and contains the bot's commit + the edit.
 *    (c) The edit is NOT a clobbered CLAUDE.md/AGENTS.md/.mcp.json (scaffolding-exclusion held).
 *    (d) git worktree remove ran — no dangling worktree.
 *
 * No LLM, no npm run check, no tsc invocation — real worktree + real edit + real capture.
 *
 * @lore AO2 §12: live-proof uses THIS repo (HyperIdle builds HyperIdle). The worktree
 * adapter runs on itself — exercises the self-host scaffolding-exclusion case.
 * @lore AO2 W5: no npm run check inside this test (whole-monorepo tsc = minutes).
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { filesystemInjections, filesystems, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, test } from "@hyperidle/db/test-fixtures";
import { createGitRunner } from "@hyperidle/host-process";
import { eq } from "drizzle-orm";
import { RegistryFilesystemMounter, SANDBOX_SCAFFOLDING_PATHS } from "../index.js";
import type { Filesystem } from "../mounter.js";

// ── Repo root — this repo's git dir ──────────────────────────────────────────

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "../../../../../..");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedAgentInTeam(
	db: import("@hyperidle/db").HyperIdleDb,
): Promise<{ rootTeamId: string; agentId: string }> {
	const rootTeamId = randomUUID();
	await db.insert(teams).values({
		id: rootTeamId,
		name: "Live Proof Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	const agentId = randomUUID();
	await db.insert(users).values({
		id: agentId,
		name: "Live Proof Agent",
		role: "builder",
		status: "idle",
		teamId: rootTeamId,
		createdAt: new Date().toISOString(),
	});
	return { rootTeamId, agentId };
}

async function seedFilesystem(
	db: import("@hyperidle/db").HyperIdleDb,
	teamId: string,
	agentId: string,
	repoPath: string,
): Promise<{ fsId: string; fs: Filesystem }> {
	const fsId = randomUUID();
	const fsDef: Filesystem = {
		id: fsId,
		teamId,
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: { kind: "code", repo: repoPath, branch: "main" },
		writeback: "git",
		state: "reachable",
		createdAt: new Date().toISOString(),
	};
	await db.insert(filesystems).values({
		id: fsId,
		teamId,
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: JSON.stringify(fsDef.resourceRef),
		writeback: "git",
		state: "reachable",
		createdAt: fsDef.createdAt,
	});
	await db
		.insert(filesystemInjections)
		.values({ agentUserId: agentId, filesystemId: fsId, createdAt: new Date().toISOString() });
	return { fsId, fs: fsDef };
}

// ── Live-proof suite ──────────────────────────────────────────────────────────

describe("Git worktree live proof on this repo", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-live-proof-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	// @lore AU43 repair: captureBack (git add/commit/bundle/worktreeRemove) was deleted by
	// AU43 bundle-10. It is now a declared no-op returning {success:true, captured:false}.
	// Steps 4b (bundle clone), 4c (scaffolding-exclusion), 4d (worktree removal) are removed.
	test("real worktreeAdd → real captureBack is a declared no-op", async ({ db, skip }) => {
		// Guard: this test requires a git repo with origin/main.
		// Use vitest's ctx.skip() so the test is reported as SKIPPED (not silently passing).
		// A silent `return` would let this keystone green-skip without any trace.
		try {
			execSync("git rev-parse origin/main", { cwd: REPO_ROOT, stdio: "ignore" });
		} catch {
			skip("[git-worktree-live-proof] origin/main not reachable from REPO_ROOT");
			return; // unreachable at runtime; satisfies TypeScript skip() void return
		}

		const { rootTeamId, agentId } = await seedAgentInTeam(db);
		const { fsId, fs: fsDef } = await seedFilesystem(db, rootTeamId, agentId, REPO_ROOT);

		const sessionId = randomUUID();
		const sandboxBasename = `lp-${sessionId}`;
		const sandboxPath = path.join(tmpDir, sandboxBasename);
		fs.mkdirSync(sandboxPath, { recursive: true });

		const deps = {
			gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
		};

		const adapter = new RegistryFilesystemMounter(deps);

		// ── Step 1: mount (real git worktree add) ────────────────────────────
		const mountResult = await adapter.mount({
			filesystem: fsDef,
			sandboxPath,
		});
		expect(mountResult.error, mountResult.error).toBeUndefined();
		expect(mountResult).toEqual({ success: true });

		// Working tree present in sandbox.
		expect(fs.existsSync(path.join(sandboxPath, "package.json"))).toBe(true);

		// ── Step 3: captureBack — confirmed declared no-op ───────────────────
		const captureResult = await adapter.captureBack({
			filesystem: fsDef,
			sandboxPath,
			sessionId,
		});

		expect(captureResult.error).toBeUndefined();
		expect(captureResult.success).toBe(true);
		// AU43 stage 2: capture write code removed; captureBack is a no-op.
		expect(captureResult.captured).toBe(false);

		// ── Bonus: assert no secret leakage (AC4) ────────────────────────────
		// The filesystem row must NOT contain any token column (static — schema has none).
		// @lore AO2 AC4: schema.ts filesystems table has no token/secret column.
		const [fsRow] = await db.select().from(filesystems).where(eq(filesystems.id, fsId));
		expect(fsRow).toBeDefined();
		// The entire row object must not have a 'token' or 'secret' key.
		const fsRowKeys = Object.keys(fsRow ?? {});
		expect(
			fsRowKeys.some(
				(k) => k.toLowerCase().includes("token") || k.toLowerCase().includes("secret"),
			),
		).toBe(false);

		// ── Bonus: SANDBOX_SCAFFOLDING_PATHS contains expected entries ────────
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("CLAUDE.md");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("AGENTS.md");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".fabric");

		// Clean up the dangling worktree (captureBack no longer does it).
		try {
			await createGitRunner(REPO_ROOT).worktreeRemove(sandboxPath, { force: true });
		} catch {
			// best-effort cleanup; afterEach removes the files
		}
	});
});
