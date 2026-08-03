/** Consolidated private runtime maintenance phases. */
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import type { createProvisioner } from "./provisioner.js";

type SessionLifecyclePorts = Parameters<typeof createProvisioner>[0];
/**
 * AU21 §9 Increment 4 (Decision B″ item 3): the routine-run finalize write
 * moved core-side. `reapStaleRoutineSessions` no longer touches
 * `ports.routine` at all — the stale session's own `sourceId` column is
 * already the `routineRunId` (set at session creation, AA2), so no routine
 * lookup is needed to emit the finalize event.
 */

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
 * clears the interval. Mirrors `startCostSentinel`.
 *
 * @lore AF7 §6: the interval resets on every server restart — worst case is a
 * 60-minute gap before the next sweep, which is irrelevant for a TTL-of-hours
 * reclamation. No persistence needed.
 */
function startSandboxReaper(db: HyperIdleDb, options: SandboxReaperOptions): () => void {
	const handle = setInterval(() => {
		void reapSandboxesOnce(db, options);
	}, SANDBOX_REAPER_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}

// ---- routine sessions ----

const reaperLog = createLogger({ pkg: "server.routine-reaper" });

interface ReapStaleRoutineSessionsOpts {
	/** A routine session active longer than this (ms) is considered stale/hung. */
	staleAfterMs: number;
	/** Override "now" (ms) for deterministic tests. */
	now?: number;
}

/**
 * AF6 §4 (R5) — finalize stale `active` routine sessions that never reached
 * endSession/crashSession (process restart mid-run, in-process adapter hang).
 *
 * A `running` routine_run + `active` routine session that is never finalized
 * makes `routineService.findRunningRoutineRun` true forever (AU15: the
 * unified run-row coalescing signal both fire paths now share) → the routine
 * bricks itself. This reaper marks each stale session `crashed` and its
 * `running` routine_run `timeout`, self-healing coalescing so the next
 * scheduled fire is eligible.
 *
 * Direct DB finalize (not via session-lifecycle): after a restart there is no
 * live SessionContext / harness to tear down — the process that owned it is gone.
 * For an in-process hang there is likewise nothing in-memory worth draining.
 *
 * @lore AF6: pure-DB (db + eventBus only) so it can live in app runtime and be
 * injected into the scheduler poll loop without coupling to session provisioning.
 */
async function reapStaleRoutineSessions(
	db: HyperIdleDb,
	eventBus: EventBus,
	opts: ReapStaleRoutineSessionsOpts,
	_ports: SessionLifecyclePorts,
): Promise<number> {
	const nowMs = opts.now ?? Date.now();
	const cutoffIso = new Date(nowMs - opts.staleAfterMs).toISOString();
	const endedAt = new Date(nowMs).toISOString();

	// Stale = active routine session started before the cutoff.
	const stale = await db
		.select({
			id: sessions.id,
			routineId: sessions.routineId,
			agentId: sessions.agentId,
			taskId: sessions.taskId,
			sourceId: sessions.sourceId,
		})
		.from(sessions)
		.where(
			and(
				eq(sessions.state, "active"),
				sql`${sessions.routineId} is not null`,
				lt(sessions.startedAt, cutoffIso),
			),
		);

	let reaped = 0;
	for (const session of stale) {
		// `sourceId` is already this session's `routineRunId` (AA2) — no routine
		// lookup is needed to identify the run to finalize.
		if (!(session.routineId && session.sourceId)) continue;

		await db.update(sessions).set({ state: "crashed", endedAt }).where(eq(sessions.id, session.id));

		// AU21 §9 Increment 4 (Decision B″ item 3): finalize via the SAME
		// post-session `session_ended` channel `endSession`/`crashSession` use
		// — no direct `routineRuns` write here. The new core-api subscriber
		// (`routine-run-session-end-reactions.ts`) performs the actual write.
		eventBus.emit({
			type: "session_ended",
			streamId: session.id,
			sessionId: session.id,
			agentId: session.agentId,
			taskId: session.taskId,
			sourceKind: "routine",
			sourceId: session.sourceId,
			timestamp: nowMs,
			outcome: "crashed",
			routineRunOutcome: "timeout",
		});

		reaped += 1;
	}

	if (reaped > 0) {
		reaperLog.info("reaped stale routine sessions", { reaped, staleAfterMs: opts.staleAfterMs });
	}

	return reaped;
}

interface RuntimeReapers {
	reapSandboxes(options: SandboxReaperOptions): Promise<void>;
	startSandboxes(options: SandboxReaperOptions): () => void;
	reapRoutineSessions(options: ReapStaleRoutineSessionsOpts): Promise<number>;
}

export function createRuntimeReapers(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: SessionLifecyclePorts,
): RuntimeReapers {
	return {
		reapSandboxes: (options) => reapSandboxesOnce(db, options),
		startSandboxes: (options) => startSandboxReaper(db, options),
		reapRoutineSessions: (options) => reapStaleRoutineSessions(db, eventBus, options, ports),
	};
}
