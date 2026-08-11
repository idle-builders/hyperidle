/**
 * AU21 Increment 3, session_start + task_run wave (RED) — architecture.md §6
 * Decision B / §9 Increment 3: `task_run` had THREE real emit call sites at
 * the time this wave shipped (all confirmed from source, not the single site
 * the wave's placement note names for `session_start`):
 *   1. `layers/core-api/work/src/task-state-machine.ts:120` — a task
 *      transitioning to "accepted" (via `POST /api/tasks/:id/transition`).
 *   2. `layers/core-api/work/src/bet-decomposition.ts` (REMOVED by AU21 §9
 *      Increment 10a / Decision I — the built-in bet_decomposition mechanism
 *      no longer exists, so this emit call site is gone, not migrated) — a
 *      newly decomposed task's initial dispatch.
 *   3. `layers/core-api/policy/src/handoff-protocol.ts:329` — an
 *      owner-handoff dispatch (via `POST /api/tasks/:id/handoff`).
 *
 * @lore CONFUSION (flagged for reviewer): the wave's own placement note reads
 * "the real emit call site (`routes/sessions-routes.ts:392`) calls the
 * appropriate resolver first" for BOTH `session_start` and `task_run` — true
 * only for `session_start`. `task_run` is never emitted from
 * `sessions-routes.ts` at all; its (then-three, now two) real call sites are
 * enumerated above, `task-state-machine.ts` inside `work` itself (same
 * package as the resolver, plain same-package import) and
 * `handoff-protocol.ts` inside the SIBLING `policy` package, which per
 * Mechanism C cannot import `@hyperidle/work` directly — it needs the
 * resolver injected via `PolicyDeps`, wired at the composition root
 * (`policy-bindings.ts`, which already imports `@hyperidle/work` directly,
 * exactly like `routes/threads.ts` imports both `@hyperidle/conversation` and
 * `@hyperidle/users`). This is a scope-completeness gap in the wave's
 * simplifying description, not a change to Decision B's placement ruling
 * (resolver home stays `layers/core-api/work/src/`) — resolved in-flight,
 * all real call sites were migrated this wave.
 *
 * Every scenario below is currently RED: `bakedRequestJson` is null on the
 * intent recorded by each real call site (none of them calls the
 * not-yet-existing `resolveTaskRunRequest` before recording), and the
 * drain still falls through to `resolveIntentInputInternal`'s "task_run" case
 * (proven by throwing-spy zero-domain-read assertions on the
 * `task-state-machine` and `handoff-protocol` paths).
 */

import {
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	sessions,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au21-task-run-emit";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

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
		description: "task_run baked-emit bet",
		status: "active",
		createdAt: now,
	});
}

async function seedAgent(db: HyperIdleDb, id: string, teamMembersId?: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		createdAt: new Date().toISOString(),
	});
}

