/**
 * @lore Composition root for the routine scheduler (`@hyperidle/routine`'s
 * `routine-scheduler.ts`). `@hyperidle/routine` is a Service, so per
 * Mechanism C (`composition-boundary-guard`, mechanically enforced) it
 * cannot import `work`/`conversation`/`knowledge`/`settings` directly —
 * every one of those, plus the one genuinely against-grain (`core-api →
 * agent-orchestration`) dependency (`enqueueWorkIntent` via
 * `@hyperidle/session-requests`), is wired here. `fireRoutine`, the
 * builtin-routine-handler registration, and the scheduler startup all live
 * in this module; every call site (`server-factory.ts`,
 * `routes/routines-routes.ts`) reaches them through
 * `fireRoutine`/`startRoutineScheduler`/`registerBuiltinRoutineReactions`.
 *
 * There is no `review` field on this module's ports — no builtin routine
 * wired here needs `createPracticeMeeting`.
 */

import { insertThread, listThreads } from "@hyperidle/conversation";
import type { HyperIdleDb, Routine, WriteExecutor } from "@hyperidle/db";
import {
	assembleSessionKnowledge,
	list as listKnowledgeItems,
	recomputeAttention,
	sweep,
} from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import {
	fireBuiltinRoutine,
	fireGenericRoutine,
	isBuiltinRoutineId,
	type RoutineSchedulerConfig,
	type RoutineSchedulerPorts,
	registerBuiltinRoutineHandlers,
	startRoutineScheduler as startRoutineSchedulerInternal,
} from "@hyperidle/routine";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/event-bus";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";

/**
 * @lore AU19 Increment 3h (relocated from `dispatch-bindings.ts`, AU21 §9
 * Increment 4): collapses `knowledge-promotion`'s former
 * `buildAttentionService({db, eventBus, work, review}).recomputeScope(filter)`
 * wiring into a single bound call.
 */
async function recomputeAttentionForCandidates(
	db: HyperIdleDb,
	eventBus: EventBus,
	candidateIds: readonly string[],
) {
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
}

// @lore AU26 E3: this object was exported (was module-private) for AU21 K1's
// wiring-completeness test, which proved every one of the eight composition
// sites actually supplied the optional connections-bake dep. With the bake
// deleted there is no per-site wiring left to forget — the held-connection read
// happens once, at spawn, from one place — so that test is gone. The export
// stays because `routine-scheduler-bindings` is imported by name elsewhere.
export const routineSchedulerPorts: RoutineSchedulerPorts = {
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
		recomputeAttentionForCandidates,
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
	// AU21 §9 Increment 12 (Decision H3): wire the contextBundle bake deps
	// `resolveRoutineRunRequest` needs — a routine_run session's sandbox now
	// gets its ranked knowledge + routine/agent/team content baked at emit
	// time instead of `run-orchestration` reading it back at launch.
	getTeamById: (db: HyperIdleDb, id: string) => getTeam(db, { id }),
	assembleSessionKnowledge,
};

/** Bound wrapper — starts the cron/due-eval scheduler with the real ports. */
export function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	config: RoutineSchedulerConfig,
): ReturnType<typeof startRoutineSchedulerInternal> {
	return startRoutineSchedulerInternal(db, eventBus, routineSchedulerPorts, config);
}

/** Bound wrapper — registers the `bet_state_changed` → post-bet-retro reaction. */
export function registerBuiltinRoutineReactions(db: HyperIdleDb, eventBus: EventBus): () => void {
	return registerBuiltinRoutineHandlers(db, eventBus, routineSchedulerPorts);
}

export interface FireRoutineResult {
	fired: boolean;
	reason?: string;
	runId?: string;
	sessionId?: string;
	emitted?: readonly string[];
	extra?: Record<string, unknown>;
}

/**
 * Bound routine-firing dispatcher — builtin vs generic, same decision
 * `dispatchOps.fireRoutine` used to make (relocated verbatim, now core-api-
 * side). The manual-trigger route (`routines-routes.ts`) and test helpers
 * (`dispatch-test-helpers.ts`) are this function's real callers.
 */
export function fireRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	opts?: {
		readonly args?: { readonly betId: string };
		readonly recordSkippedRun?: boolean;
	},
): Promise<FireRoutineResult> {
	if (isBuiltinRoutineId(routine.id)) {
		return fireBuiltinRoutine(db, eventBus, routineSchedulerPorts, routine.id, opts?.args);
	}
	return fireGenericRoutine(db, eventBus, routine, routineSchedulerPorts, opts?.recordSkippedRun);
}
