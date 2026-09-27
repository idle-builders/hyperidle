/**
 * The `sessions` table's accessors. This Service owns the table, so every read
 * and write from outside the package comes through here.
 *
 * These are deliberately not a repository: each one is a specific question the
 * layer above already asked, moved verbatim.
 *
 * The wire contract does NOT move with them. Nothing here imports
 * `@hyperidle/api-contract`; the routes keep their `satisfies AgentRun*Response`
 * assertions, so a divergence between an accessor's shape and the wire fails at
 * compile time on the wire's own side.
 */

import { type HyperIdleDb, type Session, sessions } from "@hyperidle/db";
import type { SessionOutcome } from "@hyperidle/domain-model";
import type { EventBus, SessionEndedEvent } from "@hyperidle/event-bus";
import { and, desc, eq, inArray } from "drizzle-orm";

/** Full row by id; `undefined` on a miss. */
export async function findSessionById(
	db: HyperIdleDb,
	sessionId: string,
): Promise<Session | undefined> {
	const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
	return row;
}

/**
 * `search_sessions`'s own filter: `ids`/`taskId`/`agentIds`/`state`,
 * newest first, `limit` always resolved by the caller (the
 * action's own default-100 lives in `session-actions.ts`, not here — this
 * accessor never guesses a default).
 *
 * @lore AU44 batch6's note above (agentId filter and limit/offset paging
 * dropped, no caller used them) no longer holds: the session module's
 * `search_sessions` action is that caller now, and it needs every field
 * back.
 */
export interface SessionSearchFilter {
	readonly ids?: readonly string[];
	readonly taskId?: string;
	readonly agentIds?: readonly string[];
	readonly state?: string;
	readonly limit: number;
	readonly offset?: number;
}

/** Full rows, filtered by whichever fields the caller supplies. Newest first. */
export async function listSessions(
	db: HyperIdleDb,
	filter: SessionSearchFilter,
): Promise<Session[]> {
	const conditions = [];
	if (filter.ids && filter.ids.length > 0) conditions.push(inArray(sessions.id, [...filter.ids]));
	if (filter.taskId) conditions.push(eq(sessions.taskId, filter.taskId));
	if (filter.agentIds && filter.agentIds.length > 0) {
		conditions.push(inArray(sessions.agentId, [...filter.agentIds]));
	}
	if (filter.state) conditions.push(eq(sessions.state, filter.state));

	const query = db
		.select()
		.from(sessions)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(sessions.startedAt))
		.limit(filter.limit);

	return filter.offset ? await query.offset(filter.offset) : await query;
}

/** Input for the no-live-runtime terminal transition. */
export interface EndSessionByCasInput {
	readonly sessionId: string;
	/**
	 * From the caller's pre-read row — the event payload, not a write.
	 *
	 * @lore Not nullable, unlike `taskId`: `sessions.agent_id` is `NOT NULL` and
	 * `SessionEndedEvent.agentId` is `string`. A run always has an agent; only
	 * the task is optional (assistant / subscription / knowledge runs have none).
	 */
	readonly agentId: string;
	/** From the caller's pre-read row — the event payload, not a write. */
	readonly taskId: string | null;
	readonly state: "done" | "crashed";
	/** Caller override for the PERSISTED outcome only; the event stays derived. */
	readonly outcome?: string;
	readonly notes?: string;
	readonly effectivenessScore?: number;
	readonly actor?: string;
	readonly now: string;
}

/**
 * End a session that has no live runtime: compare-and-set `active` → terminal,
 * emit `session_ended` if and only if that moved a row, and return the row as
 * it now stands.
 *
 * There is no `where` parameter and no other write door onto `sessions` outside
 * this package, so the `active` predicate cannot be bypassed; the emit sits
 * inside the same function as the CAS, gated on the same rowcount, so it cannot
 * fire for a session someone else already ended.
 *
 * @lore The persisted `outcome` and the emitted `outcome` are NOT the same
 * value. The row takes `input.outcome` when the caller supplies one; the event
 * always carries the value derived from `state`. This is verbatim of the route
 * this replaced, and it is asserted directly — collapsing them into one
 * variable is the obvious tidy-up and it is wrong.
 */
