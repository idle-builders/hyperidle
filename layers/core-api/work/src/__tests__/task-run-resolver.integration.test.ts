/**
 * AU21 Increment 3, session_start + task_run wave (RED) — architecture.md §6
 * Decision B's placement ruling: "`session_start`, `task_run` → resolvers
 * added to `layers/core-api/work/src/` ... `work` already owns
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
 * `layers/core-api/work/src/` (nor from its barrel, `@hyperidle/work`) —
 * this import fails to resolve at runtime.
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this new resolver — `resolveTaskRunRequest` is this wave's best-guess
 * interpretation (mirrors `resolveAssistantTurnRequest`'s naming), flagged
 * for reviewer confirmation.
 */

import { findThread } from "@hyperidle/conversation";
import {
	bets,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { requireRunnableAgent } from "@hyperidle/users";
import { eq } from "drizzle-orm";

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

		const baked = await resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-1" }, { requireRunnableAgent });

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
			resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-does-not-exist" }, { requireRunnableAgent }),
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
			resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-2" }, { requireRunnableAgent }),
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
			resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-3" }, { requireRunnableAgent }),
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
			resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-4" }, { requireRunnableAgent }),
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
			resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-5" }, { requireRunnableAgent }),
		).rejects.toThrow();
	});
});

/**
 * AU21 §9 Increment 12 (Decision H3), Wave B (RED) — `task_run` bakes a
 * `contextBundle` (`kind:"task"`) matching what `context.ts`'s pre-migration
 * `assembleContext`/`buildSessionContextData` used to assemble at launch:
 * task + bet + agent + team content, plus the ranked+budgeted knowledge
 * bundle (`@hyperidle/knowledge`'s `assembleSessionKnowledge`, Wave A).
 *
 * Currently RED two ways:
 *  - `npm run check`: `TaskRunResolverDeps` has no `getTeamById`/
 *    `assembleSessionKnowledge` fields yet — passing them as a 3rd-arg object
 *    literal is a TS2353 excess-property error.
 *  - `npm run test` (this file): `resolveTaskRunRequest`'s current
 *    implementation never sets `contextBundle` on its return — the field is
 *    `undefined`, so `toMatchObject` on it fails.
 *
 * @lore Mechanism C: `getTeamById`/`assembleSessionKnowledge` must be
 * INJECTED (not statically imported) — `@hyperidle/work`'s package.json
 * declares only `@hyperidle/db` + framework packages as dependencies
 * (composition-boundary-guard's Mechanism C), matching every sibling
 * resolver's `requireRunnableAgent` injection precedent. The real emit sites
 * (`task-state-machine.ts`, `bet-decomposition.ts`, `handoff-protocol.ts`) are
 * core-api Layer code, not nested Services, so they may legitimately import
 * both `@hyperidle/org` and `@hyperidle/knowledge` to wire the real
 * implementations in — this test does the same (test files are
 * guard-exempt — `scripts/composition-boundary-guard.ts` skips `__tests__/`).
 *
 * @lore Mechanism C also requires widening `TaskRunResolverDeps.requireRunnableAgent`'s
 * return type from `Promise<unknown>` to `Promise<User>` — the H2/Increment 11
 * precedent (`assistant-turn-resolver.ts`'s `agent.modelId`/`agent.modelProvider`
 * reuse) is to bake the agent's `name`/`role` from this SAME already-validated
 * row, not read it twice.
 */
