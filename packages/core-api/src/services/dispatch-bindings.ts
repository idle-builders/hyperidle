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

import { resolveAssistantFormation } from "@hyperidle/agent-selection";
import {
	findThread,
	insertMessage,
	insertThread,
	listMessages,
	listThreads,
	updateThread,
} from "@hyperidle/conversation";
import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import type {
	DispatchAgentModelParams,
	DispatchAgentWorkIntentInput,
	DispatchAttentionRecomputeOutcome,
	DispatchAutoPromotionSweepResult,
	DispatchConsumeOptions,
	DispatchCreatePracticeMeetingInput,
	DispatchCreatePracticeMeetingResult,
	DispatchCredentialResolver,
	DispatchPorts,
	DispatchProvisionDeps,
	DispatchProvisionResult,
	DispatchStaleSweepResult,
	DispatchToolContext,
} from "@hyperidle/dispatch";
import { createDispatchOps } from "@hyperidle/dispatch";
import { LocalSandboxAdapter } from "@hyperidle/harness-registry";
import {
	archiveKnowledgeItemWithLogRaw,
	buildAttentionService,
	findKnowledgeAppProjectionByItemIdRaw,
	findKnowledgeItemByIdRaw,
	insertKnowledgeAppProjectionRaw,
	insertKnowledgeEditLogRaw,
	insertKnowledgeItemRaw,
	listCapturedItemsByProjectionScopeRaw,
	listRecentByLayers,
	runAutoPromotionSweep,
	runStaleSweep,
	touchKnowledgeItemUpdatedAtRaw,
	updateKnowledgeAppProjectionMetaIfUnchangedRaw,
} from "@hyperidle/knowledge";
import { resolveModel } from "@hyperidle/model-gateway";
import {
	attentionReviewReasoningMarker,
	buildCreateReviewItemForKnowledge,
	createPracticeMeeting,
	type PracticeMeetingKnowledgeStore,
} from "@hyperidle/review";
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
import {
	createItem,
	findItemByReasoningMarker,
	findRetroItemByThreadIds,
	getBetById,
	getTaskById,
	listTasks,
} from "@hyperidle/work";
import { getFactoryCostActual } from "./cost-bindings.js";
import { executeAgentRunRequest } from "./run-orchestration-bindings.js";
import { recordAgentWorkIntent } from "./session-requests-bindings.js";
import { toolHandlersPorts } from "./tool-handlers-bindings.js";

/**
 * @lore AU19 Increment 3h: collapses `dispatch`'s former
 * `practiceMeetingKnowledgeStore` construction (9 raw `@hyperidle/knowledge`
 * accessors) into a single bound `createPracticeMeeting(db, input)` call —
 * `dispatch` can no longer build this store itself (Mechanism C). Wired
 * exactly like `review`'s own Increment 1j wiring here, just relocated.
 */
const practiceMeetingKnowledgeStore: PracticeMeetingKnowledgeStore = {
	insertKnowledgeItem: insertKnowledgeItemRaw,
	insertKnowledgeAppProjection: insertKnowledgeAppProjectionRaw,
	insertKnowledgeEditLog: insertKnowledgeEditLogRaw,
	findKnowledgeItemById: findKnowledgeItemByIdRaw,
	findKnowledgeAppProjectionByItemId: findKnowledgeAppProjectionByItemIdRaw,
	updateKnowledgeAppProjectionMetaIfUnchanged: updateKnowledgeAppProjectionMetaIfUnchangedRaw,
	touchKnowledgeItemUpdatedAt: touchKnowledgeItemUpdatedAtRaw,
	listCapturedItemsByProjectionScope: listCapturedItemsByProjectionScopeRaw,
	archiveKnowledgeItemWithLog: archiveKnowledgeItemWithLogRaw,
};

function createPracticeMeetingBound(
	db: HyperIdleDb,
	input: DispatchCreatePracticeMeetingInput,
): Promise<DispatchCreatePracticeMeetingResult> {
	return createPracticeMeeting(db, input, practiceMeetingKnowledgeStore);
}

/**
 * @lore AU19 Increment 3h: collapses `dispatch`'s former
 * `buildAttentionService({db, eventBus, work, review}).recomputeScope(filter)`
 * wiring into a single bound call — same reasoning as
 * `createPracticeMeetingBound` above.
 */
async function recomputeAttentionForCandidates(
	db: HyperIdleDb,
	eventBus: EventBus,
	candidateIds: readonly string[],
): Promise<DispatchAttentionRecomputeOutcome> {
	const createReviewItemForKnowledge = buildCreateReviewItemForKnowledge({
		conversation: { insertThread },
		work: { createItem },
	});
	return buildAttentionService({
		db,
		eventBus,
		work: { findItemByReasoningMarker },
		review: { createReviewItemForKnowledge, attentionReviewReasoningMarker },
	}).recomputeScope({ ids: candidateIds as string[] });
}

const dispatchPorts: DispatchPorts = {
	work: {
		listTasks,
		getTaskById,
		getBetById,
		createItem,
		findRetroItemByThreadIds,
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
		resolveAgentModel: (
			agent: DispatchAgentModelParams,
			tierFallback: string,
			config,
			credentialResolver: DispatchCredentialResolver,
		) =>
			resolveModel(
				{ kind: "agent", modelId: agent.modelId, modelProvider: agent.modelProvider, tierFallback },
				config,
				credentialResolver,
			),
		resolveModelTier: (tier, config, credentialResolver: DispatchCredentialResolver) =>
			resolveModel({ kind: "tier", tier }, config, credentialResolver),
	},
	agentSelection: {
		resolveAssistantFormation,
	},
	runOrchestration: {
		executeAgentRunRequest: (
			deps: DispatchProvisionDeps,
			request: AgentSessionRequest,
			options: DispatchConsumeOptions,
		): Promise<DispatchProvisionResult> => executeAgentRunRequest(deps, request, options),
	},
	sessionRequests: {
		recordAgentWorkIntent: async (exec, input: DispatchAgentWorkIntentInput) => {
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
		getFactoryCostActual,
	},
	review: {
		createPracticeMeeting: createPracticeMeetingBound,
	},
	knowledge: {
		runAutoPromotionSweep: (db, eventBus): Promise<DispatchAutoPromotionSweepResult> =>
			runAutoPromotionSweep(db, eventBus),
		runStaleSweep: (db, eventBus, nowMs, thresholdMs, options): Promise<DispatchStaleSweepResult> =>
			runStaleSweep(db, eventBus, nowMs, thresholdMs, options),
		listRecentByLayers,
		recomputeAttentionForCandidates,
	},
	toolHandlers: {
		buildAssistantDraftRegistry: (ctx: DispatchToolContext, params) =>
			buildAssistantDraftRegistry(ctx as ToolContext<HyperIdleDb>, params, toolHandlersPorts),
	},
	workspaceFactory: {
		create: () => new LocalSandboxAdapter(),
	},
};

export const dispatchOps = createDispatchOps(dispatchPorts);

export const {
	registerTaskDispatcher,
	registerAssistantDispatcher,
	startRoutineScheduler,
	registerBuiltinRoutineHandlers,
	executeAssistantRequest,
	persistTurnFailure,
	runBuiltinRoutine,
	provisionTeamRoutines,
	checkAndFireRoutine,
	getRoutineMonthlySpend,
} = dispatchOps;
