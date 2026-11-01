// Composition root for the `run-orchestration` Service.
// Execution content (harness adapters) arrives as opaque typed values from `bootAgentExecution`.

import type { HyperIdleDb } from "@hyperidle/db";
import { summarizeToolArgs } from "@hyperidle/diagnostics";
import type {
	ActionResult,
	ActivityEntry,
	DocumentRow,
	DocumentView,
	EditDocumentInput,
	SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool, ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import {
	findSessionById,
	listSessions,
	type PluginMcpContributionsPort,
	type RunOptions,
	type RunResult,
	type RunTransitionSpec,
	type RuntimeDeps,
	type RuntimePorts,
	runSession as runSessionInternal,
	type SessionActionsDeps,
	startRuntime as startRuntimeInternal,
	startWatcher,
	stopSessionRun,
	transitionRun as transitionRunInternal,
} from "@hyperidle/run-orchestration";
import {
	claimSessionRequest,
	drainIntents,
	findSessionRequest,
	listPendingByStream,
	listSessionRequests,
	reapExpired,
	releaseClaim,
	renewClaim,
	sessionRunRegistry,
	transitionSessionRequest,
} from "@hyperidle/session-requests";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";

const contextPorts: RuntimeDeps["composition"]["context"] = {
	filesystems: { startWatcher },
};

type SessionLifecyclePorts = NonNullable<RuntimeDeps["composition"]["provisioner"]>;
type SessionLifecycleRuntime = RuntimePorts["sessionLifecycle"];
type SessionContextPort = Parameters<SessionLifecycleRuntime["crashSession"]>[2];
type RuntimeInput = NonNullable<RuntimeDeps["runtime"]>;
type TransitionContext = Extract<RunTransitionSpec, { target: "session" }>["context"];
export type ProvisionSessionDeps = Pick<RuntimeInput, "db" | "eventBus" | "onHarnessStarted"> & {
	readonly adapterPool?: unknown;
	readonly workspace?: unknown;
	readonly pluginMcpContributions?: PluginMcpContributionsPort;
};
type SessionLifecycleToolContext = Parameters<typeof buildToolRegistryFromDefinitions>[1];
type ToolRegistryOptions = Parameters<typeof buildToolRegistryFromDefinitions>[2];

const observabilityAccessor: SessionLifecyclePorts["observability"] = { summarizeToolArgs };

// Execution content handed in from `bootAgentExecution` — never imported by name (no layer crossing).
// openMcpBridge/closeMcpBridge differ from the port: execution face owns one bridge instance,
// so per-call registry/baseUrl args are ignored.
export interface RunOrchestrationHarnessRuntimeAdapter {
	readonly enforcementRegistry: SessionLifecyclePorts["harnessRuntime"]["enforcementRegistry"];
	readonly createReturnGate: SessionLifecyclePorts["harnessRuntime"]["createReturnGate"];
	readonly evaluateReturn: SessionLifecyclePorts["harnessRuntime"]["evaluateReturn"];
	readonly provisionReturnHook: SessionLifecyclePorts["harnessRuntime"]["provisionReturnHook"];
	readonly writeCliMcpConfig: SessionLifecyclePorts["harnessRuntime"]["writeCliMcpConfig"];
	readonly writePluginStdioMcpEntries: SessionLifecyclePorts["harnessRuntime"]["writePluginStdioMcpEntries"];
	openMcpBridge(session: {
		readonly sessionId: string;
		readonly toolRegistry: ToolRegistry;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string; readonly url: string }>;
	closeMcpBridge(token: string): Promise<void>;
}

// `returnStatusTool.forRegistry(registry)` shape — opaque RegisteredTool.
export interface RunOrchestrationReturnStatusToolAdapter {
	forRegistry(
		registry: SessionLifecyclePorts["harnessRuntime"]["enforcementRegistry"],
	): ReturnType<SessionLifecyclePorts["toolProvider"]["returnStatusToolForRegistry"]>;
}

function buildHarnessRuntime(
	adapter: RunOrchestrationHarnessRuntimeAdapter,
): SessionLifecyclePorts["harnessRuntime"] {
	return {
		enforcementRegistry: adapter.enforcementRegistry,
		createReturnGate: adapter.createReturnGate,
		evaluateReturn: adapter.evaluateReturn,
		provisionReturnHook: adapter.provisionReturnHook,
		writeCliMcpConfig: adapter.writeCliMcpConfig,
		writePluginStdioMcpEntries: adapter.writePluginStdioMcpEntries,
		// Per-call registry/baseUrl are ignored; execution face owns one bridge instance.
		openMcpBridge: (options) =>
			adapter.openMcpBridge({
				sessionId: options.sessionId,
				toolRegistry: options.toolRegistry as ToolRegistry,
				onToolCall: options.onToolCall,
			}),
		closeMcpBridge: (_registry, token) => adapter.closeMcpBridge(token),
	};
}

function widenToToolContext(ctx: SessionLifecycleToolContext): ToolContext<HyperIdleDb> {
	return ctx as ToolContext<HyperIdleDb>;
}

/**
 * The locked shape `CoreApiBoot.editDocument`/`searchDocuments` expose,
 * threaded through this composition exactly like `actionTools`. Typed only
 * through `@hyperidle/domain-model` — this Layer may not import `core-api`.
 */
type RunOrchestrationEditDocument = (
	caller: {
		readonly actor: string;
		readonly sessionId: string;
		readonly taskId: string | null;
		readonly threadId: string | null;
	},
	input: EditDocumentInput,
) => Promise<ActionResult<DocumentView>>;
type RunOrchestrationSearchDocuments = (
	caller: { readonly actor: string },
	input: SearchDocumentsInput,
) => Promise<ActionResult<readonly DocumentRow[]>>;

// Adapt the two document runners onto the writeback port interface; `db` is accepted and ignored.
function buildDocumentWritebackPort(
	editDocument: RunOrchestrationEditDocument,
	searchDocuments: RunOrchestrationSearchDocuments,
): {
	editDocument(
		caller: Parameters<RunOrchestrationEditDocument>[0],
		input: Parameters<RunOrchestrationEditDocument>[1],
	): ReturnType<RunOrchestrationEditDocument>;
	searchDocuments(
		caller: Parameters<RunOrchestrationSearchDocuments>[0],
		input: Parameters<RunOrchestrationSearchDocuments>[1],
	): ReturnType<RunOrchestrationSearchDocuments>;
} {
	return {
		editDocument: (caller, input) => editDocument(caller, input),
		searchDocuments: (caller, input) => searchDocuments(caller, input),
	};
}

// @lore: actionTools is a thunk — injected before own session actions exist; called at USE time so create-server.ts reassigns the list after both boots complete
function buildToolProvider(
	returnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter,
	actionTools: () => readonly RegisteredTool<HyperIdleDb>[],
): SessionLifecyclePorts["toolProvider"] {
	return {
		buildToolRegistry(ctx, options) {
			const toolCtx = widenToToolContext(ctx);
			return buildToolRegistryFromDefinitions([...actionTools()], toolCtx, {
				extraTools: options.extraTools as ToolRegistryOptions["extraTools"],
			});
		},
		toolsForRole() {
			// Names only — no handler runs. Every agent gets every tool.
			return [...actionTools()];
		},
		returnStatusToolForRegistry(registry) {
			return returnStatusToolAdapter.forRegistry(registry);
		},
	};
}

const sessionRequestsPort: SessionLifecyclePorts["sessionRequests"] = {
	findSessionRequest,
	listSessionRequests,
	transitionSessionRequest: async (exec, transition) => {
		const result = await transitionSessionRequest(exec, transition);
		return result === undefined ? undefined : result;
	},
	abortSessionRun: (sessionId, reason) => sessionRunRegistry.abort(sessionId, reason),
	registerSessionRun: (sessionId, control) => sessionRunRegistry.register(sessionId, control),
	deregisterSessionRun: (sessionId) => sessionRunRegistry.deregister(sessionId),
};

// Build per-composition SessionLifecyclePorts — depends on execution content and action tools.
function buildSessionLifecyclePorts(
	harnessRuntimeAdapter: RunOrchestrationHarnessRuntimeAdapter,
	returnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter,
	actionTools: () => readonly RegisteredTool<HyperIdleDb>[],
): SessionLifecyclePorts {
	return {
		sessionRequests: sessionRequestsPort,
		observability: observabilityAccessor,
		harnessRuntime: buildHarnessRuntime(harnessRuntimeAdapter),
		toolProvider: buildToolProvider(returnStatusToolAdapter, actionTools),
	};
}

const transitionPorts: Parameters<typeof transitionRunInternal>[0]["ports"] = {
	sessionRequests: sessionRequestsPort,
};

const sessionLifecyclePort: SessionLifecycleRuntime = {
	requestAgentTermination(db, input) {
		return transitionRunInternal(
			{ db, eventBus: new EventBus(), ports: transitionPorts },
			{
				target: "request",
				requestId: input.requestId,
				intent: "request-termination",
				reason: input.reason,
				requestedBy: input.requestedBy,
			},
		) as Promise<"accepted" | "idempotent" | "conflict" | "terminal">;
	},
	recoverRequestedTerminations(db, eventBus) {
		return transitionRunInternal(
			{ db, eventBus, ports: transitionPorts },
			{ target: "request", intent: "recover-terminations" },
		) as Promise<number>;
	},
	async transitionAgentRunLifecycle(db, eventBus, input) {
		await transitionRunInternal(
			{ db, eventBus, ports: transitionPorts },
			{
				target: "request",
				requestId: input.requestId,
				intent: "terminalize",
				state: input.state,
				sessionId: input.sessionId,
				claimToken: input.claimToken,
				failureCode: input.failureCode,
				errorMessage: input.errorMessage,
			},
		);
	},
	async crashSession(db: HyperIdleDb, eventBus: EventBus, context: SessionContextPort) {
		await transitionRunInternal(
			{ db, eventBus, ports: transitionPorts },
			{
				target: "session",
				context: context as TransitionContext,
				disposition: "crash",
			},
		);
	},
};

const runOrchestrationPorts: RuntimePorts = {
	sessionRequests: {
		claimSessionRequest,
		findSessionRequest,
		listSessionRequests,
		releaseClaim,
		renewClaim,
		transitionSessionRequest,
		drainIntents,
		reapExpired,
		abortSessionRun: (sessionId, reason) => sessionRunRegistry.abort(sessionId, reason),
	},
	sessionLifecycle: sessionLifecyclePort,
};

// One composition: runtimeDeps/runSession/startRuntime bound to execution adapters.
export interface RunOrchestrationComposition {
	readonly runtimeDeps: (
		db: HyperIdleDb,
		eventBus: EventBus,
		overrides?: Omit<Partial<RuntimeDeps>, "runtime"> & {
			readonly runtime?: ProvisionSessionDeps;
		},
	) => RuntimeDeps;
	readonly runSession: (deps: ProvisionSessionDeps, spec: RunOptions) => Promise<RunResult>;
	readonly startRuntime: (deps: RuntimeDeps) => ReturnType<typeof startRuntimeInternal>;
}

export function buildRunOrchestrationComposition(config: {
	readonly harnessRuntime: RunOrchestrationHarnessRuntimeAdapter;
	readonly returnStatusTool: RunOrchestrationReturnStatusToolAdapter;
	// Action list as a thunk; reassigned by create-server.ts after both boots complete.
	readonly actionTools?: () => readonly RegisteredTool<HyperIdleDb>[];
	// Document runners for writeback; absent → no writeback port (bare-app fixture / eval).
	readonly editDocument?: RunOrchestrationEditDocument;
	readonly searchDocuments?: RunOrchestrationSearchDocuments;
}): RunOrchestrationComposition {
	const sessionLifecyclePorts = buildSessionLifecyclePorts(
		config.harnessRuntime,
		config.returnStatusTool,
		config.actionTools ?? (() => []),
	);

	const defaultDocumentWritebackPort =
		config.editDocument && config.searchDocuments
			? buildDocumentWritebackPort(config.editDocument, config.searchDocuments)
			: undefined;

	function runtimeDeps(
		db: HyperIdleDb,
		eventBus: EventBus,
		overrides: Omit<Partial<RuntimeDeps>, "runtime"> & {
			readonly runtime?: ProvisionSessionDeps;
		} = {},
	): RuntimeDeps {
		const { runtime, ...rest } = overrides;
		return {
			db,
			eventBus,
			...rest,
			...(runtime ? { runtime: runtime as RuntimeInput } : {}),
			ports: overrides.ports ?? runOrchestrationPorts,
			// @lore: durableQueue — must include the real eventBus so `failOrRelease` emits `agent_run_admission_failed` in production
			durableQueue: overrides.durableQueue ?? { db, eventBus },
			composition: {
				context: contextPorts,
				provisioner: sessionLifecyclePorts,
				...(defaultDocumentWritebackPort
					? { writeback: { db, document: defaultDocumentWritebackPort } }
					: {}),
				...rest.composition,
			},
		};
	}

	return {
		runtimeDeps,
		runSession: (deps, spec) =>
			runSessionInternal(
				runtimeDeps(deps.db, deps.eventBus, { runtime: deps as RuntimeInput }),
				spec,
			),
		startRuntime: (deps) =>
			startRuntimeInternal(runtimeDeps(deps.db, deps.eventBus ?? new EventBus(), deps)),
	};
}

// Build session action deps — sessions/stop bound to this boot's db/eventBus.
export function buildSessionActionsDeps(
	db: HyperIdleDb,
	eventBus: EventBus,
	getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>,
): SessionActionsDeps {
	return {
		sessions: { list: listSessions, getById: findSessionById },
		pendingRequests: { listForStream: listPendingByStream },
		stop: (sessionId) =>
			stopSessionRun(db, eventBus, sessionId, (id) => sessionRunRegistry.abort(id, "stop")),
		activity: getRecentActivity,
	};
}
