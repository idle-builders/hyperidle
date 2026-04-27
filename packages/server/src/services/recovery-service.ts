/**
 * L7 — Recovery verbs service. Single source of truth for the
 * `recovery_audit` writes + `factory_state` mutations. Every successful
 * recovery verb writes exactly one append-only audit row in the same
 * transaction as the state change so partial failures cannot leave the
 * audit log out of sync with reality.
 *
 * @lore L7: never UPDATE or DELETE rows in `recovery_audit`. The
 * append-only invariant mirrors L1 `agent_skill_autonomy_audit` and L2
 * `thread_routing_audit`. Resume / un-pause is a NEW row (verb=
 * `factory_resume` / `session_resume`), not an update of the prior
 * pause row.
 */
import {
	factoryState,
	type FactoryStateRow,
	type HyperIdleDb,
	recoveryAudit,
	sessions,
} from "@hyperidle/db";
import type { RecoveryOutcome, RecoveryTargetKind, RecoveryVerb } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

const FACTORY_SINGLETON_ID = "factory";

export interface FactoryStateView {
	paused: boolean;
	pausedBy: string | null;
	pausedAt: string | null;
	pausedReason: string | null;
}

export type FactoryPauseResult =
	| {
			ok: true;
			auditId: string;
			pausedAt: string;
			affected: { sessions: number; tasks: number };
	  }
	| { ok: false; reason: "already_paused"; pausedBy: string | null; pausedAt: string | null };

export type FactoryResumeResult =
	| { ok: true; auditId: string; resumedAt: string }
	| { ok: false; reason: "not_paused" };

export type SessionPauseResult =
	| { ok: true; auditId: string; checkpointAt: string }
	| { ok: false; reason: "not_found" }
	| { ok: false; reason: "already_paused" };

export type SessionResumeResult =
	| { ok: true; auditId: string; resumedAt: string }
	| { ok: false; reason: "not_found" }
	| { ok: false; reason: "not_paused" };

function emptyState(): FactoryStateView {
	return { paused: false, pausedBy: null, pausedAt: null, pausedReason: null };
}

function viewOf(row: FactoryStateRow | undefined): FactoryStateView {
	if (!row) return emptyState();
	return {
		paused: Boolean(row.paused),
		pausedBy: row.pausedBy,
		pausedAt: row.pausedAt,
		pausedReason: row.pausedReason,
	};
}

export function readFactoryState(db: HyperIdleDb): FactoryStateView {
	const row = db
		.select()
		.from(factoryState)
		.where(eq(factoryState.id, FACTORY_SINGLETON_ID))
		.get();
	return viewOf(row);
}

interface InsertAuditOpts {
	id: string;
	actorId: string;
	verb: RecoveryVerb;
	reason: string;
	targetKind: RecoveryTargetKind;
	targetId: string;
	at: string;
	outcome: RecoveryOutcome;
	meta?: string | null;
}

export function pauseFactory(
	db: HyperIdleDb,
	input: { actorId: string; reason: string },
): FactoryPauseResult {
	return db.transaction(
		(tx) => {
			const current = tx
				.select()
				.from(factoryState)
				.where(eq(factoryState.id, FACTORY_SINGLETON_ID))
				.get();

			if (current?.paused) {
				return {
					ok: false as const,
					reason: "already_paused" as const,
					pausedBy: current.pausedBy,
					pausedAt: current.pausedAt,
				};
			}

			const now = new Date().toISOString();
			const auditId = crypto.randomUUID();

			if (current) {
				tx.update(factoryState)
					.set({
						paused: true,
						pausedBy: input.actorId,
						pausedAt: now,
						pausedReason: input.reason,
					})
					.where(eq(factoryState.id, FACTORY_SINGLETON_ID))
					.run();
			} else {
				tx.insert(factoryState)
					.values({
						id: FACTORY_SINGLETON_ID,
						paused: true,
						pausedBy: input.actorId,
						pausedAt: now,
						pausedReason: input.reason,
					})
					.run();
			}

			// Affected summary — best-effort count of currently-running
			// sessions and queued tasks. Read-only; the agent runtime
			// observes the factory_state row at job-pickup time.
			const runningSessions =
				tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.state, "running")).all()
					.length ?? 0;

			tx.insert(recoveryAudit)
				.values({
					id: auditId,
					actorId: input.actorId,
					verb: "factory_pause",
					reason: input.reason,
					targetKind: "factory",
					targetId: FACTORY_SINGLETON_ID,
					at: now,
					outcome: "succeeded",
					meta: JSON.stringify({ affected: { sessions: runningSessions } }),
				})
				.run();

			return {
				ok: true as const,
				auditId,
				pausedAt: now,
				affected: { sessions: runningSessions, tasks: 0 },
			};
		},
		{ behavior: "immediate" },
	);
}

