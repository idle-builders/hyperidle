import type {
	AgentSessionRequest,
	AgentWorkIntent,
	ExplicitSessionStart,
	HyperIdleDb,
} from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	ModelTier,
	ResolvedModel,
	SessionOutcome,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ConversationMessage, SessionMetrics } from "@hyperidle/harness-protocol";
import type { BakedAgentRunnableConfig, BakedContextBundle } from "@hyperidle/domain-model";

// ---------------------------------------------------------------------------
// Harness port types (moved from @hyperidle/harness-protocol harness-port.ts)
// ---------------------------------------------------------------------------

/** Deps `HarnessPort`'s two methods need. `TDb` is the composition root's real DB type. */
export interface HarnessPortDeps<TDb = unknown> {
	readonly db: TDb;
	readonly eventBus: EventBus;
	readonly onHarnessStarted?: () => void;
}

/**
 * Narrow mirror of `@hyperidle/session-lifecycle`'s `ProvisionSessionParams`
 * — every field `run-orchestration` constructs when dispatching a run.
 */
export interface RunContextBundle {
	readonly taskId: string | null;
	readonly agentId: string;
	readonly productId: string;
	readonly sandboxBasePath: string;
	readonly modelTier?: ModelTier;
	readonly resolvedModel?: ResolvedModel;
	readonly routineId?: string;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
		readonly triggerPromptOverride?: string;
	};
	/** Opaque pass-through — `session-lifecycle`-owned `RegistrySessionWorkflow`. Never inspected here. */
	readonly sessionWorkflow?: unknown;
	readonly contextBundle?: BakedContextBundle;
	readonly agentConfig?: BakedAgentRunnableConfig;
	readonly harnessDisabled?: readonly string[];
	readonly callingThreadId?: string;
	readonly transcript?: readonly ConversationMessage[];
}

/** Narrow mirror of `@hyperidle/session-lifecycle`'s `AdmittedSession`. */
export interface AdmittedRun {
	readonly sessionId: string;
	readonly sessionContext: { readonly taskId: string | null };
}

/** Full mirror of `@hyperidle/session-lifecycle`'s `ProvisionSessionResult`. */
export interface HarnessRunOutput {
	readonly sessionId: string;
	readonly outcome: SessionOutcome;
	readonly taskId: string | null;
	readonly returnVerdict?: "returned" | "not_returned";
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
}

/** Application-injected port for "dispatch a run to some execution" (§7.4). */
export interface HarnessPort<TDb = unknown> {
	admitSession(
		deps: HarnessPortDeps<TDb>,
		bundle: RunContextBundle,
		enforceResolvedModelGuard?: boolean,
	): Promise<AdmittedRun>;
	runSession(
		deps: HarnessPortDeps<TDb>,
		bundle: RunContextBundle,
		admitted: AdmittedRun,
		onHarnessStarted?: () => void,
	): Promise<HarnessRunOutput>;
}

interface DurableQueueDeps {
	readonly db: HyperIdleDb;
	/**
	 * @lore AU21 §6 Decision B4: mirrors the private `DurableQueueDeps.eventBus`
	 * in `@hyperidle/session-requests` (Mechanism C — this Service declares its
	 * own structural copy rather than importing that type directly). Required
	 * since AU44 — an admission failure that emits nowhere is a silent black hole.
	 */
	readonly eventBus: EventBus;
}

type RunOrchestrationTerminationReason = "user_done" | "user_crashed" | "handoff" | "shutdown";

interface RunOrchestrationSessionContext {
	readonly taskId: string | null;
}

interface RunOrchestrationSessionLifecycleRuntime {
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
	): Promise<void>;
}

type RunOrchestrationSessionProvisioner = HarnessPort<HyperIdleDb>;

// ---------------------------------------------------------------------------
// Aggregate deps bundle (per registration entry point)
// ---------------------------------------------------------------------------