describe("resolveTaskRunRequest — contextBundle baking (Increment 12 Wave B, RED)", () => {
	test("bakes a contextBundle (kind:'task') with task/bet/agent/team content + ranked knowledge", async ({
		db,
	}) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");

		await seedTeamAndBet(db, { teamId: "team-trun-ctx-1", betId: "bet-trun-ctx-1" });
		await db
			.update(bets)
			.set({ appetite: "2 weeks", doneCondition: "Shipped to prod" })
			.where(eq(bets.id, "bet-trun-ctx-1"));
		await seedAgent(db, "agent-trun-ctx-1");
		await seedTask(db, {
			taskId: "task-trun-ctx-1",
			betId: "bet-trun-ctx-1",
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

		// L4 (factory-wide) knowledge item — always in scope regardless of team.
		const now = new Date().toISOString();
		await db.insert(knowledgeItems).values({
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
		await db.insert(knowledgeAppProjection).values({
			id: "proj-trun-ctx-l4",
			knowledgeItemId: "item-trun-ctx-l4",
			layer: "L4",
			scopeId: null,
		});

		// RED (npm run check): `TaskRunResolverDeps` does not declare `getTeamById`/
		// `assembleSessionKnowledge` yet — this object literal is a genuine TS2353
		// excess-property error until Wave B's GREEN phase grows the interface.
		// Left uncast deliberately (no `any`/`as` — CLAUDE.md strict-TS rule): the
		// compile error itself IS the expected RED signal. Vitest's esbuild
		// transpile (type-erasure only, no type-check) still executes this file.
		const baked = await resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-ctx-1" }, {
			requireRunnableAgent,
			getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
			assembleSessionKnowledge,
		});

		const team = await getTeam(db, { id: "team-trun-ctx-1" });

		// RED (npm run check): `BakedTaskRunRequest` does not declare `contextBundle`
		// yet — `baked.contextBundle` is a genuine TS2339 "property does not exist"
		// error until Wave B's GREEN phase grows the return shape. Left as a direct
		// property access deliberately (no cast) — the compile error IS the RED
		// signal; vitest's transpile-only run still executes and evaluates it to
		// `undefined` at runtime, which `toMatchObject` below then fails on.
		expect(baked.contextBundle).toMatchObject({
			kind: "task",
			task: {
				id: "task-trun-ctx-1",
				title: "Task-run resolver task",
				description: "Ship the contextBundle wiring.",
				state: "accepted",
			},
			bet: {
				id: "bet-trun-ctx-1",
				description: "Task-run resolver bet",
				appetite: "2 weeks",
				doneCondition: "Shipped to prod",
			},
			agent: { id: "agent-trun-ctx-1", name: "Agent", role: "builder" },
			team: { id: "team-trun-ctx-1", name: team?.name },
			knowledge: expect.arrayContaining([expect.objectContaining({ id: "item-trun-ctx-l4" })]),
		});
	});
});

/**
 * AU27 Increment 1 (Decision 0/1) — `task_run` bakes `callingThreadId` via
 * `deps.resolveOrCreateCallingThread`, the injected resolve-or-create
 * (Mechanism C — `@hyperidle/work` cannot import `@hyperidle/conversation`
 * directly). The real production wiring is `resolveOrCreateCallingThread`
 * (`core-api/src/services/calling-thread-bindings.ts`); this test wires an
 * equivalent using the real `findThread`/`insertThread` exports (test files
 * are Mechanism C guard-exempt).
 */
describe("resolveTaskRunRequest — callingThreadId baking (Increment 1)", () => {
	async function resolveOrCreateCallingThreadForTest(
		db: HyperIdleDb,
		taskId: string,
		agentId: string,
	): Promise<string> {
		const { findThread, insertThread } = await import("@hyperidle/conversation");
		const existing = await findThread(db, { host: { kind: "task", id: taskId } });
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

	test("bakes callingThreadId by resolving-or-creating the task's thread", async ({ db }) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-thread-1", betId: "bet-trun-thread-1" });
		await seedAgent(db, "agent-trun-thread-1");
		await seedTask(db, {
			taskId: "task-trun-thread-1",
			betId: "bet-trun-thread-1",
			teamId: "team-trun-thread-1",
			ownerAgentId: "agent-trun-thread-1",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-thread-1",
			taskId: "task-trun-thread-1",
			agentId: "agent-trun-thread-1",
		});

		const baked = await resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-thread-1" }, {
			requireRunnableAgent,
			resolveOrCreateCallingThread: resolveOrCreateCallingThreadForTest,
		});

		expect(baked.callingThreadId).toBeDefined();
		const thread = await findThread(db, { host: { kind: "task", id: "task-trun-thread-1" } });
		expect(thread?.id).toBe(baked.callingThreadId);
	});

	test("reuses the SAME thread across two task_run bakes for the same task (idempotent)", async ({
		db,
	}) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-thread-2", betId: "bet-trun-thread-2" });
		await seedAgent(db, "agent-trun-thread-2");
		await seedTask(db, {
			taskId: "task-trun-thread-2",
			betId: "bet-trun-thread-2",
			teamId: "team-trun-thread-2",
			ownerAgentId: "agent-trun-thread-2",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-thread-2a",
			taskId: "task-trun-thread-2",
			agentId: "agent-trun-thread-2",
			status: "requested",
		});

		const firstBake = await resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-thread-2a" }, {
			requireRunnableAgent,
			resolveOrCreateCallingThread: resolveOrCreateCallingThreadForTest,
		});

		// A second bake against the SAME task must resolve the SAME calling
		// thread — never create a duplicate. Simulated by resolving directly
		// (the resolver itself is idempotent per-task, not per-attempt).
		const secondThreadId = await resolveOrCreateCallingThreadForTest(
			db,
			"task-trun-thread-2",
			"agent-trun-thread-2",
		);

		expect(secondThreadId).toBe(firstBake.callingThreadId);
	});

	test("bakes no callingThreadId when the dep is not supplied (call site not yet wired)", async ({
		db,
	}) => {
		const { resolveTaskRunRequest } = await import("../task-run-resolver.js");
		await seedTeamAndBet(db, { teamId: "team-trun-thread-3", betId: "bet-trun-thread-3" });
		await seedAgent(db, "agent-trun-thread-3");
		await seedTask(db, {
			taskId: "task-trun-thread-3",
			betId: "bet-trun-thread-3",
			teamId: "team-trun-thread-3",
			ownerAgentId: "agent-trun-thread-3",
		});
		await seedAttempt(db, {
			attemptId: "attempt-trun-thread-3",
			taskId: "task-trun-thread-3",
			agentId: "agent-trun-thread-3",
		});

		const baked = await resolveTaskRunRequest(db, { kind: "task_run", attemptId: "attempt-trun-thread-3" }, {
			requireRunnableAgent,
		});

		expect(baked.callingThreadId).toBeUndefined();
	});
});
