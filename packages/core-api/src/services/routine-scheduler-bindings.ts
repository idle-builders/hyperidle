/**
 * @lore AU21 §9 Increment 4: composition root for the relocated routine
 * scheduler (`@hyperidle/routine`'s `routine-scheduler.ts` — moved from
 * `@hyperidle/dispatch`'s `service.ts` per architecture.md §6 Decision
 * B′/B″ ruling #4). `@hyperidle/routine` is a Service, so per Mechanism C
 * (`composition-boundary-guard`, mechanically enforced) it cannot import
 * `work`/`conversation`/`knowledge`/`review`/`settings` directly — every one
 * of those, plus the two genuinely against-grain (`core-api →
 * agent-orchestration`) dependencies (`enqueueWorkIntent` via
 * `@hyperidle/session-requests`, the factory cost-cap actual via
 * `@hyperidle/cost`'s `costOps`), is wired here — same idiom as
 * `dispatch-bindings.ts`'s former `dispatchPorts` object (this module
 * inherits that object's `work`/`conversation`/`knowledge`/`review` wiring
 * verbatim, since it is exactly the composition those four builtin-routine
 * bodies always needed).
 *
 * `dispatchOps` (`dispatch-bindings.ts`) no longer knows about routines at
 * all after this Increment — `fireRoutine`/the builtin-routine-handler
 * registration/the `scheduler` config branch all moved here. Every former
 * `dispatchOps.fireRoutine`/`dispatchOps.start({scheduler})` call site
 * (`server-factory.ts`, `routes/routines-routes.ts`,
 * `__tests__/dispatch-test-helpers.ts`) is repointed at this module's
 * `fireRoutine`/`startRoutineScheduler`/`registerBuiltinRoutineReactions`.
 */
import { insertThread, listThreads } from "@hyperidle/conversation";
import type { HyperIdleDb, Routine, WriteExecutor } from "@hyperidle/db";
import {
	createPracticeMeeting,
	list as listKnowledgeItems,
	recomputeAttention,
	sweep,
} from "@hyperidle/knowledge";
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
import type { EventBus } from "@hyperidle/shared";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { agentSelectionService } from "./agent-selection-bindings.js";
import { costOps } from "./cost-bindings.js";

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

const routineSchedulerPorts: RoutineSchedulerPorts = {
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
	review: {
		createPracticeMeeting,
	},
	settings: {
		readServerConfig: async (db) => {
			const cfg = await readServerConfig(db);
			return { cost: { capMinor: cfg.cost.capMinor }, modelGateway: cfg.modelGateway };
		},
	},
	workIntents: { enqueueWorkIntent },
	cost: {
		getFactoryCostActual: (db) => costOps.spend(db, { level: "factory" }),
	},
	agentSelection: {
		isAtCapacity: agentSelectionService.isAtCapacity,
		selectAgent: agentSelectionService.selectAgent,
	},
	requireRunnableAgent,
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
