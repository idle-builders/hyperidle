/**
 * @lore AU19 Increment 3h: `@hyperidle/dispatch`'s `createDispatchOps` needs
 * injected `work`/`routine`/`conversation`/`users`/`settings`/`model-gateway`
 * (ordinary downward), `agent-selection`/`run-orchestration`/
 * `session-requests`/`cost` (ordinary same-layer, still ports per Mechanism
 * C), `review`/`knowledge` (ordinary downward, two collapsed call shapes —
 * see `@hyperidle/dispatch`'s `ports.ts` top `@lore`), and `toolHandlers`/
 * `workspaceFactory` (INTERIM forward-references, wired to still-flat
 * `packages/server` files) ports. This module builds the bound singleton
 * ONCE, at the composition root, so every real call site (`app.ts`,
 * `server-factory.ts`, `routines.ts`, `tools/create-routine.ts`,
 * `tools/create-team.ts`, `routes/routines-routes.ts`,
 * `routes/dispatch-queue-routes.ts`, `routes/teams-routes.ts`, and the many
 * `__tests__` integration tests) imports the already-wired functions
 * unchanged — same factory-curry idiom as `cost-bindings.ts`/
 * `session-requests-bindings.ts`.
 *
 * `toolHandlers`/`workspaceFactory` wire to `tools/assistant-draft-registry.ts`/
 * `harness/local-sandbox-adapter.ts` — still-flat `packages/server` files
 * (not yet migrated, Increment 4). Each opaque-typed port method needs no
 * cast except `buildAssistantDraftRegistry`'s `ctx` (the one documented
 * boundary-crossing cast recovering the real wide `ToolContext` from
 * `DispatchToolContext`'s narrower Mechanism-C mirror — same established
 * idiom as `run-orchestration-bindings.ts`'s casts) — `DispatchToolContext`
 * is otherwise a strict, structurally compatible subset (missing-but-
 * optional fields are simply absent), and `LocalSandboxAdapter`'s zero-arg
 * constructor satisfies `create(): unknown` directly.
 */

