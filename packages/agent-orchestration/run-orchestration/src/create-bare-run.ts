/**
 * AU26 B1a (§D-H #16) — the legacy no-adapters session start.
 *
 * `POST /api/sessions` stays core-hosted (its handler gates on `tasks`, bakes
 * `users`/`server_config` and writes `explicit_session_starts`/
 * `agent_work_intents` — a two-sided table set, and §D-A rule 3 gives a
 * two-sided route exactly one legal host). But the branch that fires when the
 * composition root wired no adapter pool used to `db.insert(sessions)` straight
 * from the route file, which is a core-api Layer write into a table
 * `run-orchestration` owns.
 *
 * The insert AND the `session_started` emit move here as one operation — core
 * asks orchestration to create the run (§D-A rule 3's command form: a direct
 * downward call, never a `AgentOrchestrationPort` method — that door stays
 * read-only). `@hyperidle/run-orchestration` is already a core-api dependency,
 * so no package edge is added.
 */

import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { EventBus, SessionStartedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

export interface CreateBareRunInput {
	readonly agentId: string;
	readonly taskId: string;
	readonly modelTier: string;
}

/**
 * Insert an `active` session row for an immediate, adapter-less start and emit
 * `session_started`. Returns the persisted row — the caller renders it as the
 * 201 body, so the shape is the whole `sessions` row, never a narrowing.
 */
export async function createBareRun(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: CreateBareRunInput,
): Promise<typeof sessions.$inferSelect> {
	const sessionId = crypto.randomUUID();
	const now = new Date().toISOString();

	await db.insert(sessions).values({
		id: sessionId,
		agentId: input.agentId,
		taskId: input.taskId,
		modelTier: input.modelTier,
		startedAt: now,
		state: "active",
	});

	eventBus.emit<"session_started">({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId: input.agentId,
		taskId: input.taskId,
		timestamp: Date.now(),
	} satisfies SessionStartedEvent);

	const [created] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
	if (!created) throw new Error(`createBareRun: session ${sessionId} was not persisted`);
	return created;
}
