/**
 * The `sessions` table's accessors. This Service owns the table, so every read
 * and write from outside the package comes through here.
 *
 * These are deliberately not a repository: each one is a specific question the
 * layer above already asked, moved verbatim. `listRunSummaries` keeps its own
 * eight-column projection because that projection names `sessions.*` and
 * therefore cannot live in a route; the shaped reads (`countActiveRunsByAgent`,
 * `listLatestOutcomeByTask`) keep their reduce loops for the same reason — the
 * loop belongs with the query it interprets.
 *
 * The wire contract does NOT move with them. Nothing here imports
 * `@hyperidle/api-contract`; the routes keep their `satisfies AgentRun*Response`
 * assertions, so a divergence between an accessor's shape and the wire fails at
 * compile time on the wire's own side.
 */

import { type HyperIdleDb, type Session, sessions } from "@hyperidle/db";
import type { SessionEndedEvent, SessionOutcome } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { and, count, desc, eq, inArray } from "drizzle-orm";

/** Full row by id; `undefined` on a miss. */
export async function findSessionById(
	db: HyperIdleDb,
	sessionId: string,
): Promise<Session | undefined> {
	const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
	return row;
}

/** Full rows, filtered by whichever of the three fields the caller supplies. */
// @lore AU44 batch6: agentId filter and limit/offset paging dropped — the
// Conversations page queries task_id+state=active only; no caller uses agentId
// or paging. The function is a simple filtered select.
export async function listSessions(
	db: HyperIdleDb,
	filter: { readonly taskId?: string; readonly state?: string },
): Promise<Session[]> {
	const conditions = [];
	if (filter.taskId) conditions.push(eq(sessions.taskId, filter.taskId));
	if (filter.state) conditions.push(eq(sessions.state, filter.state));

	return conditions.length > 0
		? await db
				.select()
				.from(sessions)
				.where(and(...conditions))
		: await db.select().from(sessions);
}

/**
 * Active-run count per agent. `agentIds` undefined means every agent. Agents
 * with no active run are absent rather than zero, and a run with no agent is
 * dropped.
 */
export async function countActiveRunsByAgent(
	db: HyperIdleDb,
	agentIds?: readonly string[],
): Promise<Record<string, number>> {
	const rows = await db
		.select({ agentId: sessions.agentId, count: count() })
		.from(sessions)
		.where(
			agentIds === undefined
				? eq(sessions.state, "active")
				: and(eq(sessions.state, "active"), inArray(sessions.agentId, [...agentIds])),
		)
		.groupBy(sessions.agentId);
	const counts: Record<string, number> = {};
	for (const row of rows) {
		if (row.agentId) counts[row.agentId] = row.count;
	}
	return counts;
}

/**
 * The outcome of the newest run per task by `startedAt`. A task with no run is
 * absent from the map.
 */
export async function listLatestOutcomeByTask(
	db: HyperIdleDb,
	taskIds: readonly string[],
): Promise<Record<string, string | null>> {
	const rows = await db
		.select({ taskId: sessions.taskId, outcome: sessions.outcome })
		.from(sessions)
		.where(inArray(sessions.taskId, [...taskIds]))
		.orderBy(desc(sessions.startedAt));
	const outcomes: Record<string, string | null> = {};
	for (const row of rows) {
		// Ordered newest-first, so the first row seen per task is the latest.
		if (row.taskId !== null && !(row.taskId in outcomes)) outcomes[row.taskId] = row.outcome;
	}
	return outcomes;
}

/**
 * The eight fields every run-state render in the app actually consumes.
 *
 * @lore AU26 J4: deliberately NOT the session wire row's 18 columns.
 * `sandboxSnapshot`, `notes`, `requestId`, `routineId`, `modelTier`, the source
 * triple and the two remaining `effectivenessRecorded*` columns are consumed by
 * no screen and are not on this wire.
 */
const RUN_SUMMARY_COLUMNS = {
	id: sessions.id,
	agentId: sessions.agentId,
	taskId: sessions.taskId,
	startedAt: sessions.startedAt,
	endedAt: sessions.endedAt,
	state: sessions.state,
	outcome: sessions.outcome,
	effectivenessScore: sessions.effectivenessScore,
};

/** One run as the run-state screens read it. */
export interface RunSummary {
	readonly id: string;
	readonly agentId: string;
	readonly taskId: string | null;
	readonly startedAt: string;
	readonly endedAt: string | null;
	readonly state: string;
	readonly outcome: string | null;
	readonly effectivenessScore: string | null;
}

/** Run summaries for one task, or for a set of agents. Newest first. */
export async function listRunSummaries(
	db: HyperIdleDb,
	by: { readonly taskId: string } | { readonly agentIds: readonly string[] },
): Promise<RunSummary[]> {
	return await db
		.select(RUN_SUMMARY_COLUMNS)
		.from(sessions)
		.where(
			"taskId" in by ? eq(sessions.taskId, by.taskId) : inArray(sessions.agentId, [...by.agentIds]),
		)
		.orderBy(desc(sessions.startedAt));
}

/** Input for the no-live-runtime terminal transition. */
export interface EndSessionByCasInput {
	readonly sessionId: string;
	/**
	 * From the caller's pre-read row — the event payload, not a write.
	 *
	 * @lore Not nullable, unlike `taskId`: `sessions.agent_id` is `NOT NULL` and
	 * `SessionEndedEvent.agentId` is `string`. A run always has an agent; only
	 * the task is optional (assistant / routine / knowledge runs have none).
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
