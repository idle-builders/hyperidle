/**
 * `resolveTaskRunRequest` (architecture.md §6, Decision B) — the emit-time
 * `task_run`/`session_start` resolver: loads the dispatch attempt and task,
 * validates the owner-agent match and runnability, and bakes the session
 * request (`sourceKind`, `streamId`, `contextBundle`, `callingThreadId`).
 */

import {
	documents,
	type HyperIdleDb,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionDocuments } from "@hyperidle/document";
import { getTeam, requireRunnableAgent } from "@hyperidle/user";
import { and, eq } from "drizzle-orm";
import { resolveTaskRunRequest } from "../task-run-resolver.js";

/**
 * `resolveAgentIdentityBody`'s own read
 * (`layers/core-api/src/services/task-run-resolver-bindings.ts`), by direct
 * table access — this file's fixture is `{db}` only, no composed
 * `search_documents` runner in scope (that lives in `layers/core-api/src`, a
 * different package this Service may not import — Mechanism C). No test
 * below seeds an `agent_file` document, so this always resolves `null`, same
 * as the deleted `@hyperidle/document`'s `getAgentIdentity` did here.
 */
async function getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null> {
	const [row] = await db
		.select()
		.from(documents)
		.where(
			and(
				eq(documents.parentKind, "agent"),
				eq(documents.parentId, agentId),
				eq(documents.slot, "agent_file"),
				eq(documents.status, "active"),
			),
		)
		.limit(1);
	return row?.body ?? null;
}

