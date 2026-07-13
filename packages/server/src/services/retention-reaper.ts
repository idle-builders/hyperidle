/**
 * AF16 T16 (Z8-097) — Retention reaper.
 *
 * Periodic TTL sweep for 5 tables with temporal columns. Mirrors the
 * sandbox-reaper pattern: `reapRetentionOnce(db, opts)` for a deterministic
 * single pass + `startRetentionReaper(db, opts): () => void` for the 6-hour
 * scheduled interval.
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
 */

import {
	type HyperIdleDb,
	inviteCodes,
	knowledgeAccessLog,
	loginSessions,
	propagationLog,
} from "@hyperidle/db";
import { and, inArray, isNotNull, lt, or } from "drizzle-orm";
import { deleteReaped } from "../notifications/notification-queue.js";

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
	opts?: RetentionReaperOptions,
): Promise<RetentionSweepResult[]> {
	const nowMs = (opts?.now ?? Date.now)();
	const expiredGraceMs = opts?.expiredGraceMs ?? 0;
	const terminalLogTtlMs = opts?.terminalLogTtlMs ?? TERMINAL_LOG_TTL_MS;
	const consumedInviteTtlMs = opts?.consumedInviteTtlMs ?? CONSUMED_INVITE_TTL_MS;

	const results: RetentionSweepResult[] = [];

	// ── 1. login_sessions — expiry-based ────────────────────────────────────
	//    Prune: expiresAt < (now − expiredGraceMs)   [default: expiresAt < now]
	//    OR:    revokedAt IS NOT NULL AND revokedAt < (now − expiredGraceMs)
	{
		const cutoff = new Date(nowMs - expiredGraceMs).toISOString();
		const deleted = await db
			.delete(loginSessions)
			.where(
				or(
					lt(loginSessions.expiresAt, cutoff),
					and(isNotNull(loginSessions.revokedAt), lt(loginSessions.revokedAt, cutoff)),
				),
			)
			.returning({ id: loginSessions.id });
		results.push({ table: "login_sessions", deleted: deleted.length });
	}

	// ── 2. invite_codes — two branches ──────────────────────────────────────
	//    (a) Expired + unclaimed: expiresAt < cutoff AND claimedBy IS NULL
	//    (b) Consumed: claimedBy IS NOT NULL AND createdAt < consumedCutoff
	//
	//    @lore AF16: claimedBy nullable — use JS filter to distinguish null from
	//    "not claimed". We select rows by expiry, JS-filter for null claimedBy,
	//    then delete by id batch. Consumed branch uses isNotNull() directly.
	//    createdBy has RESTRICT FK (on invite_codes → users) but invite_codes are
	//    leaf rows (nothing references invite_codes.id with RESTRICT), safe to prune.
	{
		const expiredCutoff = new Date(nowMs - expiredGraceMs).toISOString();
		const consumedCutoff = new Date(nowMs - consumedInviteTtlMs).toISOString();

		// Expired rows (both claimed and unclaimed) — filter JS-side for unclaimed
		const expiredRows = await db
			.select({ id: inviteCodes.id, claimedBy: inviteCodes.claimedBy })
			.from(inviteCodes)
			.where(lt(inviteCodes.expiresAt, expiredCutoff));
		const expiredUnclaimedIds = expiredRows.filter((r) => r.claimedBy === null).map((r) => r.id);

		// Consumed rows past the audit window
		const consumedOldRows = await db
			.select({ id: inviteCodes.id })
			.from(inviteCodes)
			.where(and(isNotNull(inviteCodes.claimedBy), lt(inviteCodes.createdAt, consumedCutoff)));
		const consumedOldIds = consumedOldRows.map((r) => r.id);

		const toDelete = [...new Set([...expiredUnclaimedIds, ...consumedOldIds])];
		let deleted = 0;
		if (toDelete.length > 0) {
			const result = await db
				.delete(inviteCodes)
				.where(inArray(inviteCodes.id, toDelete))
				.returning({ id: inviteCodes.id });
			deleted = result.length;
		}
		results.push({ table: "invite_codes", deleted });
	}

	// ── 3. notification_queue — age-based, terminal-only ────────────────────
	//    Prune: status IN ('sent','failed','dropped') AND createdAt < cutoff
	{
		const cutoff = new Date(nowMs - terminalLogTtlMs).toISOString();
		const deleted = await deleteReaped(db, cutoff, ["sent", "failed", "dropped"]);
		results.push({ table: "notification_queue", deleted: deleted.length });
	}

	// ── 4. knowledge_access_log — age-based ─────────────────────────────────
	//    Prune: accessedAt < (now − terminalLogTtlMs)
	{
		const cutoff = new Date(nowMs - terminalLogTtlMs).toISOString();
		const deleted = await db
			.delete(knowledgeAccessLog)
			.where(lt(knowledgeAccessLog.accessedAt, cutoff))
			.returning({ id: knowledgeAccessLog.id });
		results.push({ table: "knowledge_access_log", deleted: deleted.length });
	}

	// ── 5. propagation_log — age-based, terminal-only ────────────────────────
	//    Prune: status IN ('applied','skipped') AND createdAt < cutoff
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
export function startRetentionReaper(db: HyperIdleDb, opts?: RetentionReaperOptions): () => void {
	const handle = setInterval(() => {
		void reapRetentionOnce(db, opts);
	}, RETENTION_REAPER_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}
