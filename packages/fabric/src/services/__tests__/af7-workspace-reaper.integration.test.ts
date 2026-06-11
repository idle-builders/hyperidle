/**
 * AF7 §6 / AC6 — Workspace lifecycle: reclaim crashed/abandoned (RED phase).
 *
 * Acceptance criterion (TRACK-AF.md AF7 AC6):
 *   "Abandoned or crashed session workspaces are cleaned up rather than
 *    accumulating indefinitely."
 * Validation scenario:
 *   "Given a session that crashes, when it ends, then ... its workspace is
 *    reclaimed."
 *
 * Root cause being closed (Z8-039): `crashSession` preserves the workspace for
 * post-mortem and nothing ever reclaims it, so `HYPERIDLE_WORKSPACES_DIR`
 * accumulates dead trees forever.
 *
 * Plan §6 fix: a TTL-guarded reaper `startWorkspaceReaper(db, { workspaceBasePath,
 * ttlMs })` (a new fabric service) sweeps the base path: terminal-session and
 * orphan dirs OLDER than the TTL are removed; active-session dirs and dirs
 * younger than the TTL (the crash post-mortem window) survive.
 *
 * RED expectation: `startWorkspaceReaper` does not exist in `@hyperidle/fabric`
 * yet — importing it is a compile error (feature absent). The single reaper-pass
 * assertions therefore cannot pass.
 *
 * We export the sweep so a test can run exactly one pass deterministically; the
 * plan's `startWorkspaceReaper` returns a disposer and schedules via setInterval,
 * and exposes a `reapOnce` (or equivalent) for a single deterministic pass.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sessions } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect } from "vitest";
// RED: this export does not exist yet (AF7 §6 adds it).
import { reapWorkspacesOnce } from "../workspace-reaper.js";

const HOUR_MS = 60 * 60 * 1000;

describe("AF7 AC6: workspace reaper reclaims terminal/orphan dirs past TTL", () => {
	let baseDir: string;

	beforeEach(() => {
		baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "af7-reaper-"));
	});

	afterEach(() => {
		fs.rmSync(baseDir, { recursive: true, force: true });
	});

	test("reclaims a crashed session's old workspace; keeps an active session's workspace", async ({
		db,
	}) => {
		const ttlMs = 24 * HOUR_MS;
		const oldEndedAt = new Date(Date.now() - 48 * HOUR_MS).toISOString();
		const nowIso = new Date().toISOString();

		// Crashed session, ended 48h ago — eligible for reclamation.
		const crashedDir = path.join(baseDir, "crashed-sess");
		fs.mkdirSync(crashedDir, { recursive: true });
		fs.writeFileSync(path.join(crashedDir, "notes.md"), "post-mortem");
		await db.insert(sessions).values({
			id: "crashed-sess",
			taskId: "af7-task-reaper",
			agentId: "af7-agent-reaper",
			modelTier: "workhorse",
			startedAt: oldEndedAt,
			endedAt: oldEndedAt,
			state: "crashed",
			outcome: "crashed",
			workspaceSnapshot: crashedDir,
		});

		// Active session — its workspace must survive.
		const activeDir = path.join(baseDir, "active-sess");
		fs.mkdirSync(activeDir, { recursive: true });
		await db.insert(sessions).values({
			id: "active-sess",
			taskId: "af7-task-reaper",
			agentId: "af7-agent-reaper",
			modelTier: "workhorse",
			startedAt: nowIso,
			state: "active",
			workspaceSnapshot: activeDir,
		});

		await reapWorkspacesOnce(db, { workspaceBasePath: baseDir, ttlMs });

		expect(fs.existsSync(crashedDir)).toBe(false);
		expect(fs.existsSync(activeDir)).toBe(true);
	});

	test("preserves a crashed workspace YOUNGER than the TTL (post-mortem window)", async ({
		db,
	}) => {
		const ttlMs = 24 * HOUR_MS;
		const recentEndedAt = new Date(Date.now() - 1 * HOUR_MS).toISOString();

		const recentDir = path.join(baseDir, "recent-crash");
		fs.mkdirSync(recentDir, { recursive: true });
		await db.insert(sessions).values({
			id: "recent-crash",
			taskId: "af7-task-reaper",
			agentId: "af7-agent-reaper",
			modelTier: "workhorse",
			startedAt: recentEndedAt,
			endedAt: recentEndedAt,
			state: "crashed",
			outcome: "crashed",
			workspaceSnapshot: recentDir,
		});

		await reapWorkspacesOnce(db, { workspaceBasePath: baseDir, ttlMs });

		// Younger than TTL — the crash post-mortem window is preserved.
		expect(fs.existsSync(recentDir)).toBe(true);
	});

	test("reclaims an ORPHAN dir (no session row) older than the TTL", async ({ db }) => {
		void db;
		const ttlMs = 1; // tiny TTL so a freshly-made dir is already 'old'

		const orphanDir = path.join(baseDir, "orphan");
		fs.mkdirSync(orphanDir, { recursive: true });
		// Backdate the directory mtime so it is older than the TTL.
		const past = new Date(Date.now() - HOUR_MS);
		fs.utimesSync(orphanDir, past, past);

		await reapWorkspacesOnce(db, { workspaceBasePath: baseDir, ttlMs });

		expect(fs.existsSync(orphanDir)).toBe(false);
	});
});
