/**
 * AU21 Increment 3, session_start + task_run wave (RED) — architecture.md §6
 * Decision B's placement ruling: "`session_start`, `task_run` → resolvers
 * added to `layers/core-api/work/src/` (paired with
 * `routes/sessions-routes.ts`; `work` already owns `taskDispatchAttemptStore`,
 * `work-service.ts:62`)."
 *
 * This resolver must do the validation `resolveIntentInputInternal`'s
 * "session_start" case does today (`session-requests/src/service.ts:731-751`)
 * — MINUS the `explicitSessionStarts.status !== "requested"` re-check, which
 * this wave's design deliberately drops (see `@lore` below): reads
 * `explicitSessionStarts` only DRAIN-side re-validation was ever needed for
 * (staleness between intent creation and a LATER drain pass); at EMIT time
 * (`routes/sessions-routes.ts:392`) the row was just inserted in the SAME
 * transaction with `status: "requested"` by construction — re-reading it
 * would be a `work`-package read of a table `work` does not own
 * (`explicitSessionStarts` is `session-requests`-owned per
 * `table-ownership-guard.ts`'s `TABLE_OWNER` map), which this resolver's
 * placement in `layers/core-api/work/src/` must not do. The resolver
 * therefore takes the already-known `taskId`/`requestedAgentId` (both in the
 * caller's hand at emit time) instead of a `startId`, and validates ONLY what
 * genuinely needs a domain read: task existence (work's own table) + the
 * shared ast-`<userId>` runnability invariant.
 *
 * @lore CONFUSION (flagged for reviewer): this is a deliberate deviation from
 * a literal re-read-by-id mirror of `resolveIntentInputInternal`'s case (the
 * pattern `resolveAssistantTurnRequest` uses, re-reading `messages` by id) —
 * here a literal mirror would force a foreign-table read across the Table ACL
 * boundary. Reading only `work`'s own `tasks` table plus the caller-supplied,
 * just-created `requestedAgentId` is the table-ownership-respecting
 * equivalent; the caller (`routes/sessions-routes.ts`) has both values in hand
 * from the just-inserted `explicitSessionStarts` row in the SAME transaction,
 * so no staleness window exists between "insert the start" and "resolve the
 * request" the way there is between "intent created" and "a later drain pass
 * runs" (which is what the OLD status re-check guarded against).
 *
 * Currently RED: no `session-start-resolver.ts` module exists anywhere under
 * `layers/core-api/work/src/` (nor from its barrel, `@hyperidle/work`) —
 * this import fails to resolve at runtime.
 */

import { findThread } from "@hyperidle/conversation";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent } from "@hyperidle/users";

async function seedTeamAndBet(
	db: HyperIdleDb,
	options: { readonly teamId: string; readonly betId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: options.teamId, name: options.teamId, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: `${options.teamId}-members`,
		teamId: options.teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(bets).values({
		id: options.betId,
		teamId: options.teamId,
		description: "Session-start resolver bet",
		status: "active",
		createdAt: now,
	});
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly status?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: opts.status ?? "active",
		createdAt: new Date().toISOString(),
	});
}

async function seedTask(
	db: HyperIdleDb,
	options: {
		readonly taskId: string;
		readonly betId: string;
		readonly teamId: string;
		readonly ownerAgentId?: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id: options.taskId,
		betId: options.betId,
		teamId: options.teamId,
		ownerAgentId: options.ownerAgentId ?? null,
		title: "Session-start resolver task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

describe("resolveSessionStartRequest — emit-time session_start resolver (work)", () => {
	test("bakes the full request for a valid task + runnable agent, matching resolveIntentInputInternal's shape", async ({
		db,
		ids,
	}) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, { teamId: ids("team-sstart-1"), betId: ids("bet-sstart-1") });
		await seedAgent(db, ids("agent-sstart-1"));
		await seedTask(db, {
			taskId: ids("task-sstart-1"),
			betId: ids("bet-sstart-1"),
			teamId: ids("team-sstart-1"),
		});

		const baked = await resolveSessionStartRequest(
			db,
			{ taskId: ids("task-sstart-1"), requestedAgentId: ids("agent-sstart-1") },
			{ requireRunnableAgent },
		);

		expect(baked).toMatchObject({
			defaultAgentId: ids("agent-sstart-1"),
			sourceKind: "task",
			sourceId: ids("task-sstart-1"),
			streamId: `task:${ids("task-sstart-1")}`,
			taskId: ids("task-sstart-1"),
			teamId: ids("team-sstart-1"),
			sourceCorrelation: { taskId: ids("task-sstart-1"), teamId: ids("team-sstart-1") },
		});
	});

	test("rejects a task that does not exist", async ({ db, ids }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedAgent(db, ids("agent-sstart-missing-task"));

		await expect(
			resolveSessionStartRequest(
				db,
				{ taskId: ids("task-does-not-exist"), requestedAgentId: ids("agent-sstart-missing-task") },
				{ requireRunnableAgent },
			),
		).rejects.toThrow();
	});

	test("rejects when the requested agent is not a runnable AI agent", async ({ db, ids }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, { teamId: ids("team-sstart-2"), betId: ids("bet-sstart-2") });
		await seedTask(db, {
			taskId: ids("task-sstart-2"),
			betId: ids("bet-sstart-2"),
			teamId: ids("team-sstart-2"),
		});
		// Deliberately do NOT seed "agent-sstart-2-unrunnable" — the resolver must
		// reload the real users row and reject, not trust the caller's id.

		await expect(
			resolveSessionStartRequest(
				db,
				{ taskId: ids("task-sstart-2"), requestedAgentId: ids("agent-sstart-2-unrunnable") },
				{ requireRunnableAgent },
			),
		).rejects.toThrow();
	});

	test("rejects a retired (non-runnable-status) requested agent", async ({ db, ids }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, { teamId: ids("team-sstart-3"), betId: ids("bet-sstart-3") });
		await seedAgent(db, ids("agent-sstart-3-retired"), { status: "retired" });
		await seedTask(db, {
			taskId: ids("task-sstart-3"),
			betId: ids("bet-sstart-3"),
			teamId: ids("team-sstart-3"),
		});

		await expect(
			resolveSessionStartRequest(
				db,
				{ taskId: ids("task-sstart-3"), requestedAgentId: ids("agent-sstart-3-retired") },
				{ requireRunnableAgent },
			),
		).rejects.toThrow();
	});
});

