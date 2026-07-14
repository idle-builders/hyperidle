/**
 * `run-orchestration` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census: this
 * Service's four real outbound edges are `session-lifecycle`
 * (`agent-layer-boot.ts`/`agent-session-runtime.ts` → `session-lifecycle.ts`/
 * `session-provisioning.ts`, 5 call sites), `session-requests`
 * (`agent-layer-boot.ts`/`agent-session-runtime.ts`/`agent-run-boundary.ts` →
 * `agent-session-requests.ts`/`agent-work-intents.ts`, 4 counted call sites),
 * the `harness-registry` execution seam (`worker-ws.ts` → `adapter-pool.ts`,
 * 2 call sites), and `dispatch` (`agent-layer-boot.ts` →
 * `agent-work-assistant.ts`, 1 call site).
 *
 * `session-requests` is REAL (migrated Increment 3b) but this is still an
 * ordinary injected DI port, not a direct import — Mechanism C applies to
 * EVERY Service→Service edge without a same-layer exception (confirmed by
 * `session-requests`' own `→ trigger-resolution` port, both agent-orchestration).
 * `session-lifecycle` and `dispatch` have NOT migrated yet (later in this same
 * Increment 3) — their ports are INTERIM, wired at the composition root
 * (`packages/server/src/services/run-orchestration-bindings.ts`) to those
 * Services' still-flat `packages/server` functions, same shape as
 * `session-requests`' own interim `agent-selection`/`lifecycle-projection`
 * ports before this migration. `harness-registry`'s FULL migration (beyond
 * the Increment-0 `harness-capabilities.ts` slice) is scheduled Increment 4;
 * the ground-rule sequencing note is explicit that `worker-ws.ts`'s eventual
 * `HarnessPort` (§7.4) wiring is a SEPARATE, LATER step — not attempted here.
 * `RunOrchestrationAdapterPool`/`RunOrchestrationRemoteHarnessAdapterFactory`
 * below are ORDINARY interim forward-reference ports (same shape as
 * `session-lifecycle`'s), wired to `packages/server`'s still-raw
 * `harness/adapter-pool.ts`/`harness/remote-harness-adapter.ts` — NOT the
 * final `HarnessPort` abstraction, which a later, dedicated item builds.
 *
 * A NEW census correction this migration surfaced (raw-table access, not a
 * function call, same shape as `trigger-resolution`'s/`session-requests`'
 * own prior corrections): `agent-run-boundary.ts` (`getAgentRunLifecycle`/
 * `listAgentRunLifecycleBySource`), `agent-session-runtime.ts`
 * (`admitOnlyWithRequestLease`/`reserveOrAdoptSession`/
 * `recoverRunningAgentSessionRequests`), and `agent-layer-boot.ts`
 * (`markRunningAgentSessionRequestsForShutdown`, plus the
 * `explicitSessionStarts` read/writes in `drainAgentSessionRequests`) all
 * raw-read/wrote `agentSessionRequests`/`explicitSessionStarts` directly
 * pre-migration — both tables are `session-requests`-owned (`TABLE_OWNER`).
 * Closed by four NEW `@hyperidle/session-requests` exports
 * (`findAgentSessionRequestById`, `listAgentSessionRequestsBySource`,
 * `listRunningAgentSessionRequests`, `isAgentSessionRequestClaimActive`) plus
 * a new `explicit-session-starts.ts` file
 * (`findExplicitSessionStartById`/`markExplicitSessionStartAdmitted`/
 * `markExplicitSessionStartFailed`) — see that package's `agent-session-requests.ts`
 * top `@lore`. `sessions` (read/written directly in `agent-session-runtime.ts`'s
 * `reserveOrAdoptSession`/`recoverRunningAgentSessionRequests`) stays a direct
 * `@hyperidle/db` access — it is in `table-ownership-guard.ts`'s
 * `UNOWNED_SHARED_TABLES` exemption (genuinely multi-owner-touched), so no
 * port is needed for it.
 *
 * `ProvisionSessionDeps`/`ProvisionSessionParams`/`ProvisionSessionResult`/
 * `AdmittedSession` (session-provisioning.ts, destined for `session-lifecycle`)
 * are NOT imported — Mechanism C forbids it even type-only (§7.3). Two of
 * their fields (`sessionWorkflow`, `conversational`) are opaque pass-through
 * value bags this Service never inspects (only ever forwarded whole from its
 * own caller's `options` into the params it builds) — typed `unknown` here
 * rather than reconstructed. Every other field this Service actually reads,
 * writes, or constructs is typed off `@hyperidle/db`/`@hyperidle/shared`
 * directly (both are legal cross-package type sources — `run-orchestration`
 * is an orchestration Service and keeps `@hyperidle/db`, §7.3). The narrow
 * mirror types below are strictly WIDER-compatible with the real
 * `session-provisioning.ts` shapes on every field they declare, so passing a
 * real value into a narrow-typed parameter never needs a cast; the one
 * direction that does (the composition root's port implementation handing a
 * narrow-typed value back to the real wide-typed function) takes a single
 * documented boundary-crossing cast per port method in
 * `run-orchestration-bindings.ts` — the same established idiom as
 * `worker-ws.ts`'s pre-existing `ws as never`.
 */