export interface RuntimePorts {
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
			| Pick<AgentWorkIntent, "id" | "kind" | "idempotencyKey" | "sourceId" | "sourceKind">
			| undefined
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
			db: HyperIdleDb,
			options?: { now?: Date; retentionDays?: number; batchSize?: number },
		): Promise<{ intents: number; explicitStarts: number }>;
	};
	readonly sessionLifecycle: RunOrchestrationSessionLifecycleRuntime;
	/** Test-only execution seam; production runSession binds the internal provisioner. */
	readonly sessionProvisioner?: RunOrchestrationSessionProvisioner;
}

export type RunResult =
	| {
			readonly mode: "assembled";
			readonly context: Awaited<
				ReturnType<
					ReturnType<typeof import("./context.js").createContextAssembler>["assembleAgentContext"]
				>
			>;
	  }
	| { readonly mode: "admitted"; readonly sessionId: string }
	| ({ readonly mode: "completed" } & HarnessRunOutput);
export type RunOptions =
	| {
			readonly mode: "durable";
			readonly request: AgentSessionRequest;
			readonly completion?: "admit" | "await";
			readonly input?: never;
			readonly sandboxBasePath: string;
			readonly workerId?: string;
			readonly claim?: { readonly now: Date; readonly leaseMs: number };
			readonly resolvedModel?: RunContextBundle["resolvedModel"];
			readonly modelTier?: RunContextBundle["modelTier"];
			readonly sessionWorkflow?: RunContextBundle["sessionWorkflow"];
			readonly enforceResolvedModelGuard?: boolean;
	  }
	| {
			readonly mode: "one-shot";
			readonly completion: "admit" | "await";
			readonly input: RunContextBundle;
			readonly enforceResolvedModelGuard?: boolean;
	  }
	| {
			readonly mode: "assemble";
			readonly input: Parameters<
				ReturnType<typeof import("./context.js").createContextAssembler>["assembleAgentContext"]
			>[0];
	  };

export type RunTransitionSpec = Parameters<typeof import("./transition-run.js").transitionRun>[1];
export interface RuntimeDeps {
	readonly db: HyperIdleDb;
	readonly eventBus?: EventBus;
	readonly runtime?: Parameters<
		ReturnType<typeof import("./provisioner.js").createProvisioner>["admit"]
	>[0];
	readonly sandboxBasePath?: string;
	/**
	 * AU27 Increment 6 (Decision 4) — an optional per-agent model override
	 * (baked onto every kind's `agentConfig.modelId`/`modelProvider`, uniform,
	 * not assistant-only). Absent means "no override, tier only" — matches the
	 * pre-AU27 signature's own behaviour exactly.
	 */
	readonly resolveModel?: (
		tier: import("@hyperidle/domain-model").ModelTier,
		modelOverride?: {
			readonly modelId: string | null;
			readonly modelProvider: string | null;
		},
	) => Promise<import("@hyperidle/domain-model").ResolvedModel | undefined>;
	readonly ports?: RuntimePorts;
	readonly durableQueue?: Parameters<RuntimePorts["sessionRequests"]["drainIntents"]>[0];
	readonly composition: {
		readonly context: Parameters<typeof import("./context.js").createContextAssembler>[0];
		readonly provisioner?: Omit<
			Parameters<typeof import("./provisioner.js").createProvisioner>[0],
			"contextAssembly"
		>;
		readonly writeback?: Omit<
			Parameters<
				ReturnType<typeof import("./writeback-processor.js").createWritebackProcessor>["subscribe"]
			>[0],
			"eventBus"
		>;
		readonly worker?: {
			readonly pool: Parameters<typeof import("./worker-ingress.js").createWorkerIngress>[0];
			readonly adapterFactory: Parameters<
				typeof import("./worker-ingress.js").createWorkerIngress
			>[1];
		};
		readonly reapers?: {
			readonly sandboxes?: Parameters<
				ReturnType<typeof import("./runtime-reapers.js").createRuntimeReapers>["startSandboxes"]
			>[0];
			readonly routines?: Parameters<
				ReturnType<
					typeof import("./runtime-reapers.js").createRuntimeReapers
				>["reapRoutineSessions"]
			>[0];
		};
	};
}
export interface RuntimeHandle {
	registerWorkerWebSocket(
		...args: Parameters<
			ReturnType<typeof import("./worker-ingress.js").createWorkerIngress>["register"]
		>
	): () => void;
	dispose(): Promise<void>;
}
