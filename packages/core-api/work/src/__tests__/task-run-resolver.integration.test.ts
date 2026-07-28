/**
 * AU21 Increment 3, session_start + task_run wave (RED) — architecture.md §6
 * Decision B's placement ruling: "`session_start`, `task_run` → resolvers
 * added to `packages/core-api/work/src/` ... `work` already owns
 * `taskDispatchAttemptStore`, `work-service.ts:62`."
 *
 * This resolver must do EXACTLY what `resolveIntentInputInternal`'s
 * "task_run" case does today (`session-requests/src/service.ts:753-773`),
 * reading only `work`'s own tables (`taskDispatchAttempts` — an
 * `UNOWNED_SHARED_TABLES` table `work` already touches via
 * `taskDispatchAttemptStore`, and `tasks` — `work`-owned) plus the shared
 * `requireRunnableAgent` invariant:
 *   1. Load the dispatch attempt; reject if it does not exist or its status
 *      is not "requested".
 *   2. Load the task; reject if it does not exist or is not in an
 *      agent-work-eligible state (`ready`/`accepted`/`in_progress`).
 *   3. Reject if the task's `ownerAgentId` no longer matches the attempt's
 *      `agentId` (owner changed after the dispatch attempt was created).
 *   4. Validate runnability of the attempt's agent via the shared core-api
 *      helper.
 *   5. Bake the request: `defaultAgentId`, `sourceKind: "task"`, `sourceId`
 *      (the task id), `streamId: task:<taskId>`, `taskId`, `teamId`,
 *      `sourceCorrelation`.
 *
 * Currently RED: no `task-run-resolver.ts` module exists anywhere under
 * `packages/core-api/work/src/` (nor from its barrel, `@hyperidle/work`) —
 * this import fails to resolve at runtime.
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this new resolver — `resolveTaskRunRequest` is this wave's best-guess
 * interpretation (mirrors `resolveAssistantTurnRequest`'s naming), flagged
 * for reviewer confirmation.
 */

import {
	bets,
	type HyperIdleDb,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
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
		description: "Task-run resolver bet",
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
		readonly state?: string;
		readonly ownerAgentId?: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id: options.taskId,
		betId: options.betId,
		teamId: options.teamId,
		ownerAgentId: options.ownerAgentId ?? null,
		title: "Task-run resolver task",
		state: options.state ?? "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

async function seedAttempt(
	db: HyperIdleDb,
	options: {
		readonly attemptId: string;
		readonly taskId: string;
		readonly agentId: string;
		readonly status?: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(taskDispatchAttempts).values({
		id: options.attemptId,
		taskId: options.taskId,
		occasion: "accepted",
		agentId: options.agentId,
		ordinal: 1,
		status: options.status ?? "requested",
		createdAt: now,
		updatedAt: now,
	});
}

describe("resolveTaskRunRequest — emit-time task_run resolver (work)", () => {
	test("bakes the full request for a valid attempt + task + runnable agent, matching resolveIntentInputInternal's shape", async ({
		db,
	}) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-1", betId: "bet-trun-1" });
		await seedAgent(db, "agent-trun-1");
		await seedTask(db, {
			taskId: "task-trun-1",
			betId: "bet-trun-1",
			teamId: "team-trun-1",
			ownerAgentId: "agent-trun-1",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-1",
			taskId: "task-trun-1",
			agentId: "agent-trun-1",
		});

		const baked = await resolveTaskRunRequest(db, "attempt-trun-1", { requireRunnableAgent });

		expect(baked).toMatchObject({
			defaultAgentId: "agent-trun-1",
			sourceKind: "task",
			sourceId: "task-trun-1",
			streamId: "task:task-trun-1",
			taskId: "task-trun-1",
			teamId: "team-trun-1",
			sourceCorrelation: { taskId: "task-trun-1", teamId: "team-trun-1" },
		});
	});

	test("rejects a dispatch attempt that does not exist", async ({ db }) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await expect(
			resolveTaskRunRequest(db, "attempt-does-not-exist", { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects a dispatch attempt that is no longer 'requested'", async ({ db }) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-2", betId: "bet-trun-2" });
		await seedAgent(db, "agent-trun-2");
		await seedTask(db, {
			taskId: "task-trun-2",
			betId: "bet-trun-2",
			teamId: "team-trun-2",
			ownerAgentId: "agent-trun-2",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-2",
			taskId: "task-trun-2",
			agentId: "agent-trun-2",
			status: "running",
		});

		await expect(
			resolveTaskRunRequest(db, "attempt-trun-2", { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects when the task is not in an agent-work-eligible state", async ({ db }) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-3", betId: "bet-trun-3" });
		await seedAgent(db, "agent-trun-3");
		await seedTask(db, {
			taskId: "task-trun-3",
			betId: "bet-trun-3",
			teamId: "team-trun-3",
			ownerAgentId: "agent-trun-3",
			state: "done",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-3",
			taskId: "task-trun-3",
			agentId: "agent-trun-3",
		});

		await expect(
			resolveTaskRunRequest(db, "attempt-trun-3", { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects when the task owner changed after the dispatch attempt was created", async ({
		db,
	}) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-4", betId: "bet-trun-4" });
		await seedAgent(db, "agent-trun-4-attempt");
		await seedAgent(db, "agent-trun-4-new-owner");
		await seedTask(db, {
			taskId: "task-trun-4",
			betId: "bet-trun-4",
			teamId: "team-trun-4",
			// Owner reassigned after the attempt below was created.
			ownerAgentId: "agent-trun-4-new-owner",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-4",
			taskId: "task-trun-4",
			agentId: "agent-trun-4-attempt",
		});

		await expect(
			resolveTaskRunRequest(db, "attempt-trun-4", { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects when the attempt's agent is not a runnable AI agent", async ({ db }) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-5", betId: "bet-trun-5" });
		// `tasks.owner_agent_id` / `task_dispatch_attempts.agent_id` FK to
		// `users.id` — a real row must exist to satisfy the constraint. Seeded
		// as `kind: "human"` (not `"ai"`) so the row is real but still fails
		// the runnability check, same intent as the RED-phase author's
		// "deliberately do NOT seed as an AI agent" comment.
		await db.insert(users).values({
			id: "agent-trun-5-unrunnable",
			kind: "human",
			name: "Not An Agent",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await seedTask(db, {
			taskId: "task-trun-5",
			betId: "bet-trun-5",
			teamId: "team-trun-5",
			ownerAgentId: "agent-trun-5-unrunnable",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-5",
			taskId: "task-trun-5",
			agentId: "agent-trun-5-unrunnable",
		});

		await expect(
			resolveTaskRunRequest(db, "attempt-trun-5", { requireRunnableAgent }),
		).rejects.toThrow();
	});
});