import type { AgentSessionRequest, ExplicitSessionStart, HyperIdleDb } from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	CapturedToolCall,
	EventBus,
	HarnessAdapter,
	ModelTier,
	ResolvedModel,
	SessionMetrics,
	SessionOutcome,
} from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// session-requests — RunOrchestrationSessionRequestsPort (ordinary same-layer
// edge, REAL target — Mechanism C still requires a port, see this file's top
// `@lore`)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/session-requests`'s `ClaimRequestOptions`. */
export interface RunOrchestrationClaimOptions {
	readonly now: Date;
	readonly leaseMs: number;
}

/** Structural mirror of `@hyperidle/session-requests`'s `findAgentWorkIntentSourceByRequestId` result. */
export interface RunOrchestrationWorkIntentSource {
	readonly sourceKind: string;
	readonly sourceId: string;
}

/** Port for `session-requests`' request-lifecycle read/write/claim surface this Service calls directly today. */
export interface RunOrchestrationSessionRequestsPort {
	findAgentSessionRequestById(
		db: HyperIdleDb,
		requestId: string,
	): Promise<AgentSessionRequest | undefined>;
	listAgentSessionRequestsBySource(
		db: HyperIdleDb,
		sourceKind: AgentSessionSourceKind,
		sourceId: string,
	): Promise<AgentSessionRequest[]>;
	listRunningAgentSessionRequests(db: HyperIdleDb): Promise<AgentSessionRequest[]>;
	isAgentSessionRequestClaimActive(
		db: HyperIdleDb,
		input: { requestId: string; claimToken: string; now: Date },
	): Promise<boolean>;
	claimNextAgentSessionRequest(
		db: HyperIdleDb,
		workerId: string,
		options: RunOrchestrationClaimOptions,
	): Promise<AgentSessionRequest | null>;
	claimAgentSessionRequestById(
		db: HyperIdleDb,
		requestId: string,
		workerId: string,
		options: RunOrchestrationClaimOptions,
	): Promise<AgentSessionRequest | null>;
	releaseRequestClaim(db: HyperIdleDb, requestId: string, claimToken?: string): Promise<void>;
	renewAgentSessionRequestLease(
		db: HyperIdleDb,
		input: { requestId: string; claimToken: string; now: Date; leaseMs: number },
	): Promise<boolean>;
	markRequestRunning(
		db: HyperIdleDb,
		requestId: string,
		sessionId: string,
		claimToken?: string,
	): Promise<void>;
	findAgentWorkIntentSourceByRequestId(
		db: HyperIdleDb,
		requestId: string,
	): Promise<RunOrchestrationWorkIntentSource | undefined>;
	drainAgentWorkIntents(db: HyperIdleDb): Promise<void>;
	reapTerminalAgentWorkIntents(
		db: HyperIdleDb,
	): Promise<{ inbox: number; intents: number; explicitStarts: number; taskAttempts: number }>;
	findExplicitSessionStartById(
		db: HyperIdleDb,
		id: string,
	): Promise<ExplicitSessionStart | undefined>;
	markExplicitSessionStartAdmitted(
		db: HyperIdleDb,
		input: { id: string; requestId: string; sessionId: string },
	): Promise<void>;
	markExplicitSessionStartFailed(
		db: HyperIdleDb,
		input: { id: string; failureCode: string },
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// session-lifecycle — RunOrchestrationSessionLifecycleRuntime +
// RunOrchestrationSessionProvisioner (INTERIM forward-reference — see this
// file's top `@lore`)
// ---------------------------------------------------------------------------

/** Structural mirror of `session-lifecycle.ts`'s (pre-migration) `AgentTerminationReason`. */
export type RunOrchestrationTerminationReason =
	| "user_done"
	| "user_crashed"
	| "handoff"
	| "cost_cap"
	| "shutdown";

/** Narrow mirror of `session-provisioning.ts`'s (pre-migration) `SessionContext` — only the field this Service reads directly; the rest flows through opaquely. */
export interface RunOrchestrationSessionContext {
	readonly taskId: string | null;
}

/** Port for `session-lifecycle`'s termination/recovery/crash runtime this Service calls directly today. */
export interface RunOrchestrationSessionLifecycleRuntime {
	requestAgentTermination(
		db: HyperIdleDb,
		input: {
			requestId: string;
			reason: RunOrchestrationTerminationReason;
			requestedBy?: string;
		},
	): Promise<"accepted" | "idempotent" | "conflict" | "terminal">;
	recoverRequestedTerminations(db: HyperIdleDb, eventBus: EventBus): Promise<number>;
	transitionAgentRunLifecycle(
		db: HyperIdleDb,
		eventBus: EventBus,
		input: {
			readonly requestId: string;
			readonly state: "completed" | "failed" | "cancelled";
			readonly sessionId?: string;
			readonly claimToken?: string;
			readonly failureCode?: string;
			readonly errorMessage?: string;
		},
	): Promise<void>;
	crashSession(
		db: HyperIdleDb,
		eventBus: EventBus,
		context: RunOrchestrationSessionContext,
		costInCents: number,
		baselineCost?: number,
	): Promise<void>;
}

/** Narrow mirror of `session-provisioning.ts`'s (pre-migration) `ProvisionSessionDeps` — only the fields this Service reads directly; the rest (`adapterPool`, `workspace`, …) flows through opaquely as the same real value. */
export interface RunOrchestrationProvisionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly onHarnessStarted?: () => void;
}

/** Narrow mirror of `session-provisioning.ts`'s (pre-migration) `ProvisionSessionParams` — every field this Service constructs. `sessionWorkflow`/`conversational` are opaque pass-through (never inspected here, see this file's top `@lore`). */
export interface RunOrchestrationProvisionParams {
	readonly taskId: string | null;
	readonly agentId: string;
	readonly productId: string;
	readonly sandboxBasePath: string;
	readonly modelTier?: ModelTier;
	readonly resolvedModel?: ResolvedModel;
	readonly resolvedFastModel?: ResolvedModel;
	readonly routineId?: string;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
		readonly triggerPromptOverride?: string;
	};
	/** Opaque pass-through — `session-lifecycle`-owned `RegistrySessionWorkflow` (destined for `tool-handlers`, Increment 4). Never inspected here. */
	readonly sessionWorkflow?: unknown;
	/** Opaque pass-through — `session-lifecycle`-owned conversational-turn bundle (incl. a `tool-handlers`-destined `ToolRegistry`). Never inspected here. */
	readonly conversational?: unknown;
}

