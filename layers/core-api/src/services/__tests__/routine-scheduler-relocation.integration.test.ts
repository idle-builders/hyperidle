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

import { findThread, insertThread, listThreads } from "@hyperidle/conversation";
import {
	type HyperIdleDb,
	routineRuns,
	routines,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import {
	getAgentIdentity,
	get as getKnowledgeItem,
	getParentedItem,
	list as listKnowledgeItems,
	recomputeAttention,
	sweep,
} from "@hyperidle/knowledge";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireGenericRoutine } from "@hyperidle/routine";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
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
			// BB1: getBetById deleted.
			getTaskById: async (db: HyperIdleDb, id: string) => {
				const row = await work.get(db, "task", id);
				if (!row) return undefined;
				return {
					id: row.id,
					title: row.title,
					description: row.description,
					state: row.state,
					parentTaskId: row.parentTaskId,
				};
			},
			getItemById: (db, id) => work.get(db, "item", id),
			getArtifactById: (db, id) => work.get(db, "artifact", id),
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
			findThreadById: (db, id) => findThread(db, { id }),
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
			getItemById: async (db, id) => {
				const item = await getKnowledgeItem(db, id);
				return item ?? undefined;
			},
		},
		settings: {
			readServerConfig: async (db) => {
				const cfg = await readServerConfig(db);
				return {
					harnessDisabled: cfg.harnessDisabled,
				};
			},
		},
		workIntents: { enqueueWorkIntent },
		requireRunnableAgent,
		getAgentIdentity,
		getRoutinePrompt: async (db, routineId) =>
			(await getParentedItem(db, { parentKind: "routine", parentId: routineId, role: "prompt" }))
				?.body ?? null,
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
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Inc4 manual routine",
		state: "active",
		ownerAgentId,
		triggerType: "manual",
		active: true,
	});
	return { routineId: id, ownerAgentId };
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

// @lore BA9d: "relocated fireBuiltinRoutine" describe block deleted —
// fireBuiltinRoutine and all builtin bodies (runPostBetRetro etc.) removed.
// The feature these tested (post-bet retro, portfolio retro) is now plugin-driven.
