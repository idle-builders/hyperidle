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
	type FactoryStateRow,
	factoryState,
	type HyperIdleDb,
	recoveryAudit,
	sessions,
	tasks,
} from "@hyperidle/db";
import { desc, eq, inArray } from "drizzle-orm";

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
	// @lore L7 (AI14/AI28): `paused` is `mode: "boolean"` notNull
	// default(false) so Drizzle returns a real boolean — no coercion
	// needed. The factory-paused-guard middleware reads `state.paused`
	// directly; if this ever changes back to a coerced int, the guard
	// must be revisited.
	return {
		paused: row.paused,
		pausedBy: row.pausedBy,
		pausedAt: row.pausedAt,
		pausedReason: row.pausedReason,
	};
}

export function readFactoryState(db: HyperIdleDb): FactoryStateView {
	const row = db.select().from(factoryState).where(eq(factoryState.id, FACTORY_SINGLETON_ID)).get();
	return viewOf(row);
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

			// L7 AC2: kill pauses every running session AND blocks queued
			// tasks. The whole sweep runs inside the BEGIN IMMEDIATE
			// transaction so a concurrent task/session creator cannot slip
			// past the kill — the running-set is frozen for the duration.
			//
			// Each affected session gets a `pause_checkpoint` JSON snapshot
			// stamped with `pausedByKill: true` so factory-resume can
			// distinguish "paused by the kill switch" (auto-restore) from
			// "paused mid-session by a founder" (stays paused — must be
			// resumed individually). Mirrors the §3 plan and the spec
			// validation scenario in TRACK-L.md L7.
			// @lore L7 (ARCH1): the canonical session-state literal is
			// `'active'` per PROCESS_LAYER.md and every other production
			// reader (sessions-routes.ts, session-lifecycle.ts, etc.). The
			// kill cascade and resume restore use `'active'` so they
			// integrate with the rest of the codebase. Sessions seeded
			// with any other literal are not picked up by the cascade.
			const runningSessionRows = tx
				.select({ id: sessions.id })
				.from(sessions)
				.where(eq(sessions.state, "active"))
				.all();
			const sessionIds = runningSessionRows.map((r) => r.id);

			if (sessionIds.length > 0) {
				const checkpointJson = JSON.stringify({
					priorState: "active",
					pausedByKill: true,
					at: now,
				});
				tx.update(sessions)
					.set({ state: "paused", pauseCheckpoint: checkpointJson })
					.where(inArray(sessions.id, sessionIds))
					.run();
			}

			// L7 AC2: queued tasks (state='accepted') flip to 'hold' so
			// the scheduler sees them as paused-out-of-band. Their prior
			// state is recorded on the audit row's `meta.affected.tasks`
			// list (id + priorState) so resume can flip exactly the rows
			// the kill flipped — no others.
			const queuedTaskRows = tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.state, "accepted"))
				.all();
			const taskIds = queuedTaskRows.map((r) => r.id);
			if (taskIds.length > 0) {
				tx.update(tasks)
					.set({ state: "hold", updatedAt: now })
					.where(inArray(tasks.id, taskIds))
					.run();
			}

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
					meta: JSON.stringify({
						affected: {
							sessions: sessionIds,
							tasks: taskIds.map((id) => ({ id, priorState: "accepted" })),
						},
					}),
				})
				.run();

			return {
				ok: true as const,
				auditId,
				pausedAt: now,
				affected: { sessions: sessionIds.length, tasks: taskIds.length },
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

			// L7 AC2: restore every session whose pause_checkpoint marks
			// it as paused-by-kill, and every task that the kill flipped
			// from `accepted` to `hold`. Mid-session pauses (no
			// `pausedByKill` marker) stay paused — they require an
			// explicit per-session resume.
			//
			// We identify the kill-paused rows by reading the JSON
			// checkpoint directly on `sessions` (durable across
			// re-pause/resume cycles). For tasks we read the most-recent
			// `factory_pause` audit row's meta — tasks have no per-row
			// checkpoint column.
			const restoredSessions: string[] = [];
			const candidateRows = tx
				.select({ id: sessions.id, checkpoint: sessions.pauseCheckpoint })
				.from(sessions)
				.where(eq(sessions.state, "paused"))
				.all();
			for (const row of candidateRows) {
				if (!row.checkpoint) continue;
				try {
					const parsed = JSON.parse(row.checkpoint) as {
						pausedByKill?: boolean;
						priorState?: string;
					};
					if (parsed.pausedByKill === true) {
						restoredSessions.push(row.id);
					}
				} catch {
					// Malformed JSON — skip; session remains paused and the
					// founder can resume it individually.
				}
			}
			if (restoredSessions.length > 0) {
				tx.update(sessions)
					.set({ state: "active", pauseCheckpoint: null })
					.where(inArray(sessions.id, restoredSessions))
					.run();
			}

			// Restore tasks the kill flipped to `hold`. Pull the freshest
			// `factory_pause` audit row's meta.affected.tasks list and
			// flip each back to its priorState (only if the row is still
			// in `hold` — a founder may have manually moved it since).
			//
			// @lore L7 (AI4): use desc().limit(1) — `factory_pause` rows
			// accumulate without bound, so a full-table scan would grow
			// linearly with kill-switch usage. Mirrors the pattern in
			// threads.ts:301-304 (rollback guard).
			const latest = tx
				.select({ meta: recoveryAudit.meta })
				.from(recoveryAudit)
				.where(eq(recoveryAudit.verb, "factory_pause"))
				.orderBy(desc(recoveryAudit.at))
				.limit(1)
				.get();
			const restoredTaskIds: string[] = [];
			if (latest?.meta) {
				try {
					const parsed = JSON.parse(latest.meta) as {
						affected?: {
							tasks?: Array<{ id: string; priorState: string }>;
						};
					};
					const taskList = parsed.affected?.tasks ?? [];
					for (const t of taskList) {
						const taskRow = tx
							.select({ state: tasks.state })
							.from(tasks)
							.where(eq(tasks.id, t.id))
							.get();
						if (taskRow?.state === "hold") {
							tx.update(tasks)
								.set({ state: t.priorState, updatedAt: now })
								.where(eq(tasks.id, t.id))
								.run();
							restoredTaskIds.push(t.id);
						}
					}
				} catch {
					// Malformed audit meta — skip; tasks stay on hold and
					// the founder must move them manually.
				}
			}

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
					meta: JSON.stringify({
						restored: { sessions: restoredSessions, tasks: restoredTaskIds },
					}),
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

			// L7: per-session pause does NOT mark `pausedByKill`. The
			// checkpoint records `priorState` only so factory-resume
			// leaves these rows paused (only kill-paused rows auto-
			// restore).
			tx.update(sessions)
				.set({
					state: "paused",
					pauseCheckpoint: JSON.stringify({
						priorState: session.state,
						pausedByKill: false,
						at: now,
					}),
				})
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

			tx.update(sessions)
				.set({ state: "active", pauseCheckpoint: null })
				.where(eq(sessions.id, input.sessionId))
				.run();

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
