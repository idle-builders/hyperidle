/**
 * @lore AU19 Increment 3i: `@hyperidle/session-lifecycle`'s `admitSession`/
 * `runSession`/`provisionSession`/`startSessionProvision`/
 * `requestAgentTermination`/`recoverRequestedTerminations`/
 * `transitionAgentRunLifecycle`/`reapStaleRoutineSessions` need injected
 * `routine`/`work`/`users`/`settings`/`observability`/`filesystems`/
 * `connections`/`sessionRequests`/`cost` (real, ordinary DI) plus
 * `harnessRuntime`/`mcpProvider`/`toolProvider`/`contextAssembly` (INTERIM
 * forward-references — `harness/*`/`mcp/*`/`tools/tool-registry.ts`'s full
 * migration is Increment 4; `context-assembly`/`context-assembly-prompt.ts`/
 * `session-context.ts` finalize as this WP's own next item) ports
 * (Mechanism C — `session-lifecycle` never imports another Service). This
 * module builds each bound singleton ONCE, at the composition root, so every
 * real call site (`server-factory.ts`, `session.ts`, `routes/sessions-routes.ts`,
 * `routes/tasks.ts`, `tools/handoff-to.ts`, `run-orchestration-bindings.ts`)
 * imports the already-wired function — same factory-curry idiom as
 * `cost-bindings.ts`/`session-requests-bindings.ts`/`run-orchestration-bindings.ts`.
 *
 * `HarnessPort`'s two methods (`@hyperidle/shared`) are satisfied by the
 * bound `admitSession`/`runSession` wrappers below — `run-orchestration-bindings.ts`
 * repoints its own `sessionProvisioner` port to import these directly instead
 * of the deleted flat `session-provisioning.ts` module.
 *
 * Each opaque-typed port method (`toolContext`, `registry`, `harness`) needs
 * exactly ONE documented boundary-crossing cast recovering the real wide type
 * from the Mechanism-C-narrowed one — the SAME real object flows through
 * unchanged at runtime, only the TYPE was narrowed crossing the package
 * boundary. Same established idiom as `worker-ws.ts`'s pre-existing
 * `ws as never` / `run-orchestration-bindings.ts`'s own casts.
 */

import {
	applyProvisioningPlan,
	buildProvisioningPlan,
	resolveOwningHumanUserId as resolveOwningHumanUserIdInternal,
} from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import { listFilesystemIdsByAgent, listFilesystemsByIds } from "@hyperidle/filesystems";
import { summarizeToolArgs } from "@hyperidle/observability";
import * as routineService from "@hyperidle/routine";
import {
	admitSession as admitSessionInternal,
	captureMountedFilesystems as captureMountedFilesystemsInternal,
	crashSession as crashSessionInternal,
	endSession as endSessionInternal,
	mountFilesystemsForAgent as mountFilesystemsForAgentInternal,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession as provisionSessionInternal,
	reapStaleRoutineSessions as reapStaleRoutineSessionsInternal,
	recoverRequestedTerminations as recoverRequestedTerminationsInternal,
	requestAgentTermination as requestAgentTerminationInternal,
	runSession as runSessionInternal,
	SANDBOX_REAPER_INTERVAL_MS,
	type SessionContext,
	type SessionLifecyclePorts,
	type SessionLifecycleToolContext,
	startSandboxReaper as startSandboxReaperInternal,
	startSessionProvision as startSessionProvisionInternal,
	transitionAgentRunLifecycle as transitionAgentRunLifecycleInternal,
} from "@hyperidle/session-lifecycle";
import { recordAgentWorkIntent, sessionRunRegistry } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type {
	EventBus,
	HarnessRunOutput,
	RunContextBundle,
	SessionHandoffCompletedEvent,
	AdmittedRun as SharedAdmittedRun,
} from "@hyperidle/shared";
import { getFirstUserByKind, getUserById } from "@hyperidle/users";
import {
	getBetById,
	getTaskById,
	transitionTask,
	updateBetById,
	updateTaskById,
} from "@hyperidle/work";
import { writeCliMcpConfig } from "../harness/cli-mcp-config.js";
import { provisionReturnHook } from "../harness/provision-return-hook.js";
import { enforcementRegistry } from "../harness/return-enforcement-registry.js";
import { createReturnGate, evaluateReturn } from "../harness/return-gate.js";
import { createMcpBridge } from "../mcp/mcp-bridge.js";
import { returnStatusTool } from "../tools/return-status-tool.js";
import { buildToolRegistry, type ToolContext, toolsForRole } from "../tools/tool-registry.js";
import { assembleAgentContext, beginAgentWriteback } from "./agent-context/assemble-context.js";
import {
	assemblePrompt,
	assembleRoutinePrompt,
	composeAssistantPrompt,
	writeSandboxAgentsMd,
} from "./context-assembly-prompt.js";
import { checkCostCap, recordCostAndCheck, releaseSessionDedup } from "./cost-bindings.js";
import { buildRoutineSessionContextData, buildSessionContextData } from "./session-context.js";
import { terminalizeAgentSessionRequestInTx } from "./session-requests-bindings.js";

