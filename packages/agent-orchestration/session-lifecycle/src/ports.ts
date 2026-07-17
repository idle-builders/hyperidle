/**
 * `session-lifecycle` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (as
 * refined during this migration — the census is "a floor, refinable during
 * migration", §14). Real outbound edges (`routine`, `work`, `users`,
 * `settings`, `observability`, `session-requests`, `cost`) are ordinary
 * downward-or-intra-layer edges, wired by the composition root
 * (`packages/server/src/services/session-lifecycle-bindings.ts`) to each
 * target's real exported functions. `filesystems` and `connections` are
 * NEW census additions this migration surfaced (both raw `@hyperidle/*`
 * imports at original census time — `session-provisioning.ts`'s
 * `listFilesystemIdsByAgent`/`listFilesystemsByIds` calls and its dynamic
 * `await import("@hyperidle/connections")` block — neither was a countable
 * relative-import edge until this migration made them real cross-package
 * touches). `harness-registry`/`mcp-provider`/`tool-provider` (the
 * execution-layer `§` seams, Increment 4) stay INTERIM forward-references,
 * wired to their still-flat `packages/server` files, same shape as
 * `run-orchestration`'s own Increment-3c interim ports before their targets
 * migrated. `context-assembly` was ALSO an interim forward-reference at this
 * Service's own Increment-3i migration; it is now real (Increment 3
 * context-assembly finalize) — `SessionLifecycleContextAssembly` below is
 * wired by the composition root to `@hyperidle/context-assembly`'s real
 * `createContextAssemblyOps` output (`packages/server/src/services/
 * context-assembly-bindings.ts`).
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or typed directly off `@hyperidle/db`/`@hyperidle/shared` row types
 * per §7.3 W4) rather than imported from the target package — a Service
 * NEVER imports another Service, even for a type-only reference (`dispatch`'s
 * `ports.ts` top `@lore` established this precedent first).
 *
 * @lore AU19 Increment 3i — the `session-requests` edge was undercounted:
 * the original census only listed `sessionRunRegistry` (2 call sites,
 * `session-provisioning.ts`). `session-lifecycle.ts`'s own
 * `requestAgentTermination`/`recoverRequestedTerminations`/
 * `transitionAgentRunLifecycle` ALSO raw-read/wrote `agentSessionRequests`
 * directly pre-migration — a Table ACL violation the moment
 * `session-lifecycle.ts` becomes its own Service package (`agentSessionRequests`
 * is `session-requests`' `TABLE_OWNER`). Closed by two new
 * `@hyperidle/session-requests` exports
 * (`requestAgentSessionTermination`/`findAgentSessionRequestTerminationReasonInTx`)
 * plus reusing the already-exported `listRunningAgentSessionRequests` (filtered
 * client-side for a pending termination reason) — see that package's
 * `agent-session-requests.ts` top `@lore` for each.
 */

import type { AgentSessionRequest, Bet, HyperIdleDb, Routine, Task, User } from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	ConversationMessage,
	EventBus,
	HarnessEvent,
	ModelTier,
	ResolvedModel,
	ReturnEnforcementChannel,
	SessionConfig,
	SessionHandle,
	SessionMetrics,
	SessionOutcome,
	SessionWorkflow,
	TaskState,
	UserRole,
} from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// Local structural mirror of `@hyperidle/work`'s `task-audit.ts` audit-trail
// union — `revertTaskToAccepted` JSON.parse/stringify's `tasks.auditTrail`.
// Mechanism C forbids importing `@hyperidle/work`'s own type, even type-only
// (same idiom `policy`'s `handoff-protocol.ts` already established for the
// identical shape — see that file's own local mirror).
// ---------------------------------------------------------------------------

export interface SessionLifecycleStateTransitionAuditEntry {
	readonly from: TaskState;
	readonly to: TaskState;
	readonly timestamp: string;
	readonly reason?: string;
}

interface SessionLifecycleHandoffAuditEntry {
	readonly type: "handoff";
	readonly fromAgent: string;
	readonly toAgent?: string;
	readonly toHuman?: boolean;
	readonly reason: string;
	readonly timestamp: string;
}

