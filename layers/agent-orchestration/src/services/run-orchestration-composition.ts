/**
 * agent-orchestration's composition root for the `run-orchestration` Service.
 *
 * @lore AU31 §2.1(b)/§2.3/§2.4/§5/§6: relocated from `layers/core-api/src/
 * services/run-orchestration-composition.ts`. `@hyperidle/run-orchestration`/
 * `@hyperidle/run-orchestration`/`@hyperidle/session-requests` are this
 * Layer's own Services now, so those three imports are in-layer, not
 * crossings. The `@hyperidle/harness-registry`/`@hyperidle/harness-registry/
 * mcp` imports this file used to carry (adapter-pool + sandbox construction,
 * the return-enforcement registry, the MCP bridge dial) are GONE — that
 * content is execution content, and it now arrives as an opaque, structurally-
 * typed value a composition root hands in (`RunOrchestrationHarnessRuntimeAdapter`/
 * `RunOrchestrationReturnStatusToolAdapter` below), produced by
 * `bootAgentExecution` (`layers/agent-execution/src/boot.ts`) and passed
 * through `bootAgentOrchestration`'s options — never imported here by name.
 * The `./tool-provider-bindings.js` import is gone too: that wrapper is
 * DELETED (§2.5), its dispatch (`buildToolRegistry`) relocated to
 * `@hyperidle/tool-handlers` (now in-layer), its workflow port
 * rebuilt over `CoreApiPort.review` (the seam, since `@hyperidle/review`
 * stays core-api's own Service), and `returnStatusTool` riding the same
 * execution adapters bundle as `harnessRuntime`.
 *
 * @lore BC5 T11: the `CoreApiPort` seam itself, `CoreApiTransport`,
 * `core-api-port-composition.ts` and `tool-handlers-bindings.ts` are
 * DELETED — `create_team`/`add_agent`, the seam's last two tools, are gone
 * with the `org` package they wrote through. A session's tool registry is
 * built from `actionTools()` alone now; `buildToolRegistry` (still
 * `@hyperidle/tool-handlers`'s own) keeps its per-session, role-filtered
 * dispatch role unchanged.
 */

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
	listSessionRequests,
	reapExpired,
	releaseClaim,
	renewClaim,
	sessionRunRegistry,
	transitionSessionRequest,
} from "@hyperidle/session-requests";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";

// This composition root builds no `CoreApiPort`: the session-launch reads
// of an agent's connections and filesystems are this Layer's own tables,
// read live in-layer, so there is no seam call to wrap with the calling
// agent's identity.

// Shrunk to `filesystems` only —
// `knowledge`/`work`/`users`/`routine`/`org` are DELETED (not seam-routed).
// `context.ts` is pure format/write now, consuming the baked `contextBundle`
// carried on the session request; it reads zero core-api domain state.
// `startWatcher` has zero DB coupling — it lives in
// `@hyperidle/run-orchestration` and is wired through this same
// context-assembly port shape.
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

// `run-orchestration` holds ZERO `-> routine`/`-> settings`/`-> work` edge,
// read or write (architecture.md §6 H3). All baked data every per-kind resolver
// needs (harness params, context) arrives on the drained request — no live reads.
// Orchestration never initiates: every unit of work originates from a request
// core already sent, so it never needs to discover or react to agent state.
// `run-orchestration` now holds ZERO `-> users` edge; `DEFERRED_FOLLOWUP`
// no longer carries `run-orchestration::users` — there is nothing left to
// defer.
const observabilityAccessor: SessionLifecyclePorts["observability"] = { summarizeToolArgs };

// `SessionLifecyclePorts` carries no `filesystems` or `connections` field.
// The spawn reads the injection record live and in-layer through
// `ProvisionSessionDeps.injectedFilesystems`, wired at the Application
// composition root from `@hyperidle/filesystems`; held connections come the
// same way from `@hyperidle/connections`.
//
// Nor does the emit-time bake that briefly replaced it.
// `service_connections` is `agent-orchestration`'s own table now, so the spawn
// reads it live through `ProvisionSessionDeps.heldConnections`, wired at the
// composition root beside `serviceConnectionResolver` — a downward hand-off of
// this Layer's own Service, not a seam.

