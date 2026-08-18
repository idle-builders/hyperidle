import type {
	AgentSessionRequest,
	AgentWorkIntent,
	ExplicitSessionStart,
	HyperIdleDb,
} from "@hyperidle/db";
import type { AgentSessionSourceKind } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { HarnessPort, HarnessRunOutput, RunContextBundle } from "@hyperidle/harness-protocol";

interface DurableQueueDeps {
	readonly db: HyperIdleDb;
	/**
	 * @lore AU21 §6 Decision B4: mirrors the private `DurableQueueDeps.eventBus`
	 * in `@hyperidle/session-requests` (Mechanism C — this Service declares its
	 * own structural copy rather than importing that type directly). Optional
	 * for the same back-compat reason: existing `durableQueue` overrides that
	 * never wired one keep compiling.
	 */
	readonly eventBus?: EventBus;
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
export type RunTransitionResult = Awaited<
	ReturnType<typeof import("./transition-run.js").transitionRun>
>;
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
export type AgentTerminationReason = "user_done" | "user_crashed" | "handoff" | "shutdown";
