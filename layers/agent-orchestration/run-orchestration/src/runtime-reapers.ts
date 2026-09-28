/** Consolidated private runtime maintenance phases. */
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";

// ---- sandbox ----

/** Terminal session states whose workspaces are eligible for reclamation. */
const TERMINAL_STATES = new Set(["done", "crashed"]);

/** Default TTL: 24h. Tunable via HYPERIDLE_WORKSPACE_TTL_HOURS. */
const DEFAULT_TTL_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

/** Sweep interval: every 60 minutes (best-effort). */
const SANDBOX_REAPER_INTERVAL_MS = 60 * 60 * 1000;

interface SandboxReaperOptions {
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
async function reapSandboxesOnce(db: HyperIdleDb, options: SandboxReaperOptions): Promise<void> {
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
 * clears the interval.
 *
 * @lore: sandbox reaper interval — resets on restart; worst case 60-min gap is irrelevant for a TTL-of-hours reclamation; no persistence needed
 */
function startSandboxReaper(db: HyperIdleDb, options: SandboxReaperOptions): () => void {
	const handle = setInterval(() => {
		void reapSandboxesOnce(db, options);
	}, SANDBOX_REAPER_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}

interface RuntimeReapers {
	reapSandboxes(options: SandboxReaperOptions): Promise<void>;
	startSandboxes(options: SandboxReaperOptions): () => void;
}

export function createRuntimeReapers(db: HyperIdleDb): RuntimeReapers {
	return {
		reapSandboxes: (options) => reapSandboxesOnce(db, options),
		startSandboxes: (options) => startSandboxReaper(db, options),
	};
}