// ---------------------------------------------------------------------------
// routine — ordinary downward DI.
// ---------------------------------------------------------------------------

const routineAccessor: SessionLifecyclePorts["routine"] = {
	getRoutineById: routineService.getRoutineById,
	findRunningRoutineRun: routineService.findRunningRoutineRun,
	updateRoutineRunById: routineService.updateRoutineRunById,
	updateRoutineById: routineService.updateRoutineById,
	incrementRoutineCost: routineService.incrementRoutineCost,
};

// ---------------------------------------------------------------------------
// work — ordinary downward DI. `transitionTask` pre-binds its own AC-9
// `workIntents.record` dep to `session-requests`' `recordAgentWorkIntent`.
// ---------------------------------------------------------------------------

const workAccessor: SessionLifecyclePorts["work"] = {
	getTaskById,
	updateTaskById,
	getBetById,
	updateBetById,
	transitionTask(db, eventBus, taskId, toState, dispatchOccasion) {
		return transitionTask(
			db,
			eventBus,
			taskId,
			toState,
			{ workIntents: { record: recordAgentWorkIntent } },
			dispatchOccasion,
		);
	},
};

// ---------------------------------------------------------------------------
// users — ordinary downward DI.
// ---------------------------------------------------------------------------

const userReader: SessionLifecyclePorts["users"] = { getUserById, getFirstUserByKind };

// ---------------------------------------------------------------------------
// settings — ordinary downward DI.
// ---------------------------------------------------------------------------

const settingsReader: SessionLifecyclePorts["settings"] = { readServerConfig };

// ---------------------------------------------------------------------------
// observability — ordinary downward DI.
// ---------------------------------------------------------------------------

const observabilityAccessor: SessionLifecyclePorts["observability"] = { summarizeToolArgs };

// ---------------------------------------------------------------------------
// filesystems — ordinary downward DI (NEW census edge, AO2 mount resolution).
// ---------------------------------------------------------------------------

const filesystemsReader: SessionLifecyclePorts["filesystems"] = {
	listFilesystemIdsByAgent,
	listFilesystemsByIds,
};

// ---------------------------------------------------------------------------
// connections — ordinary downward DI (NEW census edge, AN2 Phase 8b-connections).
// ---------------------------------------------------------------------------

const connectionsProvisioner: SessionLifecyclePorts["connections"] = {
	resolveOwningHumanUserId(db: HyperIdleDb) {
		return resolveOwningHumanUserIdInternal(db, { users: { getFirstUserByKind } });
	},
	buildProvisioningPlan,
	applyProvisioningPlan,
};

// ---------------------------------------------------------------------------
// session-requests — ordinary same-layer DI.
// ---------------------------------------------------------------------------

const sessionRequestsAccessor: SessionLifecyclePorts["sessionRequests"] = {
	sessionRunRegistry,
	recordAgentWorkIntent,
	terminalizeAgentSessionRequestInTx,
	findAgentSessionRequestTerminationReasonInTx: async (tx, requestId) => {
		const { findAgentSessionRequestTerminationReasonInTx } = await import(
			"@hyperidle/session-requests"
		);
		return findAgentSessionRequestTerminationReasonInTx(tx, requestId);
	},
	requestAgentSessionTermination: async (db, input) => {
		const { requestAgentSessionTermination } = await import("@hyperidle/session-requests");
		return requestAgentSessionTermination(db, input);
	},
	listRunningAgentSessionRequests: async (db) => {
		const { listRunningAgentSessionRequests } = await import("@hyperidle/session-requests");
		return listRunningAgentSessionRequests(db);
	},
};

// ---------------------------------------------------------------------------
// cost — ordinary same-layer DI.
// ---------------------------------------------------------------------------

const costAccessor: SessionLifecyclePorts["cost"] = {
	checkCostCap,
	recordCostAndCheck,
	releaseSessionDedup,
};

// ---------------------------------------------------------------------------
// harness-registry / mcp-provider / tool-provider — INTERIM, wired to
// still-flat `packages/server` files.
// ---------------------------------------------------------------------------

const harnessRuntime: SessionLifecyclePorts["harnessRuntime"] = {
	enforcementRegistry,
	createReturnGate,
	evaluateReturn,
	provisionReturnHook,
	writeCliMcpConfig,
};

