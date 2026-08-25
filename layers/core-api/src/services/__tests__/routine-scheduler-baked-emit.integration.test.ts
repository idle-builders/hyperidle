/**
 * AU21 §9 Increment 4, Wave B (RED) — architecture.md §6 Decision B step 1 +
 * §9 Increment 4's own paragraph: now that `fireGenericRoutine` (relocated to
 * `@hyperidle/routine` in Wave A) lives in the SAME package as
 * `routine-service.ts`, its emit call folds `resolveRoutineRunRequest`
 * (`routine-run-resolver.integration.test.ts`, this same wave) directly into
 * the SAME transaction that already inserts the `routineRuns` "running" row
 * and calls `enqueueWorkIntent` — the literal "same-package, same-transaction
 * call, not a cross-layer edge left to collapse at all" Decision B″ item 1
 * describes.
 *
 * Currently RED on every count below:
 *   1. `fireGenericRoutine` does not yet call the resolver at all — the
 *      `routine_run` work intent it enqueues today carries NO baked payload
 *      (`bakedRequestJson` is `null`).
 *   2. Because nothing is baked, `resolveIntentInputInternal`'s still-present
 *      "routine_run" case (session-requests/src/service.ts:758-795, NOT YET
 *      deleted by this wave's GREEN phase) is exactly what the drain falls
 *      through to — the zero-domain-read assertions below fail because the
 *      throwing spies on `deps.routine`/`deps.agentSelection` ARE invoked.
 *   3. `fireGenericRoutine` performs no target-agent runnability validation
 *      at emit time today — it unconditionally fires regardless of whether
 *      the resolved owner is runnable, so the "must not persist anything for
 *      an unrunnable target" test fails (a run row + an intent both persist
 *      today).
 */

import { insertThread, listThreads } from "@hyperidle/conversation";
import {
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	routineRuns,
	routines,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import type { EventBus, TaskStateChangedEvent } from "@hyperidle/event-bus";
import { list as listKnowledgeItems, recomputeAttention, sweep } from "@hyperidle/knowledge";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireGenericRoutine } from "@hyperidle/routine";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq, sql } from "drizzle-orm";
import { vi } from "vitest";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { startRoutineScheduler } from "../routine-scheduler-bindings.js";

const NOW = new Date().toISOString();

/**
 * Real ports, mirroring `routine-scheduler-relocation.integration.test.ts`'s
 * own `makePorts()` (Wave A) plus the one NEW field this wave's resolver
 * needs (`requireRunnableAgent`) — not yet declared on
 * `RoutineSchedulerPorts` (that widening is this wave's GREEN-phase job), so
 * this object is a structural superset of today's interface.
 */
function makePorts(): RoutineSchedulerPorts & {
	readonly requireRunnableAgent: typeof requireRunnableAgent;
} {
	return {
		work: {
			getBetById: (db, id) => work.get(db, "bet", id),
			createItem: (exec, values) => work.create(exec, "item", values),
			findRetroItemByThreadIds: async (db, threadIds, marker) => {
				const rows = await work.list(db, "item", { threadIds, bodyMarker: marker });
				return rows[0] ? { id: rows[0].id } : undefined;
			},
		},
		conversation: {
			getThreadIdsByHost: (db, hostKind, hostId) =>
				listThreads(db, { host: { kind: hostKind, id: hostId } }).then((ts) => ts.map((t) => t.id)),
			insertThread,
		},
		knowledge: {
			runAutoPromotionSweep: (db, eventBus) => sweep(db, eventBus, "autoPromotion"),
			runStaleSweep: (db, eventBus, nowMs, thresholdMs, options) =>
				sweep(db, eventBus, "stale", { nowMs, thresholdMs, ...options }),
			listRecentByLayers: (db, layers, since) =>
				listKnowledgeItems(db, { recentByLayers: { layers, since } }),
			recomputeAttentionForCandidates: async (
				db: HyperIdleDb,
				eventBus: EventBus,
				candidateIds: readonly string[],
			) => {
				const result = await recomputeAttention(
					{
						db,
						eventBus,
						work: {
							findItemByReasoningMarker: async (exec: WriteExecutor, marker: string) => {
								const rows = await work.list(exec, "item", { marker });
								return rows[0] ? { id: rows[0].id } : undefined;
							},
							createItem: (exec, values) => work.create(exec, "item", values),
						},
						conversation: { insertThread },
					},
					{ filter: { ids: candidateIds as string[] } },
				);
				if (!("ok" in result)) throw new Error("unexpected attention result");
				return result;
			},
		},
		settings: {
			readServerConfig: async (db) => {
				const cfg = await readServerConfig(db);
				return {
					modelGateway: cfg.modelGateway,
					harnessDisabled: cfg.harnessDisabled,
				};
			},
		},
		workIntents: { enqueueWorkIntent },
		requireRunnableAgent,
	};
}

