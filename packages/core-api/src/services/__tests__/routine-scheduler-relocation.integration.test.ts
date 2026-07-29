/**
 * AU21 §9 Increment 4 (Wave A — GREEN): the routine-scheduler mechanism
 * relocated from `packages/agent-orchestration/dispatch/src/service.ts` into
 * `packages/core-api/routine/src/routine-scheduler.ts` — same package as
 * `routine-service.ts`, the only module permitted to read/write
 * `routines`/`routine_runs` (AU13). Per architecture.md §9 Increment 4 +
 * §13's `dispatch/src/service.ts` + `dispatch-bindings.ts` migration entries:
 *
 *   - `fireGenericRoutineInternal`, `fireBuiltinRoutineInternal`,
 *     `registerBuiltinRoutineHandlersInternal`, `isFactoryCostCapReached`,
 *     the four core-maintenance builtin bodies (`runPostBetRetro`,
 *     `runPortfolioRetro`, `runKnowledgePromotion`, `runKnowledgeDecay`) +
 *     `runPracticeMeetingRoutine` relocated VERBATIM (same behavior, new
 *     location) — this file proves the relocated functions work identically
 *     to their dispatch-owned predecessors, calling core-api Services
 *     (`work`/`conversation`/`knowledge`/`review`/`settings`) via an injected
 *     `RoutineSchedulerPorts` bag (Mechanism C — `composition-boundary-guard`
 *     hard-fails a Service package importing another Service directly, no
 *     allowlist, so `@hyperidle/routine` cannot import them itself), composed
 *     at `packages/core-api/src/services/routine-scheduler-bindings.ts` —
 *     the exact same wiring `DispatchPorts` used to carry for these fields.
 *   - `createDispatchOps`'s `DispatchOps` DROPS routine awareness entirely:
 *     no `fireRoutine` method, no `config.scheduler` branch, no
 *     `registerBuiltinRoutineHandlersInternal` registration inside `start()`.
 *     Dispatch keeps only assistant-turn + task-queue responsibilities.
 *
 * GREEN-phase note: the "dispatch sheds routine awareness" test now exercises
 * raw `dispatchOps.start` directly rather than `dispatch-test-helpers.ts`'s
 * `startDispatchEngine` — see that test's own inline comment for why (that
 * helper deliberately became a composite so
 * `builtin-routines.integration.test.ts`'s pre-existing, must-not-regress
 * event-reaction tests keep passing through the SAME helper name).
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
import { createAgentSelectionService } from "@hyperidle/agent-selection";
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
import { getTeamMembers } from "@hyperidle/org";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireBuiltinRoutine, fireGenericRoutine } from "@hyperidle/routine";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { BetStateChangedEvent, EventBus } from "@hyperidle/shared";
import { findUser, listUsers, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { seedTeamRoutines } from "../../__tests__/dispatch-test-helpers.js";
import { describe, expect, test } from "../../test-fixtures.js";
import { costOps } from "../cost-bindings.js";
import { dispatchOps } from "../dispatch-bindings.js";

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
				return { cost: { capMinor: cfg.cost.capMinor }, modelGateway: cfg.modelGateway };
			},
		},
		workIntents: { enqueueWorkIntent },
		cost: { getFactoryCostActual: (db: HyperIdleDb) => costOps.spend(db, { level: "factory" }) },
		agentSelection: createAgentSelectionService({
			users: {
				getUserById: (db, id) => findUser(db, { id }),
				listActiveAiUsersByTeams: (db, teamIds) =>
					listUsers(db, { teamIds, kind: "ai", status: "active" }),
			},
			teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
		}),
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
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Owner",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
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
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Builtin owner",
		role,
		status: "active",
		maxConcurrentSessions: 1,
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

	test("skips firing when the relocated isFactoryCostCapReached sees the cap breached", async ({
		db,
		eventBus,
	}) => {
		const { routineId } = await seedManualRoutine(db, "inc4-generic-capped");
		await updateServerConfig(db, { cost: { capMinor: 100 } });
		await db
			.insert(users)
			.values({
				id: "inc4-generic-capped-cost-agent",
				kind: "ai",
				name: "Cost agent",
				role: "builder",
				status: "active",
				costActual: 100,
				createdAt: NOW,
			})
			.onConflictDoUpdate({ target: users.id, set: { costActual: 100 } });
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());

		expect(result).toMatchObject({ fired: false, reason: "factory cost cap reached" });
	});
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

describe("dispatch sheds routine awareness", () => {
	test("dispatchOps no longer exposes fireRoutine — routine dispatch is core-api's own job now", () => {
		expect((dispatchOps as unknown as { fireRoutine?: unknown }).fireRoutine).toBeUndefined();
	});

	// @lore AU21 Increment 4 GREEN-phase fix: this test now calls `dispatchOps.start`
	// DIRECTLY (not the `dispatch-test-helpers.ts` `startDispatchEngine` composite).
	// `startDispatchEngine` deliberately became a composite that ALSO starts the
	// relocated `registerBuiltinRoutineReactions` — it is the "start the whole
	// engine for a test" helper `builtin-routines.integration.test.ts`'s
	// (pre-existing, must-not-regress) event-reaction tests rely on. Testing THIS
	// claim ("dispatchOps itself, in isolation, no longer wires any routine
	// reaction") requires exercising the raw `dispatchOps` object, not that
	// composite — otherwise this test and `builtin-routines.integration.test.ts`
	// assert opposite outcomes through the identically-named helper call. The
	// guarantee under test is unchanged (zero review rows after emitting
	// bet_state_changed through bare `dispatchOps.start`); only the entry point
	// is corrected.
	test("dispatchOps.start (raw, no composite helper) no longer wires a bet_state_changed -> builtin-routine reaction (relocated to core-api)", async ({
		db,
		eventBus,
	}) => {
		const teamId = "inc4-shed-team";
		const teamMembersId = "inc4-shed-tm";
		await db
			.insert(teams)
			.values({ id: teamId, name: "Shed team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: "inc4-shed-owner",
			kind: "ai",
			name: "Owner",
			role: "product_manager",
			status: "active",
			maxConcurrentSessions: 1,
			teamId: teamMembersId,
			createdAt: NOW,
		});
		await seedTeamRoutines(db, {
			teamId,
			ownerByRole: { product_manager: "inc4-shed-owner" },
			leadAgentId: "inc4-shed-owner",
		});
		await db.insert(bets).values({
			id: "inc4-shed-bet",
			teamId,
			description: "Ship X",
			appetite: "small",
			hypothesis: "Will work",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		const stop = await dispatchOps.start({ db, eventBus });
		try {
			const shipped: BetStateChangedEvent = {
				type: "bet_state_changed",
				streamId: "inc4-shed-bet",
				betId: "inc4-shed-bet",
				fromState: "active",
				toState: "completed",
				timestamp: Date.now(),
			};
			eventBus.emit(shipped);
			await new Promise((r) => setTimeout(r, 50));

			const reviewRows = await db.select().from(items);
			expect(reviewRows).toHaveLength(0);
		} finally {
			stop();
		}
	});
});
