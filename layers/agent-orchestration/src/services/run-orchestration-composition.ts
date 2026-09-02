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
 * `@hyperidle/tool-handlers` (now in-layer), its role filter replaced by
 * `buildToolDefinitions(transport, {role})`'s own filter, its workflow port
 * rebuilt over `CoreApiPort.review` (the seam, since `@hyperidle/review`
 * stays core-api's own Service), and `returnStatusTool` riding the same
 * execution adapters bundle as `harnessRuntime`.
 */

import { randomUUID } from "node:crypto";
import type { CoreApiTransport } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { summarizeToolArgs } from "@hyperidle/diagnostics";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import {
	type PluginMcpContributionsPort,
	type RunOptions,
	type RunResult,
	type RunTransitionSpec,
	type RuntimeDeps,
	type RuntimePorts,
	runSession as runSessionInternal,
	startRuntime as startRuntimeInternal,
	startWatcher,
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
import { buildCoreApiPort, unconfiguredCoreApiTransport } from "./core-api-port-composition.js";
import { buildToolDefinitions } from "./tool-handlers-bindings.js";

// AU21 §9 Increment 12 follow-up part 2 (F2 gap closure): this composition
// root's own `seamPortForActor` helper (a fresh in-process `CoreApiPort` per
// call, wrapped with the calling agent's identity — Decision F2's
// session-launch-time `connections`/`filesystems` provisioning reads) is
// DELETED — it had exactly two callers (the `connectionsProvisioner` and
// `filesystemsReader` seam wirings) and both are now gone (baked at emit
// time instead). No composition-root `CoreApiPort` construction is needed
// in this file anymore.

// AU21 §9 Increment 12 (Decision H3), Wave C: shrunk to `filesystems` only —
// `knowledge`/`work`/`users`/`routine`/`org` are DELETED (not seam-routed).
// `context.ts` is pure format/write now, consuming the baked `contextBundle`
// carried on the session request; it reads zero core-api domain state.
// `startWatcher` has zero DB coupling — it relocated wholesale into
// `@hyperidle/run-orchestration` (Decision F2) but is still wired through
// this same context-assembly port shape, unchanged.
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

// AU21 §9 Increment 12 (Decision H3), Wave D: `workAccessor` DELETED entirely
// (reads AND writes) — `run-orchestration/provisioner.ts` no longer carries
// a `work` port at all. Its former call sites are core-api-side event
// subscribers instead: `work-session-started-reactions.ts` (session_started
// -> in_progress transition) and `work-session-end-reactions.ts` (session_ended
// -> bet token-writeback). See `provisioner.ts`'s own Wave D note for the
// full per-caller migration map.
//
// AU21 §9 Increment 12 (Decision H3), Wave E: `routineAccessor`/`settingsReader`
// (this file's own `getRoutineById`/`readServerConfig` bindings) are DELETED
// entirely — `SessionLifecyclePorts` no longer carries `routine`/`settings`
// fields at all. `admitSession`'s Phase 3 `harnessDisabled` read is replaced
// by baked data every per-kind resolver now supplies on the drained request
// (`params.harnessDisabled` — see `provisioner.ts`'s own Wave E top-of-file
// note; AU21 Increment 14a deleted the admission-time routine per-run cost
// cap this bullet used to also describe, no replacement). `run-orchestration`
// now holds ZERO `-> routine`/`-> settings` edge, read or write — closing
// architecture.md §6 H3 and the anti-regrowth guard's `DEFERRED_FOLLOWUP`
// entries `run-orchestration::routine`/`::settings`.
//
// **RE-CORRECTED (founder, 2026-08-01), third/final pass:** the earlier
// `userReader`/`agentRunnabilityReader` reopening above is ITSELF deleted,
// with no replacement of any kind. The founder rejected the premise that
// prompted it outright: orchestration never initiates anything on its own —
// every unit of work originates from a request core already sent — so there
// is no scenario where it needs to independently discover or react to an
// agent's deactivation, live-read or pushed-event alike. See
// `provisioner.ts`'s top-of-file Wave E `@lore` for the full trace.
// `run-orchestration` now holds ZERO `-> users` edge; `DEFERRED_FOLLOWUP`
// no longer carries `run-orchestration::users` — there is nothing left to
// defer.
const observabilityAccessor: SessionLifecyclePorts["observability"] = { summarizeToolArgs };

// AU21 §9 Increment 12 follow-up (F2 gap closure): the `filesystemsReader`
// seam wiring that used to live here (`seamPortForActor(agentId).filesystems
// .listFilesystemsByAgent(agentId)`) is DELETED — `SessionLifecyclePorts` no
// longer carries a `filesystems` field at all. AU26 F2: the emit-time bake that
// replaced it is deleted too. The spawn reads the injection record live and
// in-layer through `ProvisionSessionDeps.injectedFilesystems`, wired at the
// Application composition root from `@hyperidle/filesystems`.
//
// AU21 §9 Increment 12 follow-up part 2 (F2 gap closure): the
// `connectionsProvisioner` seam wiring that used to live here
// (`seamPortForActor(agentId).connections.listHeldConnectionsForProvisioning()`)
// is DELETED — `SessionLifecyclePorts` no longer carries a `connections`
// field at all.
//
// AU26 E3: nor does the emit-time bake that briefly replaced it.
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
 * AU31 §2.7 — the writeback processor's `knowledge` port, rebuilt over the
 * `CoreApiPort` seam instead of the Application injecting
 * `@hyperidle/knowledge` functions directly (`create-server.ts:545-562`
 * before this leaf) — an application → service crossing that hosting could
 * not legalize. `db` is accepted and ignored on every method (same idiom as
 * the seam's server side reads/writes
 * through its OWN `db`, not this argument, which exists only so the object
 * satisfies the writeback processor's pre-existing pooled-handle-shaped port.
 */
function buildKnowledgeWritebackPort(transport: CoreApiTransport): {
	create(
		_db: HyperIdleDb,
		input: {
			readonly layer: "L1" | "L2" | "L3";
			readonly kind: "pattern" | "decision" | "failure" | "reflection";
			readonly title: string;
			readonly body: string;
			readonly format: string;
			/**
			 * `draft`, not `captured`. The route has never accepted `captured` —
			 * it validates status against its own four-value list, so every
			 * writeback create 400'd for the whole life of this path. `draft` is
			 * the same state under the name the route knows.
			 */
			readonly status: "draft";
			readonly updatedBy: string;
			/** Where the produced item hangs — the session's task, or the conversation it is answering in. */
			readonly parent?: { readonly kind: "task" | "thread"; readonly id: string };
		},
	): Promise<{ readonly id: string; readonly version: number; readonly format: string }>;
	update(
		_db: HyperIdleDb,
		id: string,
		patch: { readonly body: string; readonly updatedBy: string },
		expectedVersion: number,
	): Promise<
		| {
				readonly ok: true;
				readonly item: { readonly id: string; readonly version: number; readonly format: string };
		  }
		| { readonly ok: false; readonly currentVersion: number }
	>;
	recordConflict(
		_db: HyperIdleDb,
		input: {
			readonly itemId: string;
			readonly versionBase: number;
			readonly versionCurrent: number;
			readonly proposedBody: string;
			readonly proposedBy: string;
		},
	): Promise<void>;
} {
	const port = buildCoreApiPort(transport);
	return {
		async create(_db, input) {
			const created = await port.knowledge.create({
				layer: input.layer,
				// The route requires a scope and this call never sent one, so
				// every writeback create was rejected before it reached the
				// database. `factory` is what the column default would have been
				// had the row ever been written.
				scopeKind: "factory",
				kind: input.kind,
				title: input.title,
				body: input.body,
				format: input.format,
				status: input.status,
				updatedBy: input.updatedBy,
				...(input.parent ? { parentKind: input.parent.kind, parentId: input.parent.id } : {}),
			});
			return { id: created.id, version: created.version, format: input.format };
		},
		async update(_db, id, patch, expectedVersion) {
			return port.knowledge.updateKnowledgeItemContent(id, {
				body: patch.body,
				updatedBy: patch.updatedBy,
				expectedVersion,
			});
		},
		async recordConflict(_db, input) {
			await port.knowledge.createKnowledgeConflict({
				id: randomUUID(),
				itemId: input.itemId,
				versionBase: input.versionBase,
				versionCurrent: input.versionCurrent,
				proposedBody: input.proposedBody,
				proposedMeta: null,
				proposedBy: input.proposedBy,
				createdAt: new Date().toISOString(),
			});
		},
	};
}

function buildToolProvider(
	coreApiTransport: CoreApiTransport,
	returnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter,
): SessionLifecyclePorts["toolProvider"] {
	return {
		buildToolRegistry(ctx, options) {
			const definitions = buildToolDefinitions(coreApiTransport);
			return buildToolRegistryFromDefinitions(definitions, widenToToolContext(ctx), {
				role: options.role,
				extraTools: options.extraTools as ToolRegistryOptions["extraTools"],
				useOnlyExtraTools: options.useOnlyExtraTools,
			});
		},
		toolsForRole(role) {
			return buildToolDefinitions(coreApiTransport).filter(
				(d) => d.roles === undefined || d.roles.includes(role),
			);
		},
		returnStatusToolForRegistry(registry) {
			return returnStatusToolAdapter.forRegistry(registry);
		},
	};
}

// AU21 §9 Increment 4 (Decision B″ item 3): `transitionRunInternal`'s
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
	abortSessionRun: (sessionId) => sessionRunRegistry.abort(sessionId),
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
	coreApiTransport: CoreApiTransport,
): SessionLifecyclePorts {
	return {
		sessionRequests: sessionRequestsPort,
		observability: observabilityAccessor,
		harnessRuntime: buildHarnessRuntime(harnessRuntimeAdapter),
		toolProvider: buildToolProvider(coreApiTransport, returnStatusToolAdapter),
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
// session-lifecycle's admission/execution surface — REAL since AU19
// Increment 3i, `@hyperidle/harness-protocol`'s `HarnessPort` (§7.4) satisfied by
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
 * bound to the execution adapters and `CoreApiTransport` a caller supplies.
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
	/** Absent (or a bare-app test fixture / `tools/eval`'s standalone use) → seam-backed tools throw only when actually dialled (`unconfiguredCoreApiTransport`), never at construction. */
	readonly coreApiTransport?: CoreApiTransport;
}): RunOrchestrationComposition {
	const sessionLifecyclePorts = buildSessionLifecyclePorts(
		config.harnessRuntime,
		config.returnStatusTool,
		config.coreApiTransport ?? unconfiguredCoreApiTransport(),
	);

	// AU31 §2.7: the writeback processor's `knowledge` port, seam-backed by
	// default — no Application supplies it any more (`create-server.ts`'s
	// direct `@hyperidle/knowledge` wiring is deleted). Absent only when this
	// composition itself has no `coreApiTransport` (a bare-app test fixture /
	// `tools/eval`'s standalone use), matching the "no writeback" no-op every
	// other absent-provisioning-read already gives.
	const defaultKnowledgeWritebackPort = config.coreApiTransport
		? buildKnowledgeWritebackPort(config.coreApiTransport)
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
				...(defaultKnowledgeWritebackPort
					? { writeback: { db, knowledge: defaultKnowledgeWritebackPort } }
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
