/**
 * AU21 Increment 3, session_start + task_run wave (RED) — architecture.md §6
 * Decision B's placement ruling: "`session_start`, `task_run` → resolvers
 * added to `packages/core-api/work/src/` (paired with
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
 * placement in `packages/core-api/work/src/` must not do. The resolver
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
 * `packages/core-api/work/src/` (nor from its barrel, `@hyperidle/work`) —
 * this import fails to resolve at runtime.
 */

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
	}) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-sstart-1", betId: "bet-sstart-1" });
		await seedAgent(db, "agent-sstart-1");
		await seedTask(db, { taskId: "task-sstart-1", betId: "bet-sstart-1", teamId: "team-sstart-1" });

		const baked = await resolveSessionStartRequest(
			db,
			{ taskId: "task-sstart-1", requestedAgentId: "agent-sstart-1" },
			{ requireRunnableAgent },
		);

		expect(baked).toMatchObject({
			defaultAgentId: "agent-sstart-1",
			sourceKind: "task",
			sourceId: "task-sstart-1",
			streamId: "task:task-sstart-1",
			taskId: "task-sstart-1",
			teamId: "team-sstart-1",
			sourceCorrelation: { taskId: "task-sstart-1", teamId: "team-sstart-1" },
		});
	});

	test("rejects a task that does not exist", async ({ db }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedAgent(db, "agent-sstart-missing-task");

		await expect(
			resolveSessionStartRequest(
				db,
				{ taskId: "task-does-not-exist", requestedAgentId: "agent-sstart-missing-task" },
				{ requireRunnableAgent },
			),
		).rejects.toThrow();
	});

	test("rejects when the requested agent is not a runnable AI agent", async ({ db }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-sstart-2", betId: "bet-sstart-2" });
		await seedTask(db, { taskId: "task-sstart-2", betId: "bet-sstart-2", teamId: "team-sstart-2" });
		// Deliberately do NOT seed "agent-sstart-2-unrunnable" — the resolver must
		// reload the real users row and reject, not trust the caller's id.

		await expect(
			resolveSessionStartRequest(
				db,
				{ taskId: "task-sstart-2", requestedAgentId: "agent-sstart-2-unrunnable" },
				{ requireRunnableAgent },
			),
		).rejects.toThrow();
	});

	test("rejects a retired (non-runnable-status) requested agent", async ({ db }) => {
		const { resolveSessionStartRequest } = await import("../session-start-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-sstart-3", betId: "bet-sstart-3" });
		await seedAgent(db, "agent-sstart-3-retired", { status: "retired" });
		await seedTask(db, { taskId: "task-sstart-3", betId: "bet-sstart-3", teamId: "team-sstart-3" });

		await expect(
			resolveSessionStartRequest(
				db,
				{ taskId: "task-sstart-3", requestedAgentId: "agent-sstart-3-retired" },
				{ requireRunnableAgent },
			),
		).rejects.toThrow();
	});
});