const mcpProvider: SessionLifecyclePorts["mcpProvider"] = {
	createMcpBridge(options) {
		return createMcpBridge({
			sessionId: options.sessionId,
			registry: options.registry as Parameters<typeof createMcpBridge>[0]["registry"],
			onToolCall: options.onToolCall,
		});
	},
};

/**
 * @lore boundary-crossing cast: `ctx` is the SAME real `ToolContext` value
 * `session-lifecycle`'s own callers built — only its TYPE was narrowed
 * crossing the Mechanism-C boundary (`session-lifecycle`'s `ports.ts` top
 * `@lore`). `ToolContext.ingestion` is `@hyperidle/session-lifecycle`'s own
 * `IngestionHandle` (this file's own import chain), so the narrow/wide
 * shapes are structurally identical — a single documented cast, not the
 * banned `X as unknown as T` double-assertion (`design/no-unknown-cast`).
 */
function widenToToolContext(ctx: SessionLifecycleToolContext): ToolContext {
	return ctx as ToolContext;
}

const toolProvider: SessionLifecyclePorts["toolProvider"] = {
	buildToolRegistry(ctx, options) {
		return buildToolRegistry(widenToToolContext(ctx), {
			role: options.role,
			extraTools: options.extraTools as never,
			sessionWorkflow: options.sessionWorkflow as never,
			useOnlyExtraTools: options.useOnlyExtraTools,
		});
	},
	toolsForRole,
	returnStatusToolForRegistry(registry) {
		return returnStatusTool.forRegistry(registry);
	},
};

const contextAssembly: SessionLifecyclePorts["contextAssembly"] = {
	assembleAgentContext,
	beginAgentWriteback,
	buildSessionContextData,
	buildRoutineSessionContextData,
	assemblePrompt,
	assembleRoutinePrompt,
	composeAssistantPrompt,
	writeSandboxAgentsMd,
};

// ---------------------------------------------------------------------------
// Aggregate ports bundle.
// ---------------------------------------------------------------------------

export const sessionLifecyclePorts: SessionLifecyclePorts = {
	routine: routineAccessor,
	work: workAccessor,
	users: userReader,
	settings: settingsReader,
	observability: observabilityAccessor,
	filesystems: filesystemsReader,
	connections: connectionsProvisioner,
	sessionRequests: sessionRequestsAccessor,
	cost: costAccessor,
	harnessRuntime,
	mcpProvider,
	toolProvider,
	contextAssembly,
};

// ---------------------------------------------------------------------------
// Production-wired drop-in replacements — every real call site imports these,
// not `@hyperidle/session-lifecycle` directly for the ports-carrying functions.
// ---------------------------------------------------------------------------

export function admitSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	enforceResolvedModelGuard?: boolean,
): ReturnType<typeof admitSessionInternal> {
	return admitSessionInternal(deps, params, sessionLifecyclePorts, enforceResolvedModelGuard);
}

export function runSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	admitted: Parameters<typeof runSessionInternal>[2],
	onHarnessStarted?: () => void,
): ReturnType<typeof runSessionInternal> {
	return runSessionInternal(deps, params, admitted, sessionLifecyclePorts, onHarnessStarted);
}

export function provisionSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
): ReturnType<typeof provisionSessionInternal> {
	return provisionSessionInternal(deps, params, sessionLifecyclePorts);
}

export function startSessionProvision(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
): ReturnType<typeof startSessionProvisionInternal> {
	return startSessionProvisionInternal(deps, params, sessionLifecyclePorts);
}

export function requestAgentTermination(
	db: HyperIdleDb,
	input: Parameters<typeof requestAgentTerminationInternal>[1],
): ReturnType<typeof requestAgentTerminationInternal> {
	return requestAgentTerminationInternal(db, input, sessionLifecyclePorts);
}

/**
 * @lore AU19 Increment 3i: §10.3 against-grain inversion for
 * `policy ⚠ session-lifecycle` — `handoff-protocol.ts` used to call
 * `deps.sessionLifecycle.requestTermination` directly through an interim
 * `PolicySessionTerminationRequester` DI port (Increment 2a). The call was
 * fire-and-forget (result never consumed for branching) and ran before any
 * transaction opened — the pure-inversion shape, same as
 * `registerCostCapDedupReleaser`'s own subscription to this exact event
 * (`@hyperidle/cost`'s `cost-cap.ts`). Registered at boot alongside it
 * (`server-factory.ts`).
 */
export function registerHandoffTerminationRequester(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	const handler = (event: SessionHandoffCompletedEvent): void => {
		void (async (): Promise<void> => {
			const { findAgentSessionRequestBySessionId } = await import("@hyperidle/session-requests");
			const correlatedRequest = await findAgentSessionRequestBySessionId(db, event.sessionId);
			if (!correlatedRequest) return;
			await requestAgentTermination(db, { requestId: correlatedRequest.id, reason: "handoff" });
		})();
	};
	return eventBus.on("session_handoff_completed", handler);
}