/** Narrow mirror of `session-provisioning.ts`'s (pre-migration) `AdmittedSession` — only the fields this Service reads directly; `sessionContext`'s other fields flow through opaquely. */
export interface RunOrchestrationAdmittedSession {
	readonly sessionId: string;
	readonly sessionContext: RunOrchestrationSessionContext;
}

/** Full mirror of `session-provisioning.ts`'s (pre-migration) `ProvisionSessionResult` — every field is already `@hyperidle/db`/`@hyperidle/shared`-typed, so this is a complete (non-opaque) structural equivalent. */
export interface RunOrchestrationProvisionResult {
	readonly sessionId: string;
	readonly outcome: SessionOutcome | "budget_exhausted";
	readonly totalCostCents: number;
	readonly taskId: string | null;
	readonly returnVerdict?: "returned" | "not_returned";
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
	readonly conversationalReply?: string;
	readonly conversationalToolCalls?: readonly CapturedToolCall[];
}

/** Port for `session-lifecycle`'s admission/execution surface this Service calls directly today. */
export interface RunOrchestrationSessionProvisioner {
	admitSession(
		deps: RunOrchestrationProvisionDeps,
		params: RunOrchestrationProvisionParams,
		enforceResolvedModelGuard?: boolean,
	): Promise<RunOrchestrationAdmittedSession>;
	runSession(
		deps: RunOrchestrationProvisionDeps,
		params: RunOrchestrationProvisionParams,
		admitted: RunOrchestrationAdmittedSession,
		onHarnessStarted?: () => void,
	): Promise<RunOrchestrationProvisionResult>;
}