describe("task_run is resolved and baked at emit time (three real call sites)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("via task-state-machine (POST /api/tasks/:id/transition)", () => {
		test("bakes the task_run request onto the recorded intent", async ({ db, app, ids }) => {
			await seedTeamAndBet(db, { teamId: ids("team-au21-trun-1"), betId: ids("bet-au21-trun-1") });
			await seedAgent(db, ids("agent-au21-trun-1"), `${ids("team-au21-trun-1")}-members`);
			await db.insert(tasks).values({
				id: ids("task-au21-trun-1"),
				betId: ids("bet-au21-trun-1"),
				teamId: ids("team-au21-trun-1"),
				ownerAgentId: ids("agent-au21-trun-1"),
				title: "task_run baked-emit task",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const res = await app.request(`/api/tasks/${ids("task-au21-trun-1")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(200);

			const [attempt] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.taskId, ids("task-au21-trun-1")));
			expect(attempt).toBeDefined();
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, attempt?.id ?? ""));
			expect(intent?.kind).toBe("task_run");

			// RED today: `bakedRequestJson` is null.
			expect(intent?.bakedRequestJson).toBeTruthy();
			const baked = intent?.bakedRequestJson
				? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
				: undefined;
			expect(baked).toMatchObject({
				defaultAgentId: ids("agent-au21-trun-1"),
				sourceKind: "task",
				sourceId: ids("task-au21-trun-1"),
				streamId: `task:${ids("task-au21-trun-1")}`,
				taskId: ids("task-au21-trun-1"),
				teamId: ids("team-au21-trun-1"),
				sourceCorrelation: { taskId: ids("task-au21-trun-1"), teamId: ids("team-au21-trun-1") },
			});
		});

		test("the drain hands off the real emitted task_run intent from its baked payload — ZERO work/users domain reads", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedTeamAndBet(db, { teamId: ids("team-au21-trun-2"), betId: ids("bet-au21-trun-2") });
			await seedAgent(db, ids("agent-au21-trun-2"), `${ids("team-au21-trun-2")}-members`);
			await db.insert(tasks).values({
				id: ids("task-au21-trun-2"),
				betId: ids("bet-au21-trun-2"),
				teamId: ids("team-au21-trun-2"),
				ownerAgentId: ids("agent-au21-trun-2"),
				title: "task_run baked-emit task",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const res = await app.request(`/api/tasks/${ids("task-au21-trun-2")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(200);
			const [attempt] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.taskId, ids("task-au21-trun-2")));

			// Zero domain reads: `DurableAgentQueueDeps` (AU21 §9 Increment 9,
			// forensic-triage wave) no longer HAS a `work.getTaskById`/
			// `users.getUserById` field at all — the type system itself makes
			// the old per-kind "task_run" resolution read unreachable, strictly
			// stronger than a runtime spy.
			const deps = { ...queueDeps(db), eventBus };

			await drainIntents(deps);

			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, attempt?.id ?? ""));
			expect(intent?.status).toBe("handed_off");
			expect(intent?.requestId).toBeTruthy();
		});
	});

	describe("via handoff-protocol (POST /api/tasks/:id/handoff)", () => {
		async function seedHandoffWorld(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
			await seedTeamAndBet(db, { teamId: ids("team-au21-trun-4"), betId: ids("bet-au21-trun-4") });
			await seedAgent(db, ids("agent-au21-trun-4-source"), `${ids("team-au21-trun-4")}-members`);
			await seedAgent(db, ids("agent-au21-trun-4-target"), `${ids("team-au21-trun-4")}-members`);
			const now = new Date().toISOString();
			await db.insert(tasks).values({
				id: ids("task-au21-trun-4"),
				betId: ids("bet-au21-trun-4"),
				teamId: ids("team-au21-trun-4"),
				ownerAgentId: ids("agent-au21-trun-4-source"),
				title: "task_run baked-emit handoff task",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(threads).values({
				id: ids("thread-au21-trun-4"),
				hostKind: "task",
				hostId: ids("task-au21-trun-4"),
				initiatorId: ids("agent-au21-trun-4-source"),
				participants: JSON.stringify([ids("agent-au21-trun-4-source")]),
				lastActiveAt: now,
				createdAt: now,
			});
			await db
				.update(tasks)
				.set({ threadId: ids("thread-au21-trun-4") })
				.where(eq(tasks.id, ids("task-au21-trun-4")));
			await db.insert(sessions).values({
				id: ids("session-au21-trun-4"),
				taskId: ids("task-au21-trun-4"),
				agentId: ids("agent-au21-trun-4-source"),
				modelTier: "workhorse",
				startedAt: now,
				state: "active",
			});
		}

		test("bakes the task_run request onto the recorded intent", async ({ db, app, ids }) => {
			await seedHandoffWorld(db, ids);

			const res = await app.request(`/api/tasks/${ids("task-au21-trun-4")}/handoff`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					sessionId: ids("session-au21-trun-4"),
					toAgent: ids("agent-au21-trun-4-target"),
					reason: "Continue with target",
				}),
			});
			expect(res.status).toBe(200);

			const [attempt] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.taskId, ids("task-au21-trun-4")));
			expect(attempt).toBeDefined();
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, attempt?.id ?? ""));
			expect(intent?.kind).toBe("task_run");

			// RED today: `bakedRequestJson` is null.
			expect(intent?.bakedRequestJson).toBeTruthy();
			const baked = intent?.bakedRequestJson
				? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
				: undefined;
			expect(baked).toMatchObject({
				defaultAgentId: ids("agent-au21-trun-4-target"),
				sourceKind: "task",
				sourceId: ids("task-au21-trun-4"),
				streamId: `task:${ids("task-au21-trun-4")}`,
			});
		});

		test("the drain hands off the real emitted task_run intent from its baked payload — ZERO work/users domain reads", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			await seedHandoffWorld(db, ids);

			const res = await app.request(`/api/tasks/${ids("task-au21-trun-4")}/handoff`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					sessionId: ids("session-au21-trun-4"),
					toAgent: ids("agent-au21-trun-4-target"),
					reason: "Continue with target",
				}),
			});
			expect(res.status).toBe(200);
			const [attempt] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.taskId, ids("task-au21-trun-4")));

			// Zero domain reads: `DurableAgentQueueDeps` (AU21 §9 Increment 9,
			// forensic-triage wave) no longer HAS a `work.getTaskById`/
			// `users.getUserById` field at all — the type system itself makes
			// the old per-kind "task_run" resolution read unreachable, strictly
			// stronger than a runtime spy.
			const deps = { ...queueDeps(db), eventBus };

			await drainIntents(deps);

			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, attempt?.id ?? ""));
			expect(intent?.status).toBe("handed_off");
			expect(intent?.requestId).toBeTruthy();
		});
	});
});
