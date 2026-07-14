/**
 * AF16 T16 (Z8-097) — Retention reaper.
 *
 * Periodic TTL sweep for 5 tables with temporal columns. Mirrors the
 * sandbox-reaper pattern: `reapRetentionOnce(db, deps, opts)` for a
 * deterministic single pass + `startRetentionReaper(db, deps, opts): () => void`
 * for the 6-hour scheduled interval.
 *
 * @lore AF16 T16: This is an in-process setInterval scheduler — NOT BullMQ.
 * The CLAUDE.md Tech Stack correctly documents in-process setInterval services
 * as the scheduler mechanism (AF16 T13 doc hygiene).
 *
 * Predicate shapes (resolves WARNING-3):
 *   - **Expiry-based** (`login_sessions`, `invite_codes` expired branch):
 *       prune at `expiresAt < now − expiredGraceMs` (default 0).
 *       The expiresAt timestamp is set at row creation using the TTL — the
 *       reaper only reads it. Do NOT re-apply the TTL here.
 *   - **Age-based** (`notification_queue`, `knowledge_access_log`,
 *       `propagation_log`, consumed `invite_codes`):
 *       prune at `createdAt/accessedAt < now − terminalLogTtlMs`.
 *
 * ISO-8601 lexical ordering: timestamp columns are text ISO-8601 strings
 * (verified in schema.ts). ISO-8601 sorts lexically = chronologically,
 * so `lt(col, cutoffIso)` is correct. `cutoffIso` is computed as
 * `new Date(now − ttl).toISOString()`.
 *
 * @lore AF16 T16 WARNING-3: expiry-based tables must prune AS SOON AS
 * `expiresAt < now` (i.e. expiredGraceMs defaults to 0). Pruning at
 * `expiresAt < now − TTL` would retain expired rows a full TTL too long.
 *
 * @lore AU19 Increment 2g: moved from `packages/server/src/services/
 * retention-reaper.ts` into this package (`retention` is its own core-api
 * Service — architecture §9 point 5's fold decision: "Keep it a Service;
 * revisit folding into `dispatch` only if it shrinks to a single call" —
 * it stays a Service here since it still coordinates 3 injected reapers +
 * one direct unowned-shared-table sweep, not a single call). Three of the
 * five per-table deletes (`login_sessions`/`invite_codes` on `users`,
 * `knowledge_access_log` on `knowledge`) now route through injected
 * `RetentionReaperDeps` ports (Mechanism A forces this — `retention` no
 * longer owns or may directly touch those tables). `notification_queue`
 * already routed through `@hyperidle/notifications`' `deleteReaped` before
 * this migration (a real exported function, not a raw table) but that
 * import became illegal once `retention` is its own Service package
 * (Mechanism C — a Service never imports another Service directly), so it
 * too is now an injected port (`deps.notifications.deleteReaped`).
 * `propagation_log` stays a direct `@hyperidle/db` delete — it is in
 * `UNOWNED_SHARED_TABLES` (genuinely multi-owner-touched), so no port is
 * needed. Zero behavior change: same predicates, same cutoffs, same
 * per-table result shape.
 */

import { type HyperIdleDb, propagationLog } from "@hyperidle/db";
import { and, inArray, lt } from "drizzle-orm";
import type { RetentionReaperDeps } from "./ports.js";

export const RETENTION_REAPER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const TERMINAL_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const CONSUMED_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 day audit window

export interface RetentionReaperOptions {
	/** Injectable clock for testing. Defaults to Date.now. */
	readonly now?: () => number;
	/**
	 * Grace window for expiry-based tables (login_sessions, invite_codes expired branch).
	 * Prune at `expiresAt < now − expiredGraceMs`. Default 0 = prune as soon as expired.
	 * @lore AF16 WARNING-3: do NOT set this to the session TTL — that would over-retain.
	 */
	readonly expiredGraceMs?: number;
	/**
	 * TTL for terminal log rows (notification_queue, knowledge_access_log, propagation_log).
	 * Prune at `createdAt/accessedAt < now − terminalLogTtlMs`. Default 30 days.
	 */
	readonly terminalLogTtlMs?: number;
	/**
	 * Audit window for consumed invite_codes.
	 * Prune consumed rows where `createdAt < now − consumedInviteTtlMs`. Default 30 days.
	 */
	readonly consumedInviteTtlMs?: number;
}