/**
 * The execution content this composition needs, handed in as a value by
 * `bootAgentExecution`'s adapters bundle — never imported by name (the
 * spelling law, architecture.md §4: a face-boot-produced value passed
 * onward by the composition root is composition, not injection, but only
 * for identifier-free spellings; this file declares its OWN structural
 * mirror of the shape it needs rather than importing `@hyperidle/agent-
 * execution`'s type, which would recreate the crossing this relocation
 * removes).
 *
 * Five of seven fields are field-for-field identical to `SessionLifecyclePorts
 * ["harnessRuntime"]` and assign straight through with no adapter.
 * `openMcpBridge`/`closeMcpBridge` differ: `run-orchestration`'s own port
 * still threads a per-call `registry`/`baseUrl` (its own type, unchanged by
 * this leaf), while the execution face's boot already owns one bridge
 * instance and one `mcpBaseUrl`, closed over internally — so those two
 * fields get a two-line pass-through below that ignores the per-call
 * registry/baseUrl the port still asks for. `run-orchestration`'s own port
 * signature is a later leaf's simplification, not this one's.
 */
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

/** `returnStatusTool.forRegistry(registry)`'s shape — an opaque `RegisteredTool`, never inspected here (mirrors `SessionLifecyclePorts["toolProvider"]["returnStatusToolForRegistry"]`'s own return type). */
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
		// The execution face already owns one bridge instance and one
		// `mcpBaseUrl` (closed over inside `bootAgentExecution`) — the per-call
		// `registry`/`baseUrl` this port still asks for are ignored, not
		// forwarded; they were `run-orchestration`'s own already-received
		// `mcpBridgeRegistry`/`mcpBaseUrl` values (`ProvisionSessionDeps`), and
		// the face now dials the ONE bridge it built regardless of which
		// registry a caller happens to hold.
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
 * The locked shape `CoreApiBoot.editDocument`/`searchDocuments` expose
 * (architecture.md §8.4), threaded through this composition exactly like
 * `actionTools`. Typed only through `@hyperidle/domain-model` — this Layer
 * may not import `core-api`.
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

/**
 * @lore document-module B15: `buildKnowledgeWritebackPort` (rebuilt over the
 * `CoreApiPort` seam's now-deleted `knowledge` family) is DELETED. The
 * writeback's document port is no longer built here at all — it is bound
 * directly from core's composed `edit_document`/`search_documents` VALUES
 * (`CoreApiBoot.editDocument`/`searchDocuments`, threaded through exactly
 * like `actionTools` already is, architecture.md §8.4), not a second HTTP
 * hop through the seam. `buildDocumentWritebackPort` below just adapts the
 * two locked-shape functions onto the writeback processor's own port
 * interface — `db` is accepted and ignored on every method, same idiom as
 * `buildKnowledgeWritebackPort` used to give it, kept only so the object
 * satisfies the writeback's pre-existing pooled-handle-shaped port.
 */
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

// There is no `buildGateAccessor`/`unusableGateAccessor` — a review links to
// its session through `ThreadActionsDeps.linkReviewToSession` (bound to
// `AgentOrchestrationPort.gate.linkReview`, which itself calls
// `recordReviewSession` from the intake route); core calls it directly
// rather than a tool dialling back into agent-orchestration.

// There is no `unusableOpenTask`/`buildOpenTaskBinding` — §8 B1's `open_task`
// binding existed only for `ToolHandlersCoreApiAccessor.openTask`, bound to
// the composed `open_task` action's own `run` for `write_memory`/
// `submit_review`/`create_artifact`'s task read. All three are deleted with
// the document tools, so `buildToolDefinitions` no longer takes an
// `openTask` argument at all.

/**
 * @lore `actionTools` is a thunk, not an array: core's `actionTools` is
 * threaded in BEFORE this Layer's own session actions exist (a cycle
 * otherwise: this Layer's sessions must be handed a list that contains this
 * Layer's own tools too, and that list is only complete after
 * `bootAgentOrchestration` returns). `buildToolRegistry`/`toolsForRole`
 * already run lazily, per session — calling the thunk here, at USE time
 * rather than at composition-build time, is what lets `create-server.ts`
 * reassign the joined list after both boots complete and have every session
 * see it.
 */
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

// `transitionRunInternal`'s
// `TransitionPorts` no longer carries a `routine` key at all — `endSession`/
// `crashSession` finalize a routine run by emitting `session_ended`, never a
// direct `routineRuns` write. Pure session-requests wiring, unaffected by
// execution content or the seam — shared by `transitionPorts` below AND
// every per-composition `SessionLifecyclePorts["sessionRequests"]` (same
// object, not two copies of one literal).
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

