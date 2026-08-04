/** Core API composition root for the run-orchestration service. */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	AdapterPool,
	createHarnessAdapter,
	createReturnEnforcement,
	provisionHarnessEnvironment,
} from "@hyperidle/harness-registry";
import {
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
import type { ToolContext, WorkerRegisterMessage } from "@hyperidle/shared";
import { EventBus, summarizeToolArgs } from "@hyperidle/shared";
import { queueDeps } from "./durable-agent-queue.js";
import { buildToolRegistry, returnStatusTool, toolsForRole } from "./tool-provider-bindings.js";

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
};
type SessionLifecycleToolContext = Parameters<typeof buildToolRegistry>[0];
type ToolRegistryOptions = Parameters<typeof buildToolRegistry>[1];

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
// longer carries a `filesystems` field at all. The agent's injected
// filesystem list is now baked at emit time by every per-kind resolver
// (`@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`) onto
// `ProvisionSessionParams.injectedFilesystems` instead.
//
// AU21 §9 Increment 12 follow-up part 2 (F2 gap closure): the
// `connectionsProvisioner` seam wiring that used to live here
// (`seamPortForActor(agentId).connections.listHeldConnectionsForProvisioning()`)
// is DELETED — `SessionLifecyclePorts` no longer carries a `connections`
// field at all. The owning human's held-connection list is now baked at
// emit time by every per-kind resolver (`@hyperidle/connections`'s
// `resolveInjectedConnectionsForAgent`) onto
// `ProvisionSessionParams.injectedConnections` instead, and
// `run-orchestration`'s own `provisioner.ts` calls `buildProvisioningPlan`/
// `applyProvisioningPlan` directly — no composition-root port needed.

const enforcement = createReturnEnforcement();
const harnessRuntime: SessionLifecyclePorts["harnessRuntime"] = {
	enforcementRegistry: enforcement,
	// AU27 Increment 3 (Decision 3): forward the session's required-return-
	// subset through to the enforcement registry's gate constructor — a hard
	// COMPILE dependency (the port type gained the param first).
	createReturnGate: (requiredReturnActions) => enforcement.createGate(requiredReturnActions),
	evaluateReturn: (gate, reason) => enforcement.evaluate(gate, reason),
	provisionReturnHook: async (options) => {
		await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
	},
	writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
};

function widenToToolContext(ctx: SessionLifecycleToolContext): ToolContext<HyperIdleDb> {
	return ctx as ToolContext<HyperIdleDb>;
}

const toolProvider: SessionLifecyclePorts["toolProvider"] = {
	buildToolRegistry(ctx, options) {
		return buildToolRegistry(widenToToolContext(ctx), {
			role: options.role,
			extraTools: options.extraTools as ToolRegistryOptions["extraTools"],
			sessionWorkflow: options.sessionWorkflow as ToolRegistryOptions["sessionWorkflow"],
			useOnlyExtraTools: options.useOnlyExtraTools,
		});
	},
	toolsForRole,
	returnStatusToolForRegistry(registry) {
		return returnStatusTool.forRegistry(registry);
	},
};