async function seedManualRoutine(
	db: HyperIdleDb,
	id: string,
	opts: { readonly ownerStatus?: string } = {},
): Promise<{ readonly routineId: string; readonly teamId: string; readonly ownerAgentId: string }> {
	const teamId = `${id}-team`;
	const ownerAgentId = `${id}-owner`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Baked-emit team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Owner",
		role: "builder",
		status: opts.ownerStatus ?? "active",
		teamId: teamId,
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Baked-emit manual routine",
		teamId,
		state: "active",
		ownerAgentId,
		triggerType: "manual",
		active: true,
	});
	return { routineId: id, teamId, ownerAgentId };
}

describe("fireGenericRoutine — emit-time resolve-at-emit + collapse the drain (routine_run)", () => {
	test("bakes the full resolved request onto the enqueued routine_run intent", async ({
		db,
		eventBus,
	}) => {
		const { routineId } = await seedManualRoutine(db, "inc4b-baked-1");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());

		expect(result.fired).toBe(true);
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, result.runId ?? ""));
		expect(intent).toBeDefined();
		expect(intent?.bakedRequestJson).toBeTruthy();
		const baked = intent?.bakedRequestJson ? JSON.parse(intent.bakedRequestJson) : undefined;
		expect(baked).toMatchObject({
			defaultAgentId: `${routineId}-owner`,
			sourceKind: "routine",
			sourceId: result.runId,
			streamId: `routine:${routineId}`,
		});
	});

	test("drainIntents uses the baked payload directly, performing ZERO routine/users domain reads", async ({
		db,
		eventBus,
	}) => {
		const { routineId } = await seedManualRoutine(db, "inc4b-baked-2");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());
		expect(result.fired).toBe(true);

		// AU21 §9 Increment 9: `DurableAgentQueueDeps.routine`
		// (`getRoutineRunById`/`getRoutineById`) is REMOVED entirely — confirmed
		// zero real call sites anywhere in `@hyperidle/session-requests` (same
		// verification bar as the Decision F1 `agentSelection` removal noted
		// below). There is no `deps.routine.*` domain-read surface left at all
		// for the drain to reach — the type system itself is the proof, a
		// stronger guarantee than the throwing-spy wiring this test originally
		// used.
		// @lore AU21 §6 Decision F1: `DurableAgentQueueDeps.agentSelection`
		// (previously asserted zero-invocation here too) was REMOVED as dead
		// weight — confirmed zero real call sites in `service.ts` before
		// removal, so there is nothing left here to wire a throwing spy onto.
		const deps = { ...queueDeps(db), eventBus };

		await drainIntents(deps, { maxAttempts: 1 });

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, result.runId ?? ""));
		expect(intent?.status).toBe("handed_off");
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, intent?.requestId ?? ""));
		expect(request).toMatchObject({ agentId: `${routineId}-owner` });
	});

	test("does not persist a run or an intent when the resolved target agent is not runnable", async ({
		db,
		eventBus,
	}) => {
		const { routineId } = await seedManualRoutine(db, "inc4b-unrunnable", {
			ownerStatus: "retired",
		});
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());

		expect(result.fired).toBe(false);
		const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(runs).toHaveLength(0);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceKind, "routine_run"));
		const forThisRoutine = intents.filter((i) => i.sourceId.includes(routineId));
		expect(forThisRoutine).toHaveLength(0);
	});
});

/** Seed a team + a runnable AI owner, without inserting a routine — the caller controls the row. */
async function seedTeamAndOwner(
	db: HyperIdleDb,
	id: string,
	opts: { readonly ownerStatus?: string } = {},
): Promise<{ readonly teamId: string; readonly ownerAgentId: string }> {
	const teamId = `${id}-team`;
	const ownerAgentId = `${id}-owner`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "BA1 event-path team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Owner",
		role: "builder",
		status: opts.ownerStatus ?? "active",
		teamId,
		createdAt: NOW,
	});
	return { teamId, ownerAgentId };
}

/**
 * BA1 §9 "The one piece of end-to-end evidence" — extending this file to the
 * event path per architecture.md §9: start the scheduler FIRST, then insert
 * an event routine, then emit that event on the real bus. Cannot pass on
 * today's `registerEventTriggers`, which snapshots the routine list once
 * inside `startRoutineScheduler` and never looks again — the founder's
 * ruling (requirements.md Q2) that a routine takes effect on the very next
 * matching event with no restart.
 */
