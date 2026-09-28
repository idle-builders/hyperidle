import type { AgentSessionRequest, AgentWorkIntent, HyperIdleDb } from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	BakedAgentRunnableConfig,
	BakedContextBundle,
	BakedSessionResumeRequest,
	ModelTier,
	SessionOutcome,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ConversationMessage, SessionMetrics } from "@hyperidle/harness-protocol";

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
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
	};
	/** Opaque pass-through — `session-lifecycle`-owned `RegistrySessionWorkflow`. Never inspected here. */
	readonly sessionWorkflow?: unknown;
	readonly contextBundle?: BakedContextBundle;
	readonly agentConfig?: BakedAgentRunnableConfig;
	readonly harnessDisabled?: readonly string[];
	readonly callingThreadId?: string;
	readonly transcript?: readonly ConversationMessage[];
	// @lore: resume — present only for session_resume; harness reopens its own session and takes verdict as user turn; nothing is composed
	readonly resume?: BakedSessionResumeRequest;
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

/** Application-injected port for "dispatch a run to some execution". */
export interface HarnessPort<TDb = unknown> {
	admitSession(deps: HarnessPortDeps<TDb>, bundle: RunContextBundle): Promise<AdmittedRun>;
	runSession(
		deps: HarnessPortDeps<TDb>,
		bundle: RunContextBundle,
		admitted: AdmittedRun,
		onHarnessStarted?: () => void,
	): Promise<HarnessRunOutput>;
}

interface DurableQueueDeps {
	readonly db: HyperIdleDb;
	// @lore: DurableQueueDeps.eventBus — admission failures must emit; a missing bus silently drops failed admission events
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
				  },
			options?: { now?: Date },
		): Promise<
			| AgentSessionRequest
			| null
			| boolean
			// biome-ignore lint/suspicious/noConfusingVoidType: matches another overload of this port that returns Promise<void>; replacing with `undefined` breaks overload-signature compatibility.
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
		): Promise<{ intents: number }>;
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
			readonly modelTier?: RunContextBundle["modelTier"];
			readonly sessionWorkflow?: RunContextBundle["sessionWorkflow"];
	  }
	| {
			readonly mode: "one-shot";
			readonly completion: "admit" | "await";
			readonly input: RunContextBundle;
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
	 * An optional per-agent model override
	 * (baked onto every kind's `agentConfig.modelId`/`modelProvider`, uniform,
	 * not assistant-only). Absent means "no override, tier only" — matches the
	 * earlier signature's own behaviour exactly.
	 */
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