export interface RetentionSweepResult {
	readonly table: string;
	readonly deleted: number;
}

/**
 * Run a single retention sweep. Returns the count of rows deleted per table.
 * Injectable `opts.now` for deterministic testing.
 */
export async function reapRetentionOnce(
	db: HyperIdleDb,
	deps: RetentionReaperDeps,
	opts?: RetentionReaperOptions,
): Promise<RetentionSweepResult[]> {
	const nowMs = (opts?.now ?? Date.now)();
	const expiredGraceMs = opts?.expiredGraceMs ?? 0;
	const terminalLogTtlMs = opts?.terminalLogTtlMs ?? TERMINAL_LOG_TTL_MS;
	const consumedInviteTtlMs = opts?.consumedInviteTtlMs ?? CONSUMED_INVITE_TTL_MS;

	const results: RetentionSweepResult[] = [];

	// ── 1. login_sessions — expiry-based (owned by `users`, injected port) ──
	{
		const cutoff = new Date(nowMs - expiredGraceMs).toISOString();
		const deleted = await deps.users.reapLoginSessions(db, cutoff);
		results.push({ table: "login_sessions", deleted: deleted.length });
	}

	// ── 2. invite_codes — two branches (owned by `users`, injected port) ────
	{
		const expiredCutoff = new Date(nowMs - expiredGraceMs).toISOString();
		const consumedCutoff = new Date(nowMs - consumedInviteTtlMs).toISOString();
		const deleted = await deps.users.reapInviteCodes(db, expiredCutoff, consumedCutoff);
		results.push({ table: "invite_codes", deleted: deleted.length });
	}

	// ── 3. notification_queue — age-based, terminal-only (owned by ────────
	//    `notifications`, injected port) ─────────────────────────────────────
	{
		const cutoff = new Date(nowMs - terminalLogTtlMs).toISOString();
		const deleted = await deps.notifications.deleteReaped(db, cutoff, [
			"sent",
			"failed",
			"dropped",
		]);
		results.push({ table: "notification_queue", deleted: deleted.length });
	}

	// ── 4. knowledge_access_log — age-based (owned by `knowledge`, ─────────
	//    injected port) ───────────────────────────────────────────────────────
	{
		const cutoff = new Date(nowMs - terminalLogTtlMs).toISOString();
		const deleted = await deps.knowledge.reapKnowledgeAccessLog(db, cutoff);
		results.push({ table: "knowledge_access_log", deleted: deleted.length });
	}

	// ── 5. propagation_log — age-based, terminal-only ────────────────────────
	//    Prune: status IN ('applied','skipped') AND createdAt < cutoff
	//    Direct table access — `propagationLog` is in UNOWNED_SHARED_TABLES.
	{
		const cutoff = new Date(nowMs - terminalLogTtlMs).toISOString();
		const deleted = await db
			.delete(propagationLog)
			.where(
				and(
					lt(propagationLog.createdAt, cutoff),
					inArray(propagationLog.status, ["applied", "skipped"]),
				),
			)
			.returning({ id: propagationLog.id });
		results.push({ table: "propagation_log", deleted: deleted.length });
	}

	return results;
}

/**
 * Start the retention reaper on a 6-hour interval. Returns a disposer.
 * Mirrors `startSandboxReaper`.
 *
 * @lore AF16 T17: wired in bootstrap.ts alongside startSandboxReaper /
 * startNotificationDrain. This is the in-process scheduler (not BullMQ).
 */
export function startRetentionReaper(
	db: HyperIdleDb,
	deps: RetentionReaperDeps,
	opts?: RetentionReaperOptions,
): () => void {
	const handle = setInterval(() => {
		void reapRetentionOnce(db, deps, opts);
	}, RETENTION_REAPER_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}