export function recoverRequestedTerminations(
	db: HyperIdleDb,
	eventBus: EventBus,
): ReturnType<typeof recoverRequestedTerminationsInternal> {
	return recoverRequestedTerminationsInternal(db, eventBus, sessionLifecyclePorts);
}

export function transitionAgentRunLifecycle(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: Parameters<typeof transitionAgentRunLifecycleInternal>[2],
): ReturnType<typeof transitionAgentRunLifecycleInternal> {
	return transitionAgentRunLifecycleInternal(db, eventBus, input, sessionLifecyclePorts);
}

export function crashSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	baselineCost?: number,
): ReturnType<typeof crashSessionInternal> {
	return crashSessionInternal(
		db,
		eventBus,
		context,
		costInCents,
		sessionLifecyclePorts,
		baselineCost,
	);
}

export function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	baselineCost?: number,
	routineRunOutcome?: "budget_exhausted",
	terminalOutcome?: "completed" | "not_returned",
): ReturnType<typeof endSessionInternal> {
	return endSessionInternal(
		db,
		eventBus,
		context,
		costInCents,
		sessionLifecyclePorts,
		baselineCost,
		routineRunOutcome,
		terminalOutcome,
	);
}

export function mountFilesystemsForAgent(
	...args: Parameters<typeof mountFilesystemsForAgentInternal> extends [...infer Rest, unknown]
		? Rest
		: never
): ReturnType<typeof mountFilesystemsForAgentInternal> {
	return mountFilesystemsForAgentInternal(...args, sessionLifecyclePorts);
}

export const captureMountedFilesystems = captureMountedFilesystemsInternal;

export function reapStaleRoutineSessions(
	db: HyperIdleDb,
	eventBus: EventBus,
	opts: Parameters<typeof reapStaleRoutineSessionsInternal>[2],
): ReturnType<typeof reapStaleRoutineSessionsInternal> {
	return reapStaleRoutineSessionsInternal(db, eventBus, opts, sessionLifecyclePorts);
}

// `sandbox-reaper.ts` has zero cross-Service deps (`sessions` is
// `UNOWNED_SHARED_TABLES`) — re-exported unchanged, no `ports` wiring needed.
export const startSandboxReaper = startSandboxReaperInternal;

export type {
	AdmittedSession,
	BeforeHarnessStartContext,
	BeforeTeardownContext,
	ProvisionSessionDeps,
	ProvisionSessionParams,
	ProvisionSessionResult,
	SessionContext,
} from "@hyperidle/session-lifecycle";
export { SANDBOX_REAPER_INTERVAL_MS };

// ---------------------------------------------------------------------------
// HarnessPort (`@hyperidle/shared`) — the concrete implementation
// `run-orchestration-bindings.ts` wires its `sessionProvisioner` port to.
// ---------------------------------------------------------------------------

/**
 * @lore boundary-crossing cast: `bundle` is the SAME real
 * `ProvisionSessionParams` value `run-orchestration`'s own caller built —
 * only narrowed in TYPE to `HarnessPort`'s shared `RunContextBundle` crossing
 * the boundary (`@hyperidle/shared`'s `harness-port.ts` top `@lore`). A named
 * helper with a single documented cast, not the banned `X as unknown as T`
 * double-assertion (`design/no-unknown-cast`).
 */
function widenToProvisionSessionParams(bundle: RunContextBundle): ProvisionSessionParams {
	return bundle as ProvisionSessionParams;
}

/** @lore boundary-crossing cast: same reasoning as {@link widenToProvisionSessionParams}, for `AdmittedRun`/`AdmittedSession`. */
function widenToAdmittedSession(
	admitted: SharedAdmittedRun,
): Parameters<typeof runSessionInternal>[2] {
	return admitted as Parameters<typeof runSessionInternal>[2];
}

export const harnessPort = {
	admitSession(
		deps: unknown,
		bundle: RunContextBundle,
		enforceResolvedModelGuard?: boolean,
	): Promise<SharedAdmittedRun> {
		return admitSession(
			deps as ProvisionSessionDeps,
			widenToProvisionSessionParams(bundle),
			enforceResolvedModelGuard,
		) as Promise<SharedAdmittedRun>;
	},
	runSession(
		deps: unknown,
		bundle: RunContextBundle,
		admitted: SharedAdmittedRun,
		onHarnessStarted?: () => void,
	): Promise<HarnessRunOutput> {
		return runSession(
			deps as ProvisionSessionDeps,
			widenToProvisionSessionParams(bundle),
			widenToAdmittedSession(admitted),
			onHarnessStarted,
		) as Promise<HarnessRunOutput>;
	},
};