export type SessionLifecycleTaskAuditEntry =
	| SessionLifecycleStateTransitionAuditEntry
	| SessionLifecycleHandoffAuditEntry;

// ---------------------------------------------------------------------------
// routine — SessionLifecycleRoutineAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

export interface SessionLifecycleRoutineAccessor {
	getRoutineById(db: HyperIdleDb, id: string): Promise<Routine | undefined>;
	findRunningRoutineRun(
		db: HyperIdleDb,
		routineId: string,
	): Promise<{ readonly id: string } | undefined>;
	updateRoutineRunById(
		db: HyperIdleDb,
		id: string,
		patch: {
			readonly outcome: "success" | "error" | "budget_exhausted" | "timeout";
			readonly sessionId?: string;
			readonly endedAt?: string;
			readonly costMinor?: number | null;
			readonly costCurrency?: string | null;
			readonly summary?: string;
			readonly errorMessage?: string;
		},
	): Promise<void>;
	updateRoutineById(
		db: HyperIdleDb,
		id: string,
		patch: { readonly lastRunAt?: string; readonly lastRunSummary?: string },
	): Promise<void>;
	/** Closes the coalesce-ownership gap (`@hyperidle/routine`'s `incrementRoutineCost`). */
	incrementRoutineCost(
		db: HyperIdleDb,
		id: string,
		deltaMinor: number,
		currency: string,
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// work — SessionLifecycleWorkAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

export interface SessionLifecycleWorkAccessor {
	getTaskById(db: HyperIdleDb, id: string): Promise<Task | undefined>;
	updateTaskById(
		db: HyperIdleDb,
		id: string,
		patch: { readonly state?: TaskState; readonly auditTrail?: string },
	): Promise<void>;
	getBetById(db: HyperIdleDb, id: string): Promise<Bet | undefined>;
	updateBetById(
		db: HyperIdleDb,
		id: string,
		patch: { readonly tokensActualJson?: string },
	): Promise<void>;
	/** `@hyperidle/work`'s `transitionTask` state machine — the composition root pre-binds its own AC-9 `workIntents.record` dep to `session-requests`' `recordAgentWorkIntent`, same idiom `cost-bindings.ts`/`session-requests-bindings.ts` use for other bound singletons. */
	transitionTask(
		db: HyperIdleDb,
		eventBus: EventBus,
		taskId: string,
		toState: TaskState,
		dispatchOccasion?: "accepted" | "retry",
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// users — SessionLifecycleUserReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

export interface SessionLifecycleUserReader {
	getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
	getFirstUserByKind(db: HyperIdleDb, kind: string): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// settings — SessionLifecycleSettingsReader (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

export interface SessionLifecycleSettingsReader {
	readServerConfig(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
}

// ---------------------------------------------------------------------------
// observability — SessionLifecycleObservability (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

export interface SessionLifecycleObservability {
	summarizeToolArgs(args: Record<string, unknown>): string;
}

// ---------------------------------------------------------------------------
// filesystems — SessionLifecycleFilesystemsReader (NEW census edge — AO2 mount
// resolution; `mountFilesystemsForAgent`'s raw `@hyperidle/filesystems` calls
// were never a countable relative-import edge at original census time)
// ---------------------------------------------------------------------------

export interface SessionLifecycleFilesystemRow {
	readonly id: string;
	readonly teamId: string;
	readonly source: string;
	readonly kind: string;
	readonly connectionId: string | null;
	readonly resourceRef: string;
	readonly writeback: string;
	readonly state: string;
	readonly createdAt: string;
}

export interface SessionLifecycleFilesystemsReader {
	listFilesystemIdsByAgent(db: HyperIdleDb, agentId: string): Promise<readonly string[]>;
	listFilesystemsByIds(
		db: HyperIdleDb,
		ids: readonly string[],
	): Promise<readonly SessionLifecycleFilesystemRow[]>;
}

// ---------------------------------------------------------------------------
// connections — SessionLifecycleConnectionsProvisioner (NEW census edge —
// AN2 Phase 8b-connections; `session-provisioning.ts`'s dynamic
// `await import("@hyperidle/connections")` was already Mechanism-C-aware
// (Increment 1h's `deps.users` port on `resolveOwningHumanUserId`) but the
// dynamic import itself was never converted to a DI port — the AST scanner
// (`composition-boundary-guard.ts`) flags dynamic `import()` too, so it must
// convert the moment this file enters a Service package.)
// ---------------------------------------------------------------------------

export interface SessionLifecycleServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

export interface SessionLifecycleResolvedMcpServer {
	readonly name: string;
	readonly url: string;
	readonly bearerToken?: string;
}

export interface SessionLifecycleProvisioningPlan {
	readonly mcpServers: readonly SessionLifecycleResolvedMcpServer[];
	readonly envInjections: Readonly<Record<string, string>>;
}

export interface SessionLifecycleConnectionsProvisioner {
	resolveOwningHumanUserId(db: HyperIdleDb): Promise<string>;
	buildProvisioningPlan(deps: {
		readonly db: HyperIdleDb;
		readonly resolver: SessionLifecycleServiceConnectionResolver;
		readonly userId: string;
	}): Promise<SessionLifecycleProvisioningPlan>;
	applyProvisioningPlan(args: {
		readonly plan: SessionLifecycleProvisioningPlan;
		readonly sandboxPath: string;
		readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
		readonly claudeNative: boolean;
	}): Promise<{ readonly mcpTokenEnv: Record<string, string> }>;
}

// ---------------------------------------------------------------------------
// session-requests — SessionLifecycleSessionRequestsAccessor (ordinary
// same-layer edge, real target — Mechanism C still requires a port, see
// `session-requests`'s own `→ trigger-resolution` port precedent)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/session-requests`'s `sessionRunRegistry` — a dependency-free process-singleton leaf. */
export interface SessionLifecycleSessionRunEntry {
	readonly signalAbort: () => void;
	readonly handle: SessionHandle;
	readonly adapter: SessionLifecycleHarnessAdapter;
}

export interface SessionLifecycleSessionRunRegistry {
	register(sessionId: string, entry: SessionLifecycleSessionRunEntry): void;
	deregister(sessionId: string): void;
	has(sessionId: string): boolean;
	abort(sessionId: string): Promise<boolean>;
}

export interface SessionLifecycleSessionRequestsAccessor {
	readonly sessionRunRegistry: SessionLifecycleSessionRunRegistry;
	recordAgentWorkIntent(
		db: HyperIdleDb,
		input: {
			readonly kind: string;
			readonly sourceKind: string;
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
		},
	): Promise<{ readonly id: string; readonly idempotencyKey: string }>;
	/** `terminalizeAgentSessionRequestInTx` — already ordinary-DI'd via `session-requests-bindings.ts`, port-carried here for `transitionAgentRunLifecycle`'s same-tx precedence read + terminal write. */
	terminalizeAgentSessionRequestInTx(
		tx: HyperIdleDb,
		input:
			| {
					readonly requestId: string;
					readonly precondition: "running";
					readonly sessionId: string;
					readonly state: "completed" | "failed" | "cancelled";
					readonly failureCode?: string;
					readonly errorMessage?: string;
					readonly requireNoTerminationReason?: boolean;
			  }
			| {
					readonly requestId: string;
					readonly precondition: "claimed";
					readonly claimToken: string;
					readonly state: "failed";
					readonly failureCode?: string;
					readonly errorMessage?: string;
			  },
	): Promise<AgentSessionRequest | null>;
	/** Tx-scoped precedence read — see this file's top `@lore`. */
	findAgentSessionRequestTerminationReasonInTx(
		tx: HyperIdleDb,
		requestId: string,
	): Promise<string | null | undefined>;
	requestAgentSessionTermination(
		db: HyperIdleDb,
		input: { readonly requestId: string; readonly reason: string; readonly requestedBy?: string },
	): Promise<"accepted" | "idempotent" | "conflict" | "terminal">;
	listRunningAgentSessionRequests(db: HyperIdleDb): Promise<readonly AgentSessionRequest[]>;
}

// ---------------------------------------------------------------------------
// cost — SessionLifecycleCostAccessor (ordinary same-layer edge, real target)
// ---------------------------------------------------------------------------

export interface SessionLifecycleCostCapResult {
	allowed: boolean;
	level?: "agent" | "team" | "factory";
	currentSpend?: number;
	cap?: number;
}

export interface SessionLifecycleCostAccessor {
	checkCostCap(
		db: HyperIdleDb,
		eventBus: EventBus,
		params: {
			readonly agentId: string;
			readonly teamId?: string;
			readonly factoryCap?: number;
			readonly factorySpend?: number;
		},
	): Promise<SessionLifecycleCostCapResult>;
	recordCostAndCheck(
		db: HyperIdleDb,
		eventBus: EventBus,
		params: {
			readonly sessionId: string;
			readonly costMinor?: number;
			readonly currency?: string;
			readonly agentId: string;
			readonly teamId?: string;
			readonly taskId?: string;
			readonly factoryCap?: number;
			readonly factorySpend?: number;
			readonly reviewThreadId?: string;
		},
	): Promise<void>;
	/** `@hyperidle/cost`'s per-session dedup-map cleanup — pure in-memory, no DB, but still a real Service export (Mechanism C). */
	releaseSessionDedup(sessionId: string): void;
}

// ---------------------------------------------------------------------------
// harness-registry — SessionLifecycleHarnessRuntime (INTERIM forward-
// reference — `harness/*`'s full migration is Increment 4, same shape as
// `run-orchestration`'s own Increment-3c interim `AdapterPool` port)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/shared`'s `HarnessAdapter` plus the one builtin-only method this Service duck-types (never an `instanceof` class import, Mechanism C). */
export interface SessionLifecycleHarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<{
		readonly outcome: "completed" | "crashed" | "stopped";
		readonly cost: { readonly minor: number; readonly currency: string };
		readonly tokenUsage: unknown;
		readonly metrics?: SessionMetrics;
	}>;
	getCapabilities(): {
		readonly preCompactionTrigger: boolean;
		readonly subAgents: boolean;
		readonly modelProviders: readonly string[];
		readonly mcpSupport: boolean;
		readonly returnEnforcement: ReturnEnforcementChannel;
		readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
	};
	getForceReturnCount?(sessionId: string): number;
	/** Builtin-only method, duck-typed via `"setSessionToolRegistry" in harness` instead of `instanceof BuiltinHarnessAdapter` (Mechanism C forbids importing the class). */
	setSessionToolRegistry?(sessionId: string, registry: unknown): void;
}

export interface SessionLifecycleAdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

export interface SessionLifecycleSelectRequirements {
	readonly modelProviders?: readonly string[];
	readonly harnessType?: string;
	readonly disabledTypes?: readonly string[];
}

export interface SessionLifecycleSelectedEntry {
	readonly id: string;
	readonly adapter: SessionLifecycleHarnessAdapter;
	readonly meta: SessionLifecycleAdapterMeta;
}

export interface SessionLifecycleAdapterPool {
	select(requirements?: SessionLifecycleSelectRequirements): SessionLifecycleSelectedEntry | null;
	release(id: string): void;
}

export interface SessionLifecycleEnforcementEntry {
	readonly gate: { readonly returned: boolean };
	forceCount: number;
	readonly exempt: boolean;
}

export interface SessionLifecycleEnforcementRegistry {
	register(sessionId: string, entry: SessionLifecycleEnforcementEntry): void;
	get(sessionId: string): SessionLifecycleEnforcementEntry | undefined;
	incrementForce(sessionId: string): void;
	unregister(sessionId: string): void;
}

export interface SessionLifecycleReturnGate {
	observe(event: HarnessEvent): void;
	readonly returned: boolean;
}

export interface SessionLifecycleSandboxHandle {
	readonly sandboxId: string;
	readonly path: string;
}

export interface SessionLifecycleSandboxAdapter {
	spawn(baseDir: string): Promise<SessionLifecycleSandboxHandle>;
	exec(
		handle: SessionLifecycleSandboxHandle,
		command: string,
	): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;
	destroy(handle: SessionLifecycleSandboxHandle): Promise<void>;
}

export interface SessionLifecycleHarnessRuntime {
	enforcementRegistry: SessionLifecycleEnforcementRegistry;
	createReturnGate(): SessionLifecycleReturnGate;
	evaluateReturn(
		gate: SessionLifecycleReturnGate,
		endReason: "completed" | "crashed" | "stopped" | "budget_exhausted",
	): "returned" | "not_returned";
	provisionReturnHook(opts: {
		readonly sandboxPath: string;
		readonly channel: ReturnEnforcementChannel;
		readonly bridgeToken: string;
		readonly mcpUrl: string;
		readonly forceBudget: number;
	}): Promise<void>;
	writeCliMcpConfig(params: {
		readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
		readonly sandboxPath: string;
		readonly mcpUrl: string;
		readonly token: string;
	}): { readonly tokenEnv?: Record<string, string> };
}

// ---------------------------------------------------------------------------
// mcp-provider — SessionLifecycleMcpProvider (INTERIM forward-reference)
// ---------------------------------------------------------------------------

export interface SessionLifecycleMcpBridgeInstance {
	readonly token: string;
	readonly sessionId: string;
}

export interface SessionLifecycleMcpBridgeRegistry {
	register(instance: SessionLifecycleMcpBridgeInstance): void;
	unregister(token: string): Promise<void>;
}

export interface SessionLifecycleMcpProvider {
	createMcpBridge(options: {
		readonly sessionId: string;
		readonly registry: unknown;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<SessionLifecycleMcpBridgeInstance>;
}

// ---------------------------------------------------------------------------
// tool-provider — SessionLifecycleToolProvider (INTERIM forward-reference —
// `tools/tool-registry.ts`'s C1 split into `tool-provider`/`tool-handlers`
// is Increment 4; today's whole `buildToolRegistry`/`toolsForRole` unit is
// treated as one interim seam, same as `dispatch`'s own `toolHandlers` port)
// ---------------------------------------------------------------------------

/** Session-owned fields only (`IngestionHandle` is now this Service's own type, `contracts.ts`). */
export interface SessionLifecycleToolContext {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly teamId?: string;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
	};
	readonly sandboxPath: string;
	readonly ingestion: { dispose(): void };
	readonly onAbortSession?: (sessionId: string) => void;
}

/** `RegistrySessionWorkflow` (`tool-registry.ts`) — extends `@hyperidle/shared`'s `SessionWorkflow` with server-side capture anchors. This Service's own public `ProvisionSessionParams.sessionWorkflow` field type. */
export interface SessionLifecycleRegistrySessionWorkflow extends SessionWorkflow {
	readonly reviewMessageId: string;
	readonly subjectThreadId: string;
	readonly artifactId: string;
}

export interface SessionLifecycleToolRegistry {
	invoke(name: string, rawArgs: unknown): Promise<unknown>;
}

export interface SessionLifecycleToolProvider {
	buildToolRegistry(
		ctx: SessionLifecycleToolContext,
		options: {
			readonly role: UserRole;
			readonly extraTools?: readonly unknown[];
			readonly sessionWorkflow?: SessionLifecycleRegistrySessionWorkflow;
			readonly useOnlyExtraTools?: boolean;
		},
	): SessionLifecycleToolRegistry;
	toolsForRole(role: UserRole): readonly { readonly name: string; readonly description: string }[];
	/** `returnStatusTool.forRegistry(enforcementRegistry)` — opaque `RegisteredTool`, never inspected here. */
	returnStatusToolForRegistry(registry: SessionLifecycleEnforcementRegistry): unknown;
}

// ---------------------------------------------------------------------------
// context-assembly — SessionLifecycleContextAssembly (real, ordinary
// same-layer DI — `context-assembly` finalized per architecture §12's
// Increment-0 note; wired by the composition root to
// `@hyperidle/context-assembly`'s real `createContextAssemblyOps` output)
// ---------------------------------------------------------------------------

export interface SessionLifecycleContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
	readonly manifestPath: string;
}

export interface SessionLifecycleSessionContextData {
	readonly task: {
		readonly id: string;
		readonly title: string;
		readonly description: string | null;
		readonly state: string;
	};
	readonly bet: {
		readonly id: string;
		readonly description: string;
		readonly appetite: string;
		readonly doneCondition: string | null;
	};
	readonly agent: { readonly id: string; readonly name: string; readonly role: string };
	readonly team: { readonly id: string; readonly name: string };
}

export interface SessionLifecycleRoutineSessionContextData {
	readonly routine: {
		readonly id: string;
		readonly name: string;
		readonly description: string | null;
		readonly lastRunSummary: string | null;
	};
	readonly agent: { readonly id: string; readonly name: string; readonly role: string };
	readonly team: { readonly id: string; readonly name: string };
}

export interface SessionLifecycleToolSummary {
	readonly name: string;
	readonly description: string;
}

export interface SessionLifecycleContextAssembly {
	assembleAgentContext(input: {
		readonly db: HyperIdleDb;
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly taskId: string | null;
		readonly agentId: string;
		readonly agentRole: UserRole;
		readonly teamId: string | null;
		readonly isRoutine: boolean;
		readonly sourceKind: AgentSessionSourceKind | null;
		readonly sourceId: string | null;
		readonly sourceCorrelation: AgentSessionSourceCorrelation | null;
	}): Promise<SessionLifecycleContextAssemblyOutcome>;
	beginAgentWriteback(input: {
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly manifestPath: string;
		readonly eventBus: EventBus;
	}): { dispose(): void };
	buildSessionContextData(
		db: HyperIdleDb,
		config: {
			sessionId: string;
			taskId: string;
			agentId: string;
			agentRole: UserRole;
			productId: string;
		},
		/** I0c: optional pre-fetched agent — skips the getUserById call when supplied. */
		preloadedAgent?: { id: string; name: string; role: string },
	): Promise<SessionLifecycleSessionContextData>;
	buildRoutineSessionContextData(
		db: HyperIdleDb,
		config: {
			sessionId: string;
			routineId: string;
			agentId: string;
			agentRole: UserRole;
			teamId: string;
		},
	): Promise<SessionLifecycleRoutineSessionContextData>;
	assemblePrompt(input: {
		readonly systemPromptText: string;
		readonly context: SessionLifecycleSessionContextData;
		readonly tools: readonly SessionLifecycleToolSummary[];
		readonly sandboxPath: string;
	}): Promise<{ readonly assembledPrompt: string; readonly personaToolsTokens: number }>;
	assembleRoutinePrompt(input: {
		readonly systemPromptText: string;
		readonly context: SessionLifecycleRoutineSessionContextData;
		readonly tools: readonly SessionLifecycleToolSummary[];
		readonly sandboxPath: string;
	}): Promise<{ readonly assembledPrompt: string; readonly personaToolsTokens: number }>;
	composeAssistantPrompt(systemPromptText: string): { readonly composedPrompt: string };
	writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/** Every real/interim outbound port `session-provisioning.ts`/`session-lifecycle.ts`/`routine-session-reaper.ts` need. */
export interface SessionLifecyclePorts {
	readonly routine: SessionLifecycleRoutineAccessor;
	readonly work: SessionLifecycleWorkAccessor;
	readonly users: SessionLifecycleUserReader;
	readonly settings: SessionLifecycleSettingsReader;
	readonly observability: SessionLifecycleObservability;
	readonly filesystems: SessionLifecycleFilesystemsReader;
	readonly connections: SessionLifecycleConnectionsProvisioner;
	readonly sessionRequests: SessionLifecycleSessionRequestsAccessor;
	readonly cost: SessionLifecycleCostAccessor;
	readonly harnessRuntime: SessionLifecycleHarnessRuntime;
	readonly mcpProvider: SessionLifecycleMcpProvider;
	readonly toolProvider: SessionLifecycleToolProvider;
	readonly contextAssembly: SessionLifecycleContextAssembly;
}

// Re-exported so `session-provisioning.ts`/other in-package files can name
// the shared param/return types without re-declaring them.
export type {
	ConversationMessage as SessionLifecycleConversationMessage,
	ModelTier as SessionLifecycleModelTier,
	ResolvedModel as SessionLifecycleResolvedModel,
	SessionOutcome as SessionLifecycleSessionOutcome,
};