describe("BA1 D2 — event matching reads the database when the event happens", () => {
	test("an event routine inserted AFTER the scheduler starts fires on the very next matching event", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
		});
		try {
			const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba1-e2e");
			const configuredPrompt = "Say hello to the team, BA1 style.";
			const routineId = "ba1-e2e-routine";
			await db.insert(routines).values({
				id: routineId,
				name: "BA1 e2e routine",
				description: configuredPrompt,
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: "event",
				triggerConfig: JSON.stringify({ eventType: "task_state_changed" }),
				active: true,
			});

			const evt: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: "ba1-e2e-task",
				taskId: "ba1-e2e-task",
				fromState: "in_progress",
				toState: "done",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 1000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			expect(intent).toBeDefined();
			const baked = intent?.bakedRequestJson ? JSON.parse(intent.bakedRequestJson) : undefined;
			// D3: the bundle carries `routine.prompt`, not `routine.description`.
			expect(baked?.contextBundle?.routine?.prompt).toBe(configuredPrompt);
		} finally {
			scheduler.stop();
		}
	});
});

/**
 * BA1 §9 "The founder's two consequences, tested directly" — immediate stop.
 * Insert-after-start (same root cause as the e2e test above), fire once,
 * then pause/soft-delete and confirm no second run AND that the routine's
 * state is left exactly as the operator set it (never flipped to "error").
 */
describe("BA1 — immediate stop takes effect on the very next event, with no restart", () => {
	test("pausing an event routine stops it on the next matching event, without ever marking it errored", async ({
		db,
		eventBus,
		agentOrchestration,
		app,
	}) => {
		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
		});
		try {
			const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba1-stop-pause");
			const routineId = "ba1-stop-pause-routine";
			await db.insert(routines).values({
				id: routineId,
				name: "BA1 immediate-stop routine",
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: "event",
				triggerConfig: JSON.stringify({ eventType: "task_state_changed" }),
				active: true,
			});

			const evt: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: "ba1-stop-pause-task",
				taskId: "ba1-stop-pause-task",
				fromState: "in_progress",
				toState: "done",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 1000 },
			);

			const pauseRes = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ state: "paused" }),
			});
			expect(pauseRes.status).toBe(200);

			eventBus.emit({ ...evt, streamId: "ba1-stop-pause-task-2" });
			await new Promise((r) => setTimeout(r, 100));

			const runsAfterPause = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, routineId));
			expect(runsAfterPause).toHaveLength(1);

			const [routineAfterPause] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, routineId));
			expect(routineAfterPause?.state).toBe("paused");
		} finally {
			scheduler.stop();
		}
	});

	test("soft-deleting an event routine stops it on the next matching event", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
		});
		try {
			const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba1-stop-delete");
			const routineId = "ba1-stop-delete-routine";
			await db.insert(routines).values({
				id: routineId,
				name: "BA1 immediate-stop (delete) routine",
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: "event",
				triggerConfig: JSON.stringify({ eventType: "task_state_changed" }),
				active: true,
			});

			const evt: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: "ba1-stop-delete-task",
				taskId: "ba1-stop-delete-task",
				fromState: "in_progress",
				toState: "done",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 1000 },
			);

			await db
				.update(routines)
				.set({ deletedAt: new Date().toISOString(), state: "paused", active: false })
				.where(eq(routines.id, routineId));

			eventBus.emit({ ...evt, streamId: "ba1-stop-delete-task-2" });
			await new Promise((r) => setTimeout(r, 100));

			const runsAfterDelete = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, routineId));
			expect(runsAfterDelete).toHaveLength(1);
		} finally {
			scheduler.stop();
		}
	});
});

/**
 * BA1 §9 D9 — "A missing agent fails visibly to whoever configured it", plus
 * B1's paired negative. No production code today ever writes
 * `routines.state = "error"` (architecture.md §2.1), so the first test is
 * RED. The second documents that a paused/ineligible routine must NOT be
 * marked errored — today's `resolveRoutineRunRequest` already rejects that
 * case without persisting anything, so this half is the regression guard
 * D9's fix must not break.
 */