export async function endSessionByCas(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: EndSessionByCasInput,
): Promise<Session | undefined> {
	const { sessionId, state, now, actor } = input;
	const outcome: SessionOutcome = state === "crashed" ? "crashed" : "completed";

	const stateUpdates: Record<string, unknown> = {
		state,
		outcome: input.outcome ?? outcome,
		notes: input.notes,
		endedAt: now,
	};
	if (input.effectivenessScore !== undefined) {
		stateUpdates.effectivenessScore = input.effectivenessScore.toString();
		stateUpdates.effectivenessRecordedAt = now;
		stateUpdates.effectivenessRecordedBy = actor ?? input.agentId;
	}

	const transitioned = await db
		.update(sessions)
		.set(stateUpdates)
		.where(and(eq(sessions.id, sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });

	if (transitioned.length > 0) {
		eventBus.emit<"session_ended">({
			type: "session_ended",
			streamId: sessionId,
			sessionId,
			agentId: input.agentId,
			taskId: input.taskId,
			timestamp: Date.now(),
			outcome,
		} satisfies SessionEndedEvent);
	}

	return await findSessionById(db, sessionId);
}

/** Set `notes` and nothing else. */
export async function writeSessionNotes(
	db: HyperIdleDb,
	sessionId: string,
	notes: string,
): Promise<void> {
	await db.update(sessions).set({ notes }).where(eq(sessions.id, sessionId));
}

/**
 * @lore `stopSessionRun` — the ONE stop path both
 * doors use (`stop_session`'s action and `requestRunStopForTasks`'s kill
 * cascade). `abort` is injected, never imported — this package names
 * `@hyperidle/session-requests` only as a devDependency, so the caller's
 * composition root (which holds both packages) passes `sessionRunRegistry.
 * abort` in.
 *
 * 1. a terminal row -> `"already_ended"`, no write, no emit.
 * 2. `abort(sessionId)` true (a live runtime entry answered) -> `"aborted"`:
 *    write nothing, emit nothing — the provisioning teardown
 *    (`transition-run.ts`'s `endSession`) writes the terminal row and emits
 *    `session_ended` as it does for any other end (outcome "stopped" — a
 *    stop must never read as a clean "completed" finish, or the upward
 *    task-propagation path would move a task that was just killed).
 * 3. `abort` false (no live runtime entry — a restart, another process, an
 *    already-dead child) -> CAS `state='stopped'`/`outcome='stopped'`
 *    ourselves, guarded on `state='active'` exactly like
 *    `request-run-stop-for-tasks.ts`'s own disposition, and emit
 *    `session_ended` so the task page, agent health and subscription reactions
 *    see the same end -> `"marked"`.
 */
export async function stopSessionRun(
	db: HyperIdleDb,
	eventBus: EventBus,
	sessionId: string,
	abort: (sessionId: string) => Promise<boolean>,
): Promise<"aborted" | "marked" | "already_ended"> {
	const row = await findSessionById(db, sessionId);
	if (row?.state !== "active") return "already_ended";

	const wasAborted = await abort(sessionId);
	if (wasAborted) return "aborted";

	const now = new Date().toISOString();
	const updated = await db
		.update(sessions)
		.set({ state: "stopped", outcome: "stopped", endedAt: now })
		.where(and(eq(sessions.id, sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });
	if (updated.length === 0) return "already_ended";

	eventBus.emit<"session_ended">({
		type: "session_ended",
		streamId: sessionId,
		sessionId,
		agentId: row.agentId,
		taskId: row.taskId,
		timestamp: Date.now(),
		outcome: "stopped",
	} satisfies SessionEndedEvent);

	return "marked";
}