/**
 * Builds the per-composition `SessionLifecyclePorts["provisioner"]` bag —
 * the one piece of `runtimeDeps`'s output that depends on execution content
 * (`harnessRuntime`, `toolProvider.returnStatusToolForRegistry`) and the
 * seam (`toolProvider`'s `CoreApiPort`-backed workflow ops). Everything else
 * `runtimeDeps` needs is pure and stays module-level below.
 */
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
				// @lore This adapter silently dropped `errorMessage` for months.
				// Nothing caught it: the field is optional on both sides, so
				// omitting it from this fresh object literal type-checks, and
				// `run-orchestration/__tests__/test-ports.ts` REIMPLEMENTS this
				// port (forwarding the field correctly), so the package's own
				// tests asserted the message green while production wrote null.
				// Every failed request in a real database read `error_code:
				// "Error"`, `error_message: null` — a failure that refused to say
				// what it was. Any new field here needs a test through the real
				// composition, not through `test-ports`.
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

// ---------------------------------------------------------------------------
// session-lifecycle's admission/execution surface — `@hyperidle/harness-protocol`'s `HarnessPort` satisfied by
// `session-lifecycle-bindings.ts`'s `harnessPort` export.
// ---------------------------------------------------------------------------

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
	},
	sessionLifecycle: sessionLifecyclePort,
};

/**
 * One composition's worth of `runtimeDeps`/`runSession`/`startRuntime`,
 * bound to the execution adapters a caller supplies.
 * `bootAgentOrchestration` builds exactly one of these per boot; a
 * standalone caller with no composition root of its own (`tools/eval`'s
 * `runEvalSession`) builds one directly off its own adapters.
 */
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
	/**
	 * Core-api's composed action list, projected onto the
	 * MCP tool seam (`CoreApiBoot.actionTools`), as a THUNK — `create-server.ts`
	 * reassigns the value it closes over once this Layer's own session actions
	 * exist, and every session's tool registry (built lazily, per session)
	 * must see the up-to-date joined list, not the one captured at boot.
	 * Injected rather than imported, since `agent-orchestration` may not reach
	 * into `core-api` directly. Absent → no action tools registered (a
	 * bare-app test fixture).
	 */
	readonly actionTools?: () => readonly RegisteredTool<HyperIdleDb>[];
	/**
	 * §8.4 — core's composed `edit_document`/`search_documents` actions,
	 * threaded through exactly like `actionTools` above (`CoreApiBoot.
	 * editDocument`/`searchDocuments`) — the writeback processor's own
	 * document port is bound straight to these VALUES, never a second HTTP
	 * hop through the seam. Absent together → no writeback document port (a
	 * bare-app test fixture / `tools/eval`'s standalone use), matching the
	 * "no writeback" no-op every other absent-provisioning-read already gives.
	 */
	readonly editDocument?: RunOrchestrationEditDocument;
	readonly searchDocuments?: RunOrchestrationSearchDocuments;
}): RunOrchestrationComposition {
	const sessionLifecyclePorts = buildSessionLifecyclePorts(
		config.harnessRuntime,
		config.returnStatusTool,
		config.actionTools ?? (() => []),
	);

	// §8.4: the writeback processor's document port, bound directly to core's
	// composed actions — no Application supplies a `knowledge` port any more
	// (that whole seam family is deleted). Absent only when this composition
	// itself has neither value (a bare-app test fixture / `tools/eval`'s
	// standalone use), matching the "no writeback" no-op every other
	// absent-provisioning-read already gives.
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
			// @lore AU21 §6 Decision B4: wire the real eventBus into the drain's own
			// deps bundle so `failOrRelease` can actually emit
			// `agent_run_admission_failed` in production, not just in tests that
			// build `queueDeps(db)` + `eventBus` by hand.
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

/**
 * The session module's deps bag — `sessions.list`/
 * `getById` are this Layer's own `@hyperidle/run-orchestration` accessors
 * (in-package for `session-actions.ts`, injected here only for the uniform
 * deps-bag shape every action module takes); `stop` is `stopSessionRun`,
 * already bound to this boot's own `db`/`eventBus` and to
 * `sessionRunRegistry.abort` — the one place this Layer is allowed to name
 * `@hyperidle/session-requests` in production, since `@hyperidle/
 * run-orchestration` itself may not (devDependency only).
 */
export function buildSessionActionsDeps(
	db: HyperIdleDb,
	eventBus: EventBus,
	getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>,
): SessionActionsDeps {
	return {
		sessions: { list: listSessions, getById: findSessionById },
		stop: (sessionId) =>
			stopSessionRun(db, eventBus, sessionId, (id) => sessionRunRegistry.abort(id, "stop")),
		activity: getRecentActivity,
	};
}
