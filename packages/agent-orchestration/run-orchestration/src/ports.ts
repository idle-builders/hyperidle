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
 * (`findAgentSessionRequestById`, `listSessionRequests`,
 * `listSessionRequests`, `isAgentSessionRequestClaimActive`) plus
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

import type {
	AgentSessionRequest,
	AgentWorkIntent,
	Bet,
	ExplicitSessionStart,
	HyperIdleDb,
	KnowledgeItem,
	Message,
	ProposedCall,
	Routine,
	RoutineRun,
	TailoredGrant,
	Task,
	TaskDispatchAttempt,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type {
	AdmittedRun,
	AgentSessionSourceKind,
	ConfigurationKind,
	EventBus,
	HarnessAdapter,
	HarnessPort,
	HarnessPortDeps,
	HarnessRunOutput,
	ResolvedConfigurationItem,
	RunContextBundle,
} from "@hyperidle/shared";

interface DurableQueueDeps {
	readonly db: HyperIdleDb;
	readonly lifecycleProjection: {
		readonly routine: {
			updateRoutineRunIfRunning(
				exec: WriteExecutor,
				id: string,
				patch: {
					outcome: "success" | "error";
					endedAt: string;
					sessionId: string | null;
					errorMessage: string | null;
				},
			): Promise<void>;
		};
		readonly work: {
			updateTaskDispatchAttemptIfActive(
				exec: WriteExecutor,
				requestId: string,
				patch: { status: "completed" | "failed" | "cancelled"; sessionId: string | null },
			): Promise<void>;
			updateBetDecompositionStatusIfRunning(
				exec: WriteExecutor,
				id: string,
				patch: {
					decompositionStatus: "done" | "blocked";
					decompositionBlockerReason: string | null;
				},
			): Promise<void>;
		};
		readonly explicitSessionStarts: {
			projectTerminalState(
				exec: WriteExecutor,
				requestId: string,
				patch: {
					status: "completed" | "failed" | "cancelled";
					sessionId: string | null;
					failureCode: string | null;
				},
			): Promise<void>;
		};
	};
	readonly config: {
		listConfiguration(
			db: HyperIdleDb,
			filter: { kind?: ConfigurationKind; key?: string },
		): Promise<ResolvedConfigurationItem[]>;
	};
	readonly teams: {
		getTeamMembersByTeamId(exec: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
	};
	readonly users: {
		getUserById(exec: WriteExecutor, id: string): Promise<User | undefined>;
		getUserByIdScopedToTeam(
			db: HyperIdleDb,
			id: string,
			teamMembersId?: string,
		): Promise<User | undefined>;
		listUsersByTeam(exec: WriteExecutor, teamMembersId: string): Promise<User[]>;
	};
	readonly work: {
		getTaskById(exec: WriteExecutor, id: string): Promise<Task | undefined>;
		getBetById(exec: WriteExecutor, id: string): Promise<Bet | undefined>;
		getTaskDispatchAttemptById(
			exec: WriteExecutor,
			id: string,
		): Promise<TaskDispatchAttempt | undefined>;
		reapTerminalTaskDispatchAttempts(
			exec: WriteExecutor,
			cutoff: string,
			batchSize: number,
		): Promise<number>;
	};
	readonly routine: {
		getRoutineRunById(exec: WriteExecutor, id: string): Promise<RoutineRun | undefined>;
		getRoutineById(exec: WriteExecutor, id: string): Promise<Routine | undefined>;
		updateRoutineRunIfRunning(
			exec: WriteExecutor,
			id: string,
			patch: { outcome: "error"; endedAt: string; errorMessage: string | null },
		): Promise<void>;
	};
	readonly conversation: {
		getMessageById(exec: WriteExecutor, id: string): Promise<Message | undefined>;
	};
	readonly review: {
		findGrantedProposedCall(
			exec: WriteExecutor,
			id: string,
		): Promise<{ call: ProposedCall; grant: TailoredGrant } | undefined>;
	};
	readonly knowledge: { findById(exec: WriteExecutor, id: string): Promise<KnowledgeItem | null> };
	readonly agentSelection: {
		isAtCapacity(exec: WriteExecutor, agentId: string): Promise<boolean>;
		selectAgent(input: {
			db: WriteExecutor;
			surface: "routine_delegate";
			teamId: string | null;
			workKey: string;
			excludeAgentId: string;
			skillId: string;
		}): Promise<{ agentId: string | null }>;
	};
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

/**
 * @lore AU19 Increment 3i: these four types are now straight ALIASES of
 * `@hyperidle/shared`'s `HarnessPort` types (§7.4) — the same narrow-mirror
 * shapes this file declared locally since Increment 3c, relocated to the
 * shared, Application-visible abstraction so `run-orchestration` depends on
 * the named `HarnessPort` contract instead of an ad-hoc local interface (see
 * `harness-port.ts`'s own top `@lore` for the two-method-vs-single-call
 * deviation reasoning). Every existing reference in this package
 * (`agent-session-runtime.ts`, `agent-layer-boot.ts`) keeps using these local
 * names unchanged.
 */
export type RunOrchestrationProvisionDeps = HarnessPortDeps<HyperIdleDb>;
export type RunOrchestrationProvisionParams = RunContextBundle;
export type RunOrchestrationAdmittedSession = AdmittedRun;
export type RunOrchestrationProvisionResult = HarnessRunOutput;

/** Port for `session-lifecycle`'s admission/execution surface this Service calls directly today — `@hyperidle/shared`'s `HarnessPort` (§7.4). */
export type RunOrchestrationSessionProvisioner = HarnessPort<HyperIdleDb>;

// ---------------------------------------------------------------------------
// dispatch — RunOrchestrationDispatchPort (real, same-layer edge since AU19
// Increment 3h — `deps` stays opaque `unknown` on purpose: this Service
// never inspects `dispatch`'s internals even though `dispatch` is now a
// real migrated Service, same shape as every other same-layer port here)
// ---------------------------------------------------------------------------

/** Port for `dispatch`'s assistant-turn entrypoint this Service calls directly today. `deps` is opaque (`dispatch`-owned `AssistantTurnDeps`) — never constructed or inspected here, only forwarded whole from this Service's own caller. */
export interface RunOrchestrationDispatchPort {
	runAssistantTurn(deps: unknown, request: AgentSessionRequest): Promise<void>;
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
	readonly sessionRequests: {
		claimSessionRequest(
			exec: HyperIdleDb,
			selector: { next: true } | { id: string },
			options: { workerId: string; now: Date; leaseMs: number },
		): Promise<AgentSessionRequest | null>;
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "id"; requestId: string },
		): Promise<AgentSessionRequest | undefined>;
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "sessionId"; sessionId: string },
		): Promise<Pick<AgentSessionRequest, "id"> | undefined>;
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "claimActive"; requestId: string; claimToken: string; now: Date },
		): Promise<boolean>;
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "intentSource"; requestId: string },
		): Promise<
			Pick<AgentWorkIntent, "id" | "idempotencyKey" | "sourceId" | "sourceKind"> | undefined
		>;
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "explicitStart"; startId: string },
		): Promise<ExplicitSessionStart | undefined>;
		listSessionRequests(
			exec: HyperIdleDb,
			filter: { source: { kind: AgentSessionSourceKind; id: string } } | { status: "running" },
		): Promise<AgentSessionRequest[]>;
		releaseClaim(exec: HyperIdleDb, requestId: string, claimToken: string): Promise<boolean>;
		renewClaim(
			exec: HyperIdleDb,
			requestId: string,
			claimToken: string,
			options: { now: Date; leaseMs: number },
		): Promise<boolean>;
		transitionSessionRequest(
			exec: HyperIdleDb,
			transition:
				| { requestId: string; to: "running"; sessionId: string; claimToken: string }
				| {
						requestId: string;
						to: "completed" | "failed" | "cancelled";
						precondition: "running";
						sessionId: string;
						failureCode?: string;
						errorMessage?: string;
						requireNoTerminationReason?: boolean;
				  }
				| {
						requestId: string;
						to: "failed";
						precondition: "claimed";
						claimToken: string;
						failureCode?: string;
						errorMessage?: string;
				  }
				| {
						target: "explicitStart";
						to: "admitted";
						startId: string;
						requestId: string;
						sessionId: string;
				  }
				| { target: "explicitStart"; to: "failed"; startId: string; failureCode: string },
			deps?: DurableQueueDeps,
			options?: { now?: Date },
		): Promise<
			| AgentSessionRequest
			| null
			| boolean
			| void
			| "accepted"
			| "idempotent"
			| "conflict"
			| "terminal"
		>;
		drainIntents(
			deps: DurableQueueDeps,
			options?: { now?: () => Date; leaseMs?: number; maxAttempts?: number },
		): Promise<void>;
		reapExpired(
			deps: DurableQueueDeps,
			options?: { now?: Date; retentionDays?: number; batchSize?: number },
		): Promise<{ inbox: number; intents: number; explicitStarts: number; taskAttempts: number }>;
	};
	readonly sessionLifecycle: RunOrchestrationSessionLifecycleRuntime;
	readonly sessionProvisioner: RunOrchestrationSessionProvisioner;
	readonly dispatch: RunOrchestrationDispatchPort;
}
