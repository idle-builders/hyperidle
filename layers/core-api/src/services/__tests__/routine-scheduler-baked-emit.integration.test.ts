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
import type { EventBus } from "@hyperidle/event-bus";
import { list as listKnowledgeItems, recomputeAttention, sweep } from "@hyperidle/knowledge";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireGenericRoutine } from "@hyperidle/routine";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

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
				const createReviewItemForKnowledge = createReviewItem({
					conversation: { insertThread },
					work: { createItem: (exec, values) => work.create(exec, "item", values) },
				});
				const result = await recomputeAttention(
					{
						db,
						eventBus,
						work: {
							findItemByReasoningMarker: async (exec: WriteExecutor, marker: string) => {
								const rows = await work.list(exec, "item", { marker });
								return rows[0] ? { id: rows[0].id } : undefined;
							},
						},
						review: { createReviewItemForKnowledge, attentionReviewReasoningMarker },
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
	const teamMembersId = `${id}-members`;
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
		teamId: teamMembersId,
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
