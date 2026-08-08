/**
 * @lore Composition root for the routine scheduler (`@hyperidle/routine`'s
 * `routine-scheduler.ts`). `@hyperidle/routine` is a Service, so per
 * Mechanism C (`composition-boundary-guard`, mechanically enforced) it
 * cannot import `work`/`conversation`/`knowledge`/`settings` directly —
 * every one of those, plus the one genuinely against-grain (`core-api →
 * agent-orchestration`) dependency, is wired here. `fireRoutine`, the
 * builtin-routine-handler registration, and the scheduler startup all live
 * in this module; every call site (`service-bootstrap.ts`,
 * `routes/routines-routes.ts`) reaches them through
 * `fireRoutine`/`startRoutineScheduler`/`registerBuiltinRoutineReactions`.
 *
 * There is no `review` field on this module's ports — no builtin routine
 * wired here needs `createPracticeMeeting`.
 *
 * @lore AU31 §3.1/§3.2: the against-grain edge is now the seam
 * (`AgentOrchestrationPort`), not a direct `@hyperidle/session-requests`/
 * `@hyperidle/run-orchestration`/`@hyperidle/agent-run-config` import — and
 * the port is a per-composition VALUE, not an ambient global, so
 * `routineSchedulerPorts` can no longer be a module-level constant built at
 * import time. `buildRoutineSchedulerPorts(port)` is the factory; every
 * export below takes the port (or the built ports bag) as an explicit
 * parameter instead of closing over a module singleton.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
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
import { readServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/shared";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";

/**
 * AU26 G1 (architecture §D-L) / AU31 §3.1: `isAgentAtCapacity`'s bound
 * reader used to be composed from two DIRECT Service reads (`users` +
 * `agent-run-config`); the `agent-run-config` half is now
 * `AgentOrchestrationPort.runConfig.read`, so this reader is built per-port
 * inside `buildRoutineSchedulerPorts`, not at module scope. `users` stays a
 * direct read — `users` is core-api's own Service.
 */
function buildConcurrencyBoundReader(port: AgentOrchestrationPort): {
	getConcurrencyBound(
		execDb: HyperIdleDb,
		agentId: string,
	): Promise<{ readonly maxConcurrentSessions: number } | undefined>;
} {
	return {
		async getConcurrencyBound(execDb, agentId) {
			// AU26 G1: `users` answers "does this agent exist at all" (fail closed
			// if not); the seam answers "what is its `maxConcurrentSessions`" (the
			// port's own default when never configured).
			const user = await findUser(execDb, { id: agentId });
			if (!user) return undefined;
			const { maxConcurrentSessions } = await port.runConfig.read(agentId);
			return { maxConcurrentSessions };
		},
	};
}

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

/**
 * AU31 §3.1: the seam-backed capacity check — resolves the bound (fail
 * closed, `true`, when the agent does not exist — same semantics
 * `@hyperidle/run-orchestration`'s `isAgentAtCapacity` always had) then asks
 * the door for the active-session count comparison.
 */
async function isAtCapacityViaSeam(
	db: HyperIdleDb,
	agentId: string,
	port: AgentOrchestrationPort,
): Promise<boolean> {
	const bound = await buildConcurrencyBoundReader(port).getConcurrencyBound(db, agentId);
	if (!bound) return true;
	return port.runs.isAtCapacity(agentId, bound.maxConcurrentSessions);
}

/**
 * AU31 §3.2 — builds `RoutineSchedulerPorts` for ONE composition's port.
 * Replaces the former module-level `routineSchedulerPorts` constant: the
 * seam is a per-composition value now, so the ports bag can no longer be
 * built once at import time.
 */
export function buildRoutineSchedulerPorts(port: AgentOrchestrationPort): RoutineSchedulerPorts {
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
		// AU31 §3.1 site 8 / §3.2: seam-backed — `exec` is ignored (see
		// `AgentOrchestrationPort`'s builder), and this is called AFTER
		// `fireGenericRoutine`'s emit transaction commits, never inside it.
		workIntents: { enqueueWorkIntent: (_exec, input) => port.intents.submit(input) },
		agentSelection: {
			isAtCapacity: (db, agentId) => isAtCapacityViaSeam(db, agentId, port),
			selectAgent: (input) =>
				selectRoutineDelegate(
					input.db,
					{
						listAgentIdsBySkill,
						isAtCapacity: (db, agentId) => isAtCapacityViaSeam(db, agentId, port),
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
}

/** Bound wrapper — starts the cron/due-eval scheduler with the real ports. */
export function startRoutineScheduler(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	config: RoutineSchedulerConfig,
): ReturnType<typeof startRoutineSchedulerInternal> {
	return startRoutineSchedulerInternal(
		db,
		eventBus,
		buildRoutineSchedulerPorts(agentOrchestration),
		config,
	);
}

/** Bound wrapper — registers the `bet_state_changed` → post-bet-retro reaction. */
export function registerBuiltinRoutineReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): () => void {
	return registerBuiltinRoutineHandlers(
		db,
		eventBus,
		buildRoutineSchedulerPorts(agentOrchestration),
	);
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
	agentOrchestration: AgentOrchestrationPort,
	routine: Routine,
	opts?: {
		readonly args?: { readonly betId: string };
		readonly recordSkippedRun?: boolean;
	},
): Promise<FireRoutineResult> {
	const ports = buildRoutineSchedulerPorts(agentOrchestration);
	if (isBuiltinRoutineId(routine.id)) {
		return fireBuiltinRoutine(db, eventBus, ports, routine.id, opts?.args);
	}
	return fireGenericRoutine(db, eventBus, routine, ports, opts?.recordSkippedRun);
}