export function resumeFactory(
	db: HyperIdleDb,
	input: { actorId: string; reason?: string },
): FactoryResumeResult {
	return db.transaction(
		(tx) => {
			const current = tx
				.select()
				.from(factoryState)
				.where(eq(factoryState.id, FACTORY_SINGLETON_ID))
				.get();

			if (!current?.paused) {
				return { ok: false as const, reason: "not_paused" as const };
			}

			const now = new Date().toISOString();
			const auditId = crypto.randomUUID();

			tx.update(factoryState)
				.set({ paused: false, pausedBy: null, pausedAt: null, pausedReason: null })
				.where(eq(factoryState.id, FACTORY_SINGLETON_ID))
				.run();

			tx.insert(recoveryAudit)
				.values({
					id: auditId,
					actorId: input.actorId,
					verb: "factory_resume",
					reason: input.reason ?? "(no reason)",
					targetKind: "factory",
					targetId: FACTORY_SINGLETON_ID,
					at: now,
					outcome: "succeeded",
					meta: null,
				})
				.run();

			return { ok: true as const, auditId, resumedAt: now };
		},
		{ behavior: "immediate" },
	);
}

export function pauseSession(
	db: HyperIdleDb,
	input: { sessionId: string; actorId: string; reason: string },
): SessionPauseResult {
	return db.transaction(
		(tx) => {
			const session = tx.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();
			if (!session) return { ok: false as const, reason: "not_found" as const };
			if (session.state === "paused") {
				return { ok: false as const, reason: "already_paused" as const };
			}

			const now = new Date().toISOString();
			const auditId = crypto.randomUUID();

			tx.update(sessions)
				.set({ state: "paused" })
				.where(eq(sessions.id, input.sessionId))
				.run();

			tx.insert(recoveryAudit)
				.values({
					id: auditId,
					actorId: input.actorId,
					verb: "session_pause",
					reason: input.reason,
					targetKind: "session",
					targetId: input.sessionId,
					at: now,
					outcome: "succeeded",
					meta: null,
				})
				.run();

			return { ok: true as const, auditId, checkpointAt: now };
		},
		{ behavior: "immediate" },
	);
}

export function resumeSession(
	db: HyperIdleDb,
	input: { sessionId: string; actorId: string; reason?: string },
): SessionResumeResult {
	return db.transaction(
		(tx) => {
			const session = tx.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();
			if (!session) return { ok: false as const, reason: "not_found" as const };
			if (session.state !== "paused") {
				return { ok: false as const, reason: "not_paused" as const };
			}

			const now = new Date().toISOString();
			const auditId = crypto.randomUUID();

			tx.update(sessions).set({ state: "running" }).where(eq(sessions.id, input.sessionId)).run();

			tx.insert(recoveryAudit)
				.values({
					id: auditId,
					actorId: input.actorId,
					verb: "session_resume",
					reason: input.reason ?? "(no reason)",
					targetKind: "session",
					targetId: input.sessionId,
					at: now,
					outcome: "succeeded",
					meta: null,
				})
				.run();

			return { ok: true as const, auditId, resumedAt: now };
		},
		{ behavior: "immediate" },
	);
}

/**
 * Append-only writer used by routes that need direct audit-row control
 * (e.g. rollback, where the outcome enum isn't known until the agent
 * runtime responds). The single source of truth — never write to
 * `recovery_audit` outside this service.
 */
export function appendRecoveryAudit(db: HyperIdleDb, opts: InsertAuditOpts): void {
	db.insert(recoveryAudit)
		.values({
			id: opts.id,
			actorId: opts.actorId,
			verb: opts.verb,
			reason: opts.reason,
			targetKind: opts.targetKind,
			targetId: opts.targetId,
			at: opts.at,
			outcome: opts.outcome,
			meta: opts.meta ?? null,
		})
		.run();
}