/**
 * AU27 Increment 1 (Decision 0/1) — `session_start` bakes `callingThreadId`
 * via `deps.resolveOrCreateCallingThread`, the injected resolve-or-create
 * (Mechanism C — `@hyperidle/work` cannot import `@hyperidle/conversation`
 * directly). Mirrors `task-run-resolver.integration.test.ts`'s equivalent
 * suite.
 */
describe("resolveSessionStartRequest — callingThreadId baking (Increment 1)", () => {
	async function resolveOrCreateCallingThreadForTest(
		db: HyperIdleDb,
		taskId: string,
		agentId: string,
	): Promise<string> {
		const { findThread: find, insertThread } = await import("@hyperidle/conversation");
		const existing = await find(db, { host: { kind: "task", id: taskId } });
		if (existing) return existing.id;
		const threadId = crypto.randomUUID();
		const now = new Date().toISOString();
		await insertThread(db, {
			id: threadId,
			hostKind: "task",
			hostId: taskId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		return threadId;
	}

	test("bakes callingThreadId by resolving-or-creating the task's thread", async ({ db, ids }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, {
			teamId: ids("team-sstart-thread-1"),
			betId: ids("bet-sstart-thread-1"),
		});
		await seedAgent(db, ids("agent-sstart-thread-1"));
		await seedTask(db, {
			taskId: ids("task-sstart-thread-1"),
			betId: ids("bet-sstart-thread-1"),
			teamId: ids("team-sstart-thread-1"),
		});

		const baked = await resolveSessionStartRequest(
			db,
			{ taskId: ids("task-sstart-thread-1"), requestedAgentId: ids("agent-sstart-thread-1") },
			{ requireRunnableAgent, resolveOrCreateCallingThread: resolveOrCreateCallingThreadForTest },
		);

		expect(baked.callingThreadId).toBeDefined();
		const thread = await findThread(db, {
			host: { kind: "task", id: ids("task-sstart-thread-1") },
		});
		expect(thread?.id).toBe(baked.callingThreadId);
	});

	test("reuses the SAME thread across two session_start bakes for the same task (idempotent)", async ({
		db,
		ids,
	}) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, {
			teamId: ids("team-sstart-thread-2"),
			betId: ids("bet-sstart-thread-2"),
		});
		await seedAgent(db, ids("agent-sstart-thread-2"));
		await seedTask(db, {
			taskId: ids("task-sstart-thread-2"),
			betId: ids("bet-sstart-thread-2"),
			teamId: ids("team-sstart-thread-2"),
		});

		const first = await resolveSessionStartRequest(
			db,
			{ taskId: ids("task-sstart-thread-2"), requestedAgentId: ids("agent-sstart-thread-2") },
			{ requireRunnableAgent, resolveOrCreateCallingThread: resolveOrCreateCallingThreadForTest },
		);
		const second = await resolveSessionStartRequest(
			db,
			{ taskId: ids("task-sstart-thread-2"), requestedAgentId: ids("agent-sstart-thread-2") },
			{ requireRunnableAgent, resolveOrCreateCallingThread: resolveOrCreateCallingThreadForTest },
		);

		expect(second.callingThreadId).toBe(first.callingThreadId);
	});

	test("bakes no callingThreadId when the dep is not supplied", async ({ db, ids }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, {
			teamId: ids("team-sstart-thread-3"),
			betId: ids("bet-sstart-thread-3"),
		});
		await seedAgent(db, ids("agent-sstart-thread-3"));
		await seedTask(db, {
			taskId: ids("task-sstart-thread-3"),
			betId: ids("bet-sstart-thread-3"),
			teamId: ids("team-sstart-thread-3"),
		});

		const baked = await resolveSessionStartRequest(
			db,
			{ taskId: ids("task-sstart-thread-3"), requestedAgentId: ids("agent-sstart-thread-3") },
			{ requireRunnableAgent },
		);

		expect(baked.callingThreadId).toBeUndefined();
	});
});
