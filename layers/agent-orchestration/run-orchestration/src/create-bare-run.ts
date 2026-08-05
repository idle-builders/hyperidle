/**
 * AU26 B1a (§D-A's `sessions-routes.ts` split) — the legacy no-adapters session start.
 *
 * `POST /api/sessions` stays core-hosted (its handler gates on `tasks`, bakes
 * `users`/`server_config` and writes `explicit_session_starts`/
 * `agent_work_intents` — a two-sided table set, and §D-A rule 3 gives a
 * two-sided route exactly one legal host). But the branch that fires when the
 * composition root wired no adapter pool used to `db.insert(sessions)` straight
 * from the route file. The insert AND the `session_started` emit move here as
 * one operation — core asks the Layer that runs sessions to create the run
 * (§D-A rule 3's command form: a direct downward call, never an
 * `AgentOrchestrationPort` method — that door stays read-only).
 * `@hyperidle/run-orchestration` is already a core-api dependency, so no
 * package edge is added.
 *
 * @lore AU26 B1a: this is an ACCEPTED OVER-DELIVERY, not an AU26 requirement.
 * The repo-wide `sessions`-ownership programme was cut to AU28 mid-increment, so
 * `sessions` is still an unowned shared table and the route was under no
 * obligation to stop writing it. This had already landed and is green, and it is
 * a natural rider on the split AU26 does perform (`POST /` no longer shares a
 * file with the handlers that own the runtime), so it was kept rather than
 * reverted. If it ever regresses, the fallback is the direct insert — not more
 * port surface. See §D-A's "accepted as already built" note.
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
