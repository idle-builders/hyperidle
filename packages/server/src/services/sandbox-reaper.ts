/**
 * AF7 §6 (Z8-039) — Workspace reaper.
 *
 * `crashSession` preserves a crashed session's workspace by design (post-mortem
 * window). Nothing ever reclaimed it, so HYPERIDLE_WORKSPACES_DIR accumulated
 * dead trees forever. This app-runtime TTL sweep reclaims terminal-session and
 * orphan workspace dirs older than the TTL, while preserving:
 *   - active-session workspaces (never touched),
 *   - terminal workspaces YOUNGER than the TTL (the crash post-mortem window),
 *   - orphan dirs (no matching session row) younger than the TTL.
 *
 * The orphan-dir-with-no-row case is real: in admitSession the workspace dir is
 * spawned at P4 (adapter.spawn) BEFORE the session row is inserted at P5, so a
 * dir can legitimately exist with no `sessions` row for a brief window (and a
 * crash before row-commit can orphan a dir permanently). The TTL is the
 * deliberate safety margin for that window — the reaper MUST never reclaim an
 * orphan dir younger than the TTL.
 *
 * Mirrors the cost-sentinel pattern: `startSandboxReaper` registers a
 * setInterval and returns a disposer; `reapSandboxesOnce` runs a single
 * deterministic pass (used by bootstrap's interval and by tests).
 *
 * @lore AF7 §6: this service takes `sandboxBasePath` as DATA (a string), never
 * as a server import — app-runtime must not depend on server fs paths. The base path
 * is threaded through the bootstrap context (it is already in scope at the boot
 * path via dispatcherDeps.sandboxBasePath).
 *
 * @lore AF7 §6: rm({ recursive, force }) is idempotent — a no-op on an
 * already-gone dir — so the reaper is crash-safe and safe to run concurrently
 * with a teardown that deletes the same dir.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";

/** Terminal session states whose workspaces are eligible for reclamation. */
const TERMINAL_STATES = new Set(["done", "crashed"]);

/** Default TTL: 24h. Tunable via HYPERIDLE_WORKSPACE_TTL_HOURS. */
const DEFAULT_TTL_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

/** Sweep interval: every 60 minutes (best-effort, like the cost sentinel). */
export const SANDBOX_REAPER_INTERVAL_MS = 60 * 60 * 1000;

export interface SandboxReaperOptions {
	readonly sandboxBasePath: string;
	/** TTL in milliseconds. Defaults to HYPERIDLE_WORKSPACE_TTL_HOURS (24h). */
	readonly ttlMs?: number;
}

function resolveTtlMs(ttlMs?: number): number {
	if (ttlMs !== undefined) return ttlMs;
	const envHours = Number.parseInt(process.env.HYPERIDLE_WORKSPACE_TTL_HOURS ?? "", 10);
	const hours = Number.isFinite(envHours) && envHours > 0 ? envHours : DEFAULT_TTL_HOURS;
	return hours * HOUR_MS;
}

/**
 * Run a single reaper pass. Reclaims terminal-session and orphan workspace dirs
 * under `sandboxBasePath` that are older than the TTL; leaves active-session
 * dirs and younger dirs untouched.
 */
export async function reapSandboxesOnce(
	db: HyperIdleDb,
	options: SandboxReaperOptions,
): Promise<void> {
	const { sandboxBasePath } = options;
	const ttlMs = resolveTtlMs(options.ttlMs);
	const cutoff = Date.now() - ttlMs;

	let dirents: fs.Dirent[];
	try {
		dirents = await fs.promises.readdir(sandboxBasePath, { withFileTypes: true });
	} catch {
		// Base path does not exist yet (no sessions ever spawned) — nothing to do.
		return;
	}

	// Map workspace snapshot path → session row (the snapshot column stores the
	// absolute dir path that provisioning created).
	const sessionRows = await db
		.select({
			sandboxSnapshot: sessions.sandboxSnapshot,
			state: sessions.state,
			endedAt: sessions.endedAt,
		})
		.from(sessions);
	const byPath = new Map<string, { state: string; endedAt: string | null }>();
	for (const row of sessionRows) {
		if (row.sandboxSnapshot) {
			byPath.set(row.sandboxSnapshot, { state: row.state, endedAt: row.endedAt });
		}
	}

	for (const dirent of dirents) {
		if (!dirent.isDirectory()) continue;
		const dirPath = path.join(sandboxBasePath, dirent.name);
		const session = byPath.get(dirPath);

		if (session) {
			// Active session → never reclaim.
			if (!TERMINAL_STATES.has(session.state)) continue;
			// Terminal session → reclaim only if it ended before the TTL cutoff.
			// Preserve the post-mortem window for recently-ended sessions.
			const endedMs = session.endedAt ? Date.parse(session.endedAt) : Number.NaN;
			const endedTime = Number.isNaN(endedMs) ? await dirMtimeMs(dirPath) : endedMs;
			if (endedTime > cutoff) continue;
		} else {
			// Orphan dir (no matching session row) → reclaim only if older than TTL.
			// The TTL is the deliberate margin for the P4-spawn-before-P5-insert
			// window and for crash-before-row-commit. Never reclaim a young orphan.
			const mtimeMs = await dirMtimeMs(dirPath);
			if (mtimeMs > cutoff) continue;
		}

		await fs.promises.rm(dirPath, { recursive: true, force: true });
	}
}

/** Best-effort directory mtime in ms; falls back to "now" (keep) on stat error. */
async function dirMtimeMs(dirPath: string): Promise<number> {
	try {
		const stat = await fs.promises.stat(dirPath);
		return stat.mtimeMs;
	} catch {
		return Date.now();
	}
}

/**
 * Start the workspace reaper on a 60-minute interval. Returns a disposer that
 * clears the interval. Mirrors `startCostSentinel`.
 *
 * @lore AF7 §6: the interval resets on every server restart — worst case is a
 * 60-minute gap before the next sweep, which is irrelevant for a TTL-of-hours
 * reclamation. No persistence needed.
 */
export function startSandboxReaper(db: HyperIdleDb, options: SandboxReaperOptions): () => void {
	const handle = setInterval(() => {
		void reapSandboxesOnce(db, options);
	}, SANDBOX_REAPER_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}