// ---------------------------------------------------------------------------
// dispatch — RunOrchestrationDispatchPort (real, same-layer edge since AU19
// Increment 3h — `deps` stays opaque `unknown` on purpose: this Service
// never inspects `dispatch`'s internals even though `dispatch` is now a
// real migrated Service, same shape as every other same-layer port here)
// ---------------------------------------------------------------------------

/** Port for `dispatch`'s assistant-turn entrypoint this Service calls directly today. `deps` is opaque (`dispatch`-owned `AssistantTurnDeps`) — never constructed or inspected here, only forwarded whole from this Service's own caller. */
export interface RunOrchestrationDispatchPort {
	executeAssistantRequest(deps: unknown, request: AgentSessionRequest): Promise<void>;
}

// ---------------------------------------------------------------------------
// harness-registry — RunOrchestrationAdapterPool +
// RunOrchestrationRemoteHarnessAdapterFactory (INTERIM forward-reference —
// NOT the final `HarnessPort` (§7.4), which is a separate later step, see
// this file's top `@lore`)
// ---------------------------------------------------------------------------

/** Structural mirror of `harness/adapter-pool.ts`'s (pre-migration) `AdapterMeta`. */
export interface RunOrchestrationAdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

/** The one method `worker-ws.ts` calls on a registered adapter. Real `RemoteHarnessAdapter` already implements this. */
export interface RunOrchestrationRemoteWorkerAdapter {
	dispatchMessage(data: string): void;
}

/** Port for the `AdapterPool` registration surface `worker-ws.ts` calls directly today. `HarnessAdapter` (from `@hyperidle/shared`) is the real `register()` value type — no opacity needed for it. */
export interface RunOrchestrationAdapterPool {
	has(id: string): boolean;
	register(
		id: string,
		adapter: HarnessAdapter & RunOrchestrationRemoteWorkerAdapter,
		meta: RunOrchestrationAdapterMeta,
	): void;
	unregister(id: string): void;
	pause(id: string): void;
	resume(id: string): void;
}

/** Port constructing a registrable adapter from a live worker WS connection. Wraps `harness-registry`'s (pre-migration) `RemoteHarnessAdapter` constructor. */
export interface RunOrchestrationRemoteHarnessAdapterFactory {
	create(
		ws: unknown,
		registration: { readonly id: string; readonly [key: string]: unknown },
	): HarnessAdapter & RunOrchestrationRemoteWorkerAdapter;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle (per registration entry point)
// ---------------------------------------------------------------------------

/** Every real/interim outbound port `agent-run-boundary.ts`/`agent-session-runtime.ts`/`agent-layer-boot.ts` need. */
export interface RunOrchestrationPorts {
	readonly sessionRequests: RunOrchestrationSessionRequestsPort;
	readonly sessionLifecycle: RunOrchestrationSessionLifecycleRuntime;
	readonly sessionProvisioner: RunOrchestrationSessionProvisioner;
	readonly dispatch: RunOrchestrationDispatchPort;
}