const sessionLifecyclePorts: SessionLifecyclePorts = {
	sessionRequests: {
		findSessionRequest,
		listSessionRequests,
		transitionSessionRequest: async (exec, transition) => {
			const result = await transitionSessionRequest(exec, transition);
			return result === undefined ? undefined : result;
		},
		abortSessionRun: (sessionId) => sessionRunRegistry.abort(sessionId),
		registerSessionRun: (sessionId, control) => sessionRunRegistry.register(sessionId, control),
		deregisterSessionRun: (sessionId) => sessionRunRegistry.deregister(sessionId),
	},
	observability: observabilityAccessor,
	harnessRuntime,
	toolProvider,
};
// AU21 §9 Increment 4 (Decision B″ item 3): `transitionRunInternal`'s
// `TransitionPorts` no longer carries a `routine` key at all — `endSession`/
// `crashSession` finalize a routine run by emitting `session_ended`, never a
// direct `routineRuns` write.
const transitionPorts: Parameters<typeof transitionRunInternal>[0]["ports"] = {
	sessionRequests: sessionLifecyclePorts.sessionRequests,
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
// Increment 3i, `@hyperidle/shared`'s `HarnessPort` (§7.4) satisfied by
// `session-lifecycle-bindings.ts`'s `harnessPort` export.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The assistant runs through the shared `sessionRequests`/`sessionLifecycle`
// poller path like every other kind — no second execution entry to wire.
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

// ---------------------------------------------------------------------------
// harness-registry — INTERIM (NOT the final HarnessPort, §7.4 — a separate,
// later item builds that; see ports.ts's top `@lore`).
// ---------------------------------------------------------------------------

/** The live `AdapterPool` instance satisfies `RunOrchestrationAdapterPool` structurally — passed straight through, zero wrapper. */
/**
 * The ONE audited cast recovering `WorkerRegisterMessage` from this Service's
 * Mechanism-C-narrowed registration type (`ports.ts`'s top `@lore`) — the
 * SAME real object `worker-ws.ts` received off the wire, only its TYPE was
 * narrowed crossing the boundary. `registration`'s parameter type is `unknown`
 * (not a cast expression) so this is a single, contained assertion —
 * `design/no-unknown-cast` bans the `X as unknown as T` double-assertion
 * shape, not an audited single cast inside a named helper.
 */
// ---------------------------------------------------------------------------
// Production-wired drop-in replacements — every real call site imports these,
// not `@hyperidle/run-orchestration` directly for the deps-carrying functions.
// ---------------------------------------------------------------------------

const remoteHarnessAdapterFactory = {
	create(ws: unknown, registration: { readonly id: string; readonly [key: string]: unknown }) {
		return createHarnessAdapter({
			kind: "remote",
			ws,
			registration: widenWorkerRegistration(registration),
		});
	},
};

function widenWorkerRegistration(registration: unknown): WorkerRegisterMessage {
	return registration as WorkerRegisterMessage;
}

/** @lore Production code uses this boundary naming — `durable-agent-queue.ts` re-exports it under the legacy alias (see this file's top `@lore`) for its own test-assertion-surface reasons; this module never declares that other name itself as a local binding. */
export function runtimeDeps(
	db: HyperIdleDb,
	eventBus: EventBus,
	overrides: Omit<Partial<RuntimeDeps>, "runtime"> & {
		readonly runtime?: ProvisionSessionDeps;
	} = {},
): RuntimeDeps {
	const { runtime, ...rest } = overrides;
	const adapterPool = runtime?.adapterPool instanceof AdapterPool ? runtime.adapterPool : undefined;
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
		durableQueue: overrides.durableQueue ?? { ...queueDeps(db), eventBus },
		composition: {
			context: contextPorts,
			provisioner: sessionLifecyclePorts,
			...(adapterPool
				? { worker: { pool: adapterPool, adapterFactory: remoteHarnessAdapterFactory } }
				: {}),
			...rest.composition,
		},
	};
}

export function runSession(deps: ProvisionSessionDeps, spec: RunOptions): Promise<RunResult> {
	return runSessionInternal(
		runtimeDeps(deps.db, deps.eventBus, { runtime: deps as RuntimeInput }),
		spec,
	);
}

export function transitionRun(
	db: HyperIdleDb,
	eventBus: EventBus,
	spec: Parameters<typeof transitionRunInternal>[1],
): ReturnType<typeof transitionRunInternal> {
	return transitionRunInternal({ db, eventBus, ports: transitionPorts }, spec);
}

export function startRuntime(deps: RuntimeDeps): ReturnType<typeof startRuntimeInternal> {
	return startRuntimeInternal(runtimeDeps(deps.db, deps.eventBus ?? new EventBus(), deps));
}
