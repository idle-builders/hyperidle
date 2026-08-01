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
 *
 * @lore AU21 §9 Increment 5 (AC #7): the `review` field is gone — it only
 * ever carried `createPracticeMeeting` for the now-deleted
 * `builtin:practice-meeting` routine. `work`/`conversation`/`knowledge`/
 * `settings` are unchanged.
 */
import { insertThread, listThreads } from "@hyperidle/conversation";
import { type HyperIdleDb, type Routine, userSkills, type WriteExecutor } from "@hyperidle/db";
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
	selectRoutineDelegate,
	startRoutineScheduler as startRoutineSchedulerInternal,
} from "@hyperidle/routine";
import { isAgentAtCapacity } from "@hyperidle/run-orchestration";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/shared";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { costOps } from "./cost-bindings.js";

/**
 * AU21 §6 Decision F1 fold — the `userSkills` read `routine`'s own
 * `agent-delegation.ts` needs (`userSkills` is an `UNOWNED_SHARED_TABLES`
 * table — any Service may query it, but this composition root keeps the
 * read here so `selectRoutineDelegate`'s `listAgentIdsBySkill` port stays an
 * injected Mechanism-C capability, symmetric with `isAtCapacity`).
 */
function listAgentIdsBySkill(db: HyperIdleDb, skillId: string): Promise<readonly string[]> {
	return db
		.select({ agentId: userSkills.userId })
		.from(userSkills)
		.where(eq(userSkills.skillId, skillId))
		.then((rows) => rows.map((row) => row.agentId));
}

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
	settings: {
		readServerConfig: async (db) => {
			const cfg = await readServerConfig(db);
			return {
				cost: { capMinor: cfg.cost.capMinor },
				modelGateway: cfg.modelGateway,
				harnessDisabled: cfg.harnessDisabled,
			};
		},
	},
	workIntents: { enqueueWorkIntent },
	cost: {
		getFactoryCostActual: (db) => costOps.spend(db, { level: "factory" }),
	},
	agentSelection: {
		isAtCapacity: (db, agentId) =>
			isAgentAtCapacity(db, agentId, { getUserById: (execDb, id) => findUser(execDb, { id }) }),
		selectAgent: (input) =>
			selectRoutineDelegate(
				input.db,
				{
					listAgentIdsBySkill,
					isAtCapacity: (db, agentId) =>
						isAgentAtCapacity(db, agentId, {
							getUserById: (execDb, id) => findUser(execDb, { id }),
						}),
				},
				input,
			),
	},
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