import {
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	listThreads,
	updateThread,
} from "@hyperidle/conversation";
import type { AgentSessionRequest, HyperIdleDb, Routine, WriteExecutor } from "@hyperidle/db";
import type {
	AssistantTurnDeps,
	DispatchConfig,
	DispatchPorts,
	Disposer,
	FireResult,
	PostBetRetroArgs,
	TaskDispatcherDeps,
} from "@hyperidle/dispatch";
import { createDispatchOps } from "@hyperidle/dispatch";
import { LocalSandboxAdapter } from "@hyperidle/harness-registry";
import { list as listKnowledgeItems, recomputeAttention, sweep } from "@hyperidle/knowledge";
import { resolveModel } from "@hyperidle/model-gateway";
import { attentionReviewReasoningMarker, createReviewItem } from "@hyperidle/review";
import {
	getRoutine,
	insertRoutine,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	sumRunCost,
	updateRoutine,
} from "@hyperidle/routine";
import type { AgentWorkIntentKind } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type { EventBus, ToolContext } from "@hyperidle/shared";
import { buildAssistantDraftRegistry } from "@hyperidle/tool-handlers";
import { findUser, getOrCreateUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { createPracticeMeeting } from "../../knowledge/src/practice-meeting.js";
import { agentSelectionService } from "./agent-selection-bindings.js";
import { costOps } from "./cost-bindings.js";
import { executeAgentRunRequest } from "./run-orchestration-bindings.js";
import { recordAgentWorkIntent } from "./session-requests-bindings.js";
import { toolHandlersPorts } from "./tool-handlers-bindings.js";

/**
 * @lore AU19 Increment 3h: collapses `dispatch`'s former
 * `buildAttentionService({db, eventBus, work, review}).recomputeScope(filter)`
 * wiring into a single bound call.
 *
 * @lore AU20 Ag1a: explicit `DispatchAttentionRecomputeOutcome` return type
 * removed — structural compatibility is enforced via `DispatchPorts`; the
 * inferred return type from `buildAttentionService(...).recomputeScope(...)` is
 * structurally equivalent.
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

const dispatchPorts: DispatchPorts = {
	work: {
		listTasks: (exec: WriteExecutor, opts: { readonly state: string }) =>
			work.list(exec, "task", { state: opts.state }),
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
		createItem: (exec, values) => work.create(exec, "item", values),
		findRetroItemByThreadIds: async (exec: WriteExecutor, threadIds: string[], marker: string) => {
			const rows = await work.list(exec, "item", { threadIds, bodyMarker: marker });
			return rows[0] ? { id: rows[0].id } : undefined;
		},
	},
	routine: {
		insertRoutine,
		getRoutineById: getRoutine,
		insertRoutineRun,
		updateRoutineById: updateRoutine,
		findRunningRoutineRun: (db, routineId) =>
			listRoutineRuns(db, { routineId, running: true, limit: 1 }).then((runs) =>
				runs[0] ? { id: runs[0].id } : undefined,
			),
		listActiveRoutines: (db, opts) =>
			listRoutines(db, { active: true, triggerType: opts?.triggerType }),
		listScheduledRoutinesMissingNextRunAt: (db) =>
			listRoutines(db, { active: true, missingNextRunAt: true }),
		sumRoutineRunCostSince: (db, routineId, since) =>
			sumRunCost(db, { routineIds: [routineId], since, kind: "sum" }),
	},
	conversation: {
		insertMessage,
		listMessagesByThread: (exec, threadId, opts) =>
			listMessages(exec, {
				threadId,
				order: opts?.order,
				dir: opts?.dir,
			}),
		getThreadById: (exec, id) => findThread(exec, { id }),
		updateThread,
		getThreadIdsByHost: (exec, hostKind, hostId) =>
			listThreads(exec, { host: { kind: hostKind, id: hostId } }).then((ts) => ts.map((t) => t.id)),
		insertThread,
	},
	users: {
		getOrCreateUser,
		getUserById: (db, id) => findUser(db, { id }),
	},
	settings: {
		readServerConfig: async (db) => {
			const cfg = await readServerConfig(db);
			return { cost: { capMinor: cfg.cost.capMinor }, modelGateway: cfg.modelGateway };
		},
	},
	modelGateway: {
		resolveAgentModel: (agent, tierFallback, config, credentialResolver) =>
			resolveModel(
				{ kind: "agent", modelId: agent.modelId, modelProvider: agent.modelProvider, tierFallback },
				config,
				credentialResolver,
			),
		resolveModelTier: (tier, config, credentialResolver) =>
			resolveModel({ kind: "tier", tier }, config, credentialResolver),
	},
	// @lore AU20 Ag1b: `resolveAssistantFormation` dissolved — port now delegates
	// to `agentSelectionService.resolveScaffoldSpecs` with `trigger:"user_assistant"`.
	agentSelection: {
		resolveScaffoldSpecs: (request) => agentSelectionService.resolveScaffoldSpecs(request),
	},
	runOrchestration: {
		executeAgentRunRequest: (deps, request, options) =>
			executeAgentRunRequest(deps, request, options),
	},
	sessionRequests: {
		recordAgentWorkIntent: async (exec, input) => {
			const record = await recordAgentWorkIntent(exec, {
				kind: input.kind as AgentWorkIntentKind,
				sourceKind: input.sourceKind,
				sourceId: input.sourceId,
				requestedBy: input.requestedBy ?? undefined,
				idempotencyKey: input.idempotencyKey,
			});
			return { id: record.id, idempotencyKey: record.idempotencyKey };
		},
	},
	cost: {
		getFactoryCostActual: (db) => costOps.spend(db, { level: "factory" }),
	},
	// @lore AU20 Ag1a: `createPracticeMeetingBound` standalone function inlined —
	// contextual typing from `DispatchPorts["review"]` handles parameter types.
	// @lore AU20 Am9: `createPracticeMeeting` relocated to `@hyperidle/knowledge`.
	review: {
		createPracticeMeeting,
	},
	knowledge: {
		runAutoPromotionSweep: (db, eventBus) => sweep(db, eventBus, "autoPromotion"),
		runStaleSweep: (db, eventBus, nowMs, thresholdMs, options) =>
			sweep(db, eventBus, "stale", { nowMs, thresholdMs, ...options }),
		listRecentByLayers: (db, layers, since) =>
			listKnowledgeItems(db, { recentByLayers: { layers, since } }),
		recomputeAttentionForCandidates,
	},
	toolHandlers: {
		buildAssistantDraftRegistry: (ctx, params) =>
			buildAssistantDraftRegistry(ctx as ToolContext<HyperIdleDb>, params, toolHandlersPorts),
	},
	workspaceFactory: {
		create: () => new LocalSandboxAdapter(),
	},
};

export const dispatchOps = createDispatchOps(dispatchPorts);

/**
 * Bootstrap all dispatch lifecycle subscriptions in one call.
 * Absorbs the former `registerBuiltinRoutineHandlers` + `registerAssistantDispatcher` +
 * `registerTaskDispatcher` + `startRoutineScheduler` individual exports.
 *
 * @lore AU20 Ag1b: callers (server-factory.ts, app.ts) migrated to this single entry point.
 */
export function startDispatch(config: DispatchConfig): Promise<Disposer> {
	return dispatchOps.start(config);
}

/**
 * Execute one conversational assistant turn.
 * Backward-compat alias for `dispatchOps.runAssistantTurn` — renamed in the Ag1b collapse.
 */
export function executeAssistantRequest(
	deps: AssistantTurnDeps,
	request: AgentSessionRequest,
): Promise<void> {
	return dispatchOps.runAssistantTurn(deps, request);
}

/**
 * Fire a built-in routine by ID — loads the routine row, then delegates to `fireRoutine`.
 *
 * Backward-compat adapter: callers pass `routineId: string` (the old signature);
 * the new `fireRoutine` needs the full `Routine` row, so we load it here.
 */
export async function runBuiltinRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routineId: string,
	args?: PostBetRetroArgs,
): Promise<FireResult> {
	const routine = await dispatchPorts.routine.getRoutineById(db, routineId);
	if (!routine) {
		return { fired: false, reason: "routine not found" };
	}
	return dispatchOps.fireRoutine(db, eventBus, routine, { args });
}

/** Fire a generic (non-builtin) routine. Thin wrapper around `fireRoutine`. */
export function checkAndFireRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	runtimeDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">,
): Promise<FireResult> {
	return dispatchOps.fireRoutine(db, eventBus, routine, { runtimeDeps });
}

/** Provision the standard built-in routines for a newly created team. */
export function provisionTeamRoutines(
	db: HyperIdleDb,
	opts: { teamId: string; ownerByRole: Partial<Record<string, string>>; leadAgentId: string },
): Promise<void> {
	return dispatchOps.provisionTeamRoutines(db, opts);
}
