/**
 * AU21 §9 Increment 4 (Wave A — GREEN): the routine-scheduler mechanism
 * relocated from `layers/agent-orchestration/dispatch/src/service.ts` into
 * `layers/core-api/routine/src/routine-scheduler.ts` — same package as
 * `routine-service.ts`, the only module permitted to read/write
 * `routines`/`routine_runs` (AU13). Per architecture.md §9 Increment 4 +
 * §13's `dispatch/src/service.ts` + `dispatch-bindings.ts` migration entries:
 *
 *   - `fireGenericRoutineInternal`, `fireBuiltinRoutineInternal`,
 *     `registerBuiltinRoutineHandlersInternal` (its `isFactoryCostCapReached`
 *     gate is itself HARD-DELETED by AU21 Increment 14a, no replacement),
 *     the four core-maintenance builtin bodies (`runPostBetRetro`,
 *     `runPortfolioRetro`, `runKnowledgePromotion`, `runKnowledgeDecay`) +
 *     `runPracticeMeetingRoutine` relocated VERBATIM (same behavior, new
 *     location) — this file proves the relocated functions work identically
 *     to their dispatch-owned predecessors, calling core-api Services
 *     (`work`/`conversation`/`knowledge`/`review`/`settings`) via an injected
 *     `RoutineSchedulerPorts` bag (Mechanism C — `composition-boundary-guard`
 *     hard-fails a Service package importing another Service directly, no
 *     allowlist, so `@hyperidle/routine` cannot import them itself), composed
 *     at `layers/core-api/src/services/routine-scheduler-bindings.ts` —
 *     the exact same wiring `DispatchPorts` used to carry for these fields.
 *   - `createDispatchOps`'s `DispatchOps` DROPS routine awareness entirely:
 *     no `fireRoutine` method, no `config.scheduler` branch, no
 *     `registerBuiltinRoutineHandlersInternal` registration inside `start()`.
 *     Dispatch keeps only assistant-turn + task-queue responsibilities.
 *
 * Protected invariant (architecture.md §14): `routine-scheduler.au15.integration.test.ts`
 * (AC-3d) keeps passing — it now exercises the relocated `fireGenericRoutine`
 * (via `dispatch-test-helpers.ts`'s unchanged-signature wrapper) with the
 * SAME guarantee (no permanent brick), not the dropped `dispatchOps.fireRoutine`.
 *
 * @lore AU21 §9 Increment 5 (AC #7): `runPracticeMeetingRoutine` — relocated
 * verbatim by Increment 4 above — is deleted entirely, no replacement
 * (Increment 0 ruling #5). This file's own dedicated practice-meeting test
 * and `makePorts()`'s `review.createPracticeMeeting` wiring are removed with
 * it; the post-bet-retro coverage above is unaffected.
 */

import { insertThread, listThreads } from "@hyperidle/conversation";
import {
	bets,
	type HyperIdleDb,
	items,
	routineRuns,
	routines,
	teamMembers,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { list as listKnowledgeItems, recomputeAttention, sweep } from "@hyperidle/knowledge";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireBuiltinRoutine, fireGenericRoutine } from "@hyperidle/routine";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/event-bus";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-28T00:00:00.000Z";

/**
 * Builds the SAME real ports `routine-scheduler-bindings.ts` composes — a
 * second, test-local wiring (rather than importing that module's private
 * `routineSchedulerPorts` singleton) so this test proves the relocated
 * functions work against real `work`/`conversation`/`knowledge`/`review`/
 * `settings` implementations, independent of the composition root's own
 * plumbing.
 */
function makePorts(): RoutineSchedulerPorts {
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
): Promise<{ readonly routineId: string; readonly ownerAgentId: string }> {
	const teamId = `${id}-team`;
	const ownerAgentId = `${id}-owner`;
	await db.insert(teams).values({ id: teamId, name: "Inc4 team", phase: "build", createdAt: NOW });
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: `${teamId}-members`,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Owner",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Inc4 manual routine",
		teamId,
		state: "active",
		ownerAgentId,
		triggerType: "manual",
		active: true,
	});
	return { routineId: id, ownerAgentId };
}

async function seedBuiltinOwner(
	db: HyperIdleDb,
	role: string,
	agentId: string,
	teamId: string,
): Promise<void> {
	await db
		.insert(teams)
		.values({ id: teamId, name: "Inc4 builtin team", phase: "build", createdAt: NOW });
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: `${teamId}-members`,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Builtin owner",
		role,
		status: "active",
		createdAt: NOW,
	});
}

describe("relocated fireGenericRoutine", () => {
	test("fires a manual routine identically to the dispatch-owned original: records a running run + a routine_run work intent", async ({
		db,
		eventBus,
	}) => {
		const { routineId } = await seedManualRoutine(db, "inc4-generic-1");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());

		expect(result.fired).toBe(true);
		const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("running");
	});

	// @lore AU21 Increment 14a: "skips firing when the relocated
	// isFactoryCostCapReached sees the cap breached" is HARD-DELETED —
	// the factory cost-cap gate no longer exists, no replacement.
});

describe("relocated fireBuiltinRoutine", () => {
	test("post-bet-retro: creates a review item via ordinary core-api imports (conversation + work), no DispatchPorts", async ({
		db,
		eventBus,
	}) => {
		const teamId = "inc4-pbr-team";
		await seedBuiltinOwner(db, "product_manager", "inc4-pbr-owner", teamId);
		await db.insert(routines).values({
			id: "builtin:post-bet-retro",
			name: "Post-bet retro",
			teamId,
			state: "active",
			ownerAgentId: "inc4-pbr-owner",
			triggerType: "event",
			triggerConfig: JSON.stringify({ eventType: "bet_state_changed" }),
			active: true,
		});
		await db.insert(bets).values({
			id: "inc4-pbr-bet",
			teamId,
			description: "Ship the relocation",
			appetite: "small",
			hypothesis: "Relocating the scheduler changes nothing observable.",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		const result = await fireBuiltinRoutine(db, eventBus, makePorts(), "builtin:post-bet-retro", {
			betId: "inc4-pbr-bet",
		});

		expect(result.fired).toBe(true);
		const reviewRows = await db.select().from(items);
		expect(reviewRows).toHaveLength(1);
		expect(reviewRows[0]?.kind).toBe("review");
		expect(reviewRows[0]?.body ?? "").toContain(
			"Relocating the scheduler changes nothing observable.",
		);
		const runs = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, "builtin:post-bet-retro"));
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("success");
	});
});