describe("BA1 D9 — a routine that cannot run says so, and a paused one is not an error", () => {
	test("firing with a non-runnable owner marks the routine errored with a reason, and does not re-attempt", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
		});
		try {
			const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba1-d9-unrunnable", {
				ownerStatus: "retired",
			});
			const routineId = "ba1-d9-unrunnable-routine";
			await db.insert(routines).values({
				id: routineId,
				name: "BA1 D9 unrunnable-owner routine",
				teamId,
				state: "active",
				ownerAgentId,
				triggerType: "event",
				triggerConfig: JSON.stringify({ eventType: "task_state_changed" }),
				active: true,
			});

			const evt: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: "ba1-d9-unrunnable-task",
				taskId: "ba1-d9-unrunnable-task",
				fromState: "in_progress",
				toState: "done",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
					expect(runs[0]?.outcome).toBe("error");
					expect(runs[0]?.errorMessage).toBeTruthy();
				},
				{ timeout: 1000 },
			);

			const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
			expect(routine?.state).toBe("error");
			expect(routine?.active).toBe(false);

			eventBus.emit({ ...evt, streamId: "ba1-d9-unrunnable-task-2" });
			await new Promise((r) => setTimeout(r, 100));

			const runsAfterSecondEmit = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, routineId));
			expect(runsAfterSecondEmit).toHaveLength(1);
		} finally {
			scheduler.stop();
		}
	});

	test("a paused routine is never marked errored, and no run row is written", async ({
		db,
		eventBus,
	}) => {
		const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba1-d9-paused");
		const routineId = "ba1-d9-paused-routine";
		await db.insert(routines).values({
			id: routineId,
			name: "BA1 D9 paused routine",
			teamId,
			state: "paused",
			ownerAgentId,
			triggerType: "manual",
			active: false,
		});
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());

		expect(result.fired).toBe(false);
		const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(runs).toHaveLength(0);
		const [routineAfter] = await db.select().from(routines).where(eq(routines.id, routineId));
		expect(routineAfter?.state).toBe("paused");
	});
});

/**
 * BA1 §9 "Cut 3" + the critique's required proof (round 3, item 2): the cut
 * must be demonstrated on the `"routine_run"` spelling specifically
 * (`agent_run_admission_failed`), not merely on the `"routine"`-spelled
 * `agent_run_lifecycle_changed` — NB1 was exactly a predicate that matched
 * one spelling and silently missed the other. No suppression mechanism
 * exists at all today, so a routine authored on its own admission failure
 * re-fires itself with no agent session in between — the tightest loop cut 3
 * exists to stop.
 */
describe("BA1 §3.1.1 cut 3 — self-trigger via the routine_run spelling (NB1)", () => {
	async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
		await db.execute(
			sql`drop trigger if exists ba1_reject_session_request_write on agent_session_requests`,
		);
		await db.execute(sql`
			create or replace function ba1_reject_session_request_write() returns trigger as $$
			begin raise exception 'BA1 injected agent_session_requests write failure (cut 3 vehicle)'; end;
			$$ language plpgsql
		`);
		await db.execute(sql`
			create trigger ba1_reject_session_request_write
			before insert on agent_session_requests
			for each row execute function ba1_reject_session_request_write()
		`);
	}

	test("a routine authored on its own admission failure re-fires itself today — cut 3 must stop this", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		// Seeded BEFORE the scheduler starts — deliberately isolating cut 3's
		// missing-suppression defect from D2's separate boot-time-cache defect
		// (covered by its own tests above). Both R and S must already be in
		// `registerEventTriggers`' one-time snapshot for either to be able to
		// react to the event at all under today's code.
		const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba1-cut3-r");
		const routineId = "ba1-cut3-r-routine";
		await db.insert(routines).values({
			id: routineId,
			name: "BA1 cut3 self-trigger routine",
			teamId,
			state: "active",
			ownerAgentId,
			triggerType: "event",
			triggerConfig: JSON.stringify({ eventType: "agent_run_admission_failed" }),
			active: true,
		});
		// A DIFFERENT routine on the SAME event — documents the cut's
		// narrowness: it must not become a blanket "no event a routine
		// emitted may re-trigger anything" rule.
		const { ownerAgentId: sOwnerId } = await seedTeamAndOwner(db, "ba1-cut3-s");
		const otherRoutineId = "ba1-cut3-s-routine";
		await db.insert(routines).values({
			id: otherRoutineId,
			name: "BA1 cut3 different-routine control",
			teamId,
			state: "active",
			ownerAgentId: sOwnerId,
			triggerType: "event",
			triggerConfig: JSON.stringify({ eventType: "agent_run_admission_failed" }),
			active: true,
		});

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
		});
		try {
			const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
			const first = await fireGenericRoutine(db, eventBus, routine!, makePorts());
			expect(first.fired).toBe(true);

			await rejectSessionRequestWrites(db);
			await drainIntents({ ...queueDeps(db), eventBus }, { maxAttempts: 1 });

			// The bug reproduces: R's OWN admission failure re-fires R.
			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs.length).toBeGreaterThanOrEqual(2);
				},
				{ timeout: 1000 },
			);

			// Cut 3's requirement: R may not re-trigger itself. RED today.
			const finalRuns = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, routineId));
			expect(finalRuns).toHaveLength(1);

			// Narrowness control: S, a DIFFERENT routine on the same event,
			// still gets a run from R's admission failure.
			const otherRuns = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, otherRoutineId));
			expect(otherRuns.length).toBeGreaterThanOrEqual(1);

			await db.execute(
				sql`drop trigger if exists ba1_reject_session_request_write on agent_session_requests`,
			);
		} finally {
			scheduler.stop();
		}
	});
});