/** Every task needs a real thread (`tasks.thread_id` is NOT NULL). */
async function seedThreadForTask(db: HyperIdleDb, taskId: string): Promise<string> {
	const now = new Date().toISOString();
	const threadId = `thr-${taskId}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "team",
		hostId: "system:propagation",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	return threadId;
}

async function seedTeamAndRootTask(
	db: HyperIdleDb,
	options: { readonly teamId: string; readonly rootTaskId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: options.teamId, name: options.teamId, createdAt: now });
	const threadId = await seedThreadForTask(db, options.rootTaskId);
	await db.insert(tasks).values({
		id: options.rootTaskId,
		parentTaskId: null,
		teamId: options.teamId,
		title: "Task-run resolver bet",
		description: "Task-run resolver bet",
		state: "in_progress",
		threadId,
		createdAt: now,
		updatedAt: now,
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
		readonly rootTaskId: string;
		readonly teamId: string;
		readonly state?: string;
		readonly ownerAgentId?: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	const threadId = await seedThreadForTask(db, options.taskId);
	await db.insert(tasks).values({
		id: options.taskId,
		parentTaskId: options.rootTaskId,
		teamId: options.teamId,
		ownerAgentId: options.ownerAgentId ?? null,
		title: "Task-run resolver task",
		state: options.state ?? "accepted",
		threadId,
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
		readonly ordinal?: number;
		readonly occasion?: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(taskDispatchAttempts).values({
		id: options.attemptId,
		taskId: options.taskId,
		occasion: options.occasion ?? "accepted",
		agentId: options.agentId,
		ordinal: options.ordinal ?? 1,
		status: options.status ?? "requested",
		createdAt: now,
		updatedAt: now,
	});
}

describe("resolveTaskRunRequest — emit-time task_run resolver (work)", () => {
	test("bakes the full request for a valid attempt + task + runnable agent, matching resolveIntentInputInternal's shape", async ({
		db,
	}) => {
		await seedTeamAndRootTask(db, { teamId: "team-trun-1", rootTaskId: "bet-trun-1" });
		await seedAgent(db, "agent-trun-1");
		await seedTask(db, {
			taskId: "task-trun-1",
			rootTaskId: "bet-trun-1",
			teamId: "team-trun-1",
			ownerAgentId: "agent-trun-1",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-1",
			taskId: "task-trun-1",
			agentId: "agent-trun-1",
		});

		const baked = await resolveTaskRunRequest(
			db,
			{ kind: "task_run", attemptId: "attempt-trun-1" },
			{ requireRunnableAgent, getAgentIdentity },
		);

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
		await expect(
			resolveTaskRunRequest(
				db,
				{ kind: "task_run", attemptId: "attempt-does-not-exist" },
				{ requireRunnableAgent, getAgentIdentity },
			),
		).rejects.toThrow();
	});

	test("rejects a dispatch attempt that is no longer 'requested'", async ({ db }) => {
		await seedTeamAndRootTask(db, { teamId: "team-trun-2", rootTaskId: "bet-trun-2" });
		await seedAgent(db, "agent-trun-2");
		await seedTask(db, {
			taskId: "task-trun-2",
			rootTaskId: "bet-trun-2",
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
			resolveTaskRunRequest(
				db,
				{ kind: "task_run", attemptId: "attempt-trun-2" },
				{ requireRunnableAgent, getAgentIdentity },
			),
		).rejects.toThrow();
	});

	test("rejects when the task is not in an agent-work-eligible state", async ({ db }) => {
		await seedTeamAndRootTask(db, { teamId: "team-trun-3", rootTaskId: "bet-trun-3" });
		await seedAgent(db, "agent-trun-3");
		await seedTask(db, {
			taskId: "task-trun-3",
			rootTaskId: "bet-trun-3",
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
			resolveTaskRunRequest(
				db,
				{ kind: "task_run", attemptId: "attempt-trun-3" },
				{ requireRunnableAgent, getAgentIdentity },
			),
		).rejects.toThrow();
	});

	test("rejects when the task owner changed after the dispatch attempt was created", async ({
		db,
	}) => {
		await seedTeamAndRootTask(db, { teamId: "team-trun-4", rootTaskId: "bet-trun-4" });
		await seedAgent(db, "agent-trun-4-attempt");
		await seedAgent(db, "agent-trun-4-new-owner");
		await seedTask(db, {
			taskId: "task-trun-4",
			rootTaskId: "bet-trun-4",
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
			resolveTaskRunRequest(
				db,
				{ kind: "task_run", attemptId: "attempt-trun-4" },
				{ requireRunnableAgent, getAgentIdentity },
			),
		).rejects.toThrow();
	});

	test("rejects when the attempt's agent is not a runnable AI agent", async ({ db }) => {
		await seedTeamAndRootTask(db, { teamId: "team-trun-5", rootTaskId: "bet-trun-5" });
		// A real user row (FK), but kind:"human" — fails the runnability check.
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
			rootTaskId: "bet-trun-5",
			teamId: "team-trun-5",
			ownerAgentId: "agent-trun-5-unrunnable",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-5",
			taskId: "task-trun-5",
			agentId: "agent-trun-5-unrunnable",
		});

		await expect(
			resolveTaskRunRequest(
				db,
				{ kind: "task_run", attemptId: "attempt-trun-5" },
				{ requireRunnableAgent, getAgentIdentity },
			),
		).rejects.toThrow();
	});
});

/**
 * `task_run` bakes a `contextBundle` (`kind:"task"`) — task + ancestors +
 * agent + team content, plus the ranked+budgeted document bundle
 * (`@hyperidle/document`'s `assembleSessionDocuments`). `getTeamById`/
 * `assembleSessionDocuments` are injected, not statically imported —
 * `@hyperidle/work`'s package.json declares only `@hyperidle/db` +
 * framework packages (composition-boundary-guard's Mechanism C); the real
 * emit sites (core-api Layer code) wire the real implementations in.
 */
describe("resolveTaskRunRequest — contextBundle baking", () => {
	test("bakes a contextBundle (kind:'task') with task/ancestors/agent/team content + ranked documents", async ({
		db,
	}) => {
		await seedTeamAndRootTask(db, { teamId: "team-trun-ctx-1", rootTaskId: "bet-trun-ctx-1" });
		await db
			.update(tasks)
			.set({ doneCondition: "Shipped to prod" })
			.where(eq(tasks.id, "bet-trun-ctx-1"));
		await seedAgent(db, "agent-trun-ctx-1");
		await seedTask(db, {
			taskId: "task-trun-ctx-1",
			rootTaskId: "bet-trun-ctx-1",
			teamId: "team-trun-ctx-1",
			ownerAgentId: "agent-trun-ctx-1",
		});
		await db
			.update(tasks)
			.set({ description: "Ship the contextBundle wiring." })
			.where(eq(tasks.id, "task-trun-ctx-1"));
		await seedAttempt(db, {
			attemptId: "attempt-trun-ctx-1",
			taskId: "task-trun-ctx-1",
			agentId: "agent-trun-ctx-1",
		});

		// L4 (factory-wide) document — always in scope regardless of team.
		const now = new Date().toISOString();
		await db.insert(documents).values({
			id: "item-trun-ctx-l4",
			scopeKind: "factory",
			scopeId: null,
			title: "Factory-wide practice",
			body: "Applies everywhere.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "agent-trun-ctx-1",
			createdAt: now,
			updatedAt: now,
		});

		const baked = await resolveTaskRunRequest(
			db,
			{ kind: "task_run", attemptId: "attempt-trun-ctx-1" },
			{
				requireRunnableAgent,
				getAgentIdentity,
				getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
				assembleSessionDocuments,
			},
		);

		const team = await getTeam(db, { id: "team-trun-ctx-1" });

		expect(baked.contextBundle).toMatchObject({
			kind: "task",
			task: {
				id: "task-trun-ctx-1",
				title: "Task-run resolver task",
				description: "Ship the contextBundle wiring.",
				state: "accepted",
			},
			// The ancestor chain is root first; this task sits one level down, so
			// the chain is exactly its parent.
			ancestors: [
				{
					id: "bet-trun-ctx-1",
					title: "Task-run resolver bet",
					description: "Task-run resolver bet",
					doneCondition: "Shipped to prod",
				},
			],
			agent: { id: "agent-trun-ctx-1", name: "Agent", role: "builder" },
			team: { id: "team-trun-ctx-1", name: team?.name },
			documents: expect.arrayContaining([expect.objectContaining({ id: "item-trun-ctx-l4" })]),
		});
	});
});

/**
 * There is no `resolveOrCreateCallingThread` or `calling-thread-bindings.ts`
 * — a task's thread is a real, `NOT NULL` column, so `callingThreadId` is
 * one read of `task.threadId`, never a resolve-or-create, and never
 * optional.
 */
describe("resolveTaskRunRequest — callingThreadId baking", () => {
	test("bakes callingThreadId from the task's own thread column", async ({ db }) => {
		await seedTeamAndRootTask(db, {
			teamId: "team-trun-thread-1",
			rootTaskId: "bet-trun-thread-1",
		});
		await seedAgent(db, "agent-trun-thread-1");
		await seedTask(db, {
			taskId: "task-trun-thread-1",
			rootTaskId: "bet-trun-thread-1",
			teamId: "team-trun-thread-1",
			ownerAgentId: "agent-trun-thread-1",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-thread-1",
			taskId: "task-trun-thread-1",
			agentId: "agent-trun-thread-1",
		});

		const baked = await resolveTaskRunRequest(
			db,
			{ kind: "task_run", attemptId: "attempt-trun-thread-1" },
			{ requireRunnableAgent, getAgentIdentity },
		);

		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-trun-thread-1"));
		expect(task?.threadId).toBeTruthy();
		expect(baked.callingThreadId).toBe(task?.threadId);
	});

	test("two task_run bakes for the same task carry the same callingThreadId", async ({ db }) => {
		await seedTeamAndRootTask(db, {
			teamId: "team-trun-thread-2",
			rootTaskId: "bet-trun-thread-2",
		});
		await seedAgent(db, "agent-trun-thread-2");
		await seedTask(db, {
			taskId: "task-trun-thread-2",
			rootTaskId: "bet-trun-thread-2",
			teamId: "team-trun-thread-2",
			ownerAgentId: "agent-trun-thread-2",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-thread-2a",
			taskId: "task-trun-thread-2",
			agentId: "agent-trun-thread-2",
			status: "requested",
		});
		// A second dispatch attempt on the same task+agent needs a distinct
		// `occasion` — `task_dispatch_attempts_occasion_uq` is unique on
		// (taskId, occasion, predecessorSessionId, agentId), so a plain repeat
		// of "accepted" with no predecessor session collides with the first.
		await seedAttempt(db, {
			attemptId: "attempt-trun-thread-2b",
			taskId: "task-trun-thread-2",
			agentId: "agent-trun-thread-2",
			status: "requested",
			ordinal: 2,
			occasion: "retry",
		});

		const firstBake = await resolveTaskRunRequest(
			db,
			{ kind: "task_run", attemptId: "attempt-trun-thread-2a" },
			{ requireRunnableAgent, getAgentIdentity },
		);
		const secondBake = await resolveTaskRunRequest(
			db,
			{ kind: "task_run", attemptId: "attempt-trun-thread-2b" },
			{ requireRunnableAgent, getAgentIdentity },
		);

		expect(secondBake.callingThreadId).toBe(firstBake.callingThreadId);
	});
});
