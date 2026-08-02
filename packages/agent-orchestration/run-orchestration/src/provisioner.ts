/** Consolidated private session provisioner and its DI boundary. */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	AL6_MAX_FORCE_RETURNS,
	type BakedAgentRunnableConfig,
	type BakedContextBundle,
	type CapturedToolCall,
	ConcurrencyLimitError,
	type ConversationMessage,
	CostCapExceededError,
	type EventBus,
	type Filesystem,
	type FilesystemMounter,
	type HarnessEvent,
	isInternalExtractionDrain,
	isReturnAction,
	MissingCredentialError,
	MODEL_TIERS,
	type ModelTier,
	NoEligibleHarnessError,
	type ResolvedModel,
	type ReturnEnforcementChannel,
	type SessionConfig,
	type SessionHandle,
	type SessionMetrics,
	type SessionOutcome,
	type SessionResult,
	type SessionWorkflow,
	scaleForCurrency,
	TargetAgentNotRunnableError,
	type UserRole,
} from "@hyperidle/shared";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { routineSessionContextDataFromBundle, sessionContextDataFromBundle } from "./context.js";
import {
	type FilesystemForProvisioning,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
import { transitionRun } from "./transition-run.js";

type TransitionSpec = Parameters<typeof transitionRun>[1];
type SessionContext = Extract<TransitionSpec, { target: "session" }>["context"];

interface IngestionHandle {
	dispose(): void;
}

// ---- ports ----

// ---------------------------------------------------------------------------
// AU21 §9 Increment 12 (Decision H3), Wave E: `SessionLifecycleRoutineAccessor`
// (`getRoutineById`)/`SessionLifecycleSettingsReader` (`readServerConfig`) are
// DELETED entirely — `run-orchestration` holds ZERO `-> routine`/
// `-> settings` edge, read or write. `admitSession`'s Phase 3 `harnessDisabled`
// read and the admission-time routine per-run cap read are replaced by baked
// data every per-kind resolver now supplies on the drained request:
//   - Phase 3: `params.harnessDisabled` (global server config, baked
//     alongside `agentConfig` by the same four `contextBundle` resolvers —
//     `assistant_turn`/`session_start` bake it too, at their one real emit
//     site each, so no kind silently loses the admin's disabled-harness-types
//     enforcement).
//   - The admission-time routine per-run cap: `params.contextBundle.routine
//     .costCapPerRunMinor` (baked by the routine resolver from the SAME
//     `routine` row it already loads to validate).
//
// @lore AU21 §9 Increment 12 (Decision H3), Wave E — THIRD, founder-FINAL
// pass on the emit→deactivate→drain race (architecture.md §12's
// "RE-CORRECTED (founder, 2026-08-01)" note). History: pass one kept this
// section's now-deleted `SessionLifecycleAgentRunnabilityReader` — a narrow
// live `kind`/`status` re-check — reasoning a baked snapshot alone could
// never catch a real deactivation race. The founder rejected pass one
// outright: "the orchestration is a blind executer." Pass two replaced the
// live read with a push-based event+subscriber mechanism instead — ALSO
// rejected: "why does that even play a role for orchestration to know? if an
// agent is deactivated then core will not send a request... if it doesn't
// get a request to do something it doesn't do something." Orchestration
// never initiates anything on its own — every unit of work originates from a
// request core already sent — so there is NO mechanism needed here at all,
// live or pushed. The resolution is a pure DELETION, no replacement of any
// kind: `run-orchestration` holds ZERO `-> users` edge. Phase 1's baked
// `kind`/`status` check (below, in `admitSession`) is DEFENSE-IN-DEPTH ONLY —
// a consistency assertion against a resolver bug that baked an
// already-invalid snapshot — never a live authority gate; every other Phase
// 1 field (`role`/`systemPrompt`/`modelTierPreference`/`harnessType`/
// `modelProvider`/`maxConcurrentSessions`/`teamId`) also comes from this same
// baked `agentConfig` snapshot, unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// observability — SessionLifecycleObservability (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

interface SessionLifecycleObservability {
	summarizeToolArgs(args: Record<string, unknown>): string;
}

// ---------------------------------------------------------------------------
// filesystems (AU21 §9 Increment 12 follow-up, F2 gap closure): the former
// `SessionLifecycleFilesystemsReader` seam port is DELETED entirely —
// `run-orchestration` holds ZERO `-> filesystems` read edge. The agent's
// injected filesystem list is now baked at EMIT time onto
// `ProvisionSessionParams.injectedFilesystems` by every per-kind resolver
// (`@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`), the SAME
// principle Wave E already applied to `agentConfig`/`harnessDisabled`. See
// `filesystem-provisioning.ts`'s own top-of-file `@lore` for the full trace.
// ---------------------------------------------------------------------------

interface SessionLifecycleServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

interface SessionLifecycleResolvedMcpServer {
	readonly name: string;
	readonly url: string;
	readonly bearerToken?: string;
}

interface SessionLifecycleProvisioningPlan {
	readonly mcpServers: readonly SessionLifecycleResolvedMcpServer[];
	readonly envInjections: Readonly<Record<string, string>>;
}

/**
 * AU21 §9 Increment 8, Decision F2: `buildProvisioningPlan`'s own seam-shaped
 * `{connections, resolver}` deps (`./connection-provisioning.js`) now live
 * behind THIS narrower port — `agentId` is the actor the composition root
 * resolves onto `CoreApiPort.connections.listHeldConnectionsForProvisioning()`
 * internally (never a raw `db`); `resolver` stays the Application-composed
 * direct dependency it always was (AN1 hard-rule 1).
 */
interface SessionLifecycleConnectionsProvisioner {
	buildProvisioningPlan(deps: {
		readonly agentId: string;
		readonly resolver: SessionLifecycleServiceConnectionResolver;
	}): Promise<SessionLifecycleProvisioningPlan>;
	applyProvisioningPlan(args: {
		readonly plan: SessionLifecycleProvisioningPlan;
		readonly sandboxPath: string;
		readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
		readonly claudeNative: boolean;
	}): Promise<{ readonly mcpTokenEnv: Record<string, string> }>;
}

interface SessionLifecycleCostCapResult {
	allowed: boolean;
	level?: "agent" | "team" | "factory";
	currentSpend?: number;
	cap?: number;
}

interface SessionLifecycleCostAccessor {
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
}
interface SessionLifecycleHarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<SessionResult>;
	getCapabilities(): {
		readonly preCompactionTrigger: boolean;
		readonly subAgents: boolean;
		readonly modelProviders: readonly string[];
		readonly mcpSupport: boolean;
		readonly returnEnforcement: ReturnEnforcementChannel;
		readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
	};
	getForceReturnCount?(sessionId: string): number;
	setSessionToolRegistry?(sessionId: string, registry: unknown): void;
}

interface SessionLifecycleAdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

interface SessionLifecycleSelectRequirements {
	readonly modelProviders?: readonly string[];
	readonly harnessType?: string;
	readonly disabledTypes?: readonly string[];
}

interface SessionLifecycleSelectedEntry {
	readonly id: string;
	readonly adapter: SessionLifecycleHarnessAdapter;
	readonly meta: SessionLifecycleAdapterMeta;
}

interface SessionLifecycleAdapterPool {
	select(requirements?: SessionLifecycleSelectRequirements): SessionLifecycleSelectedEntry | null;
	release(id: string): void;
}

interface SessionLifecycleEnforcementEntry {
	readonly gate: { readonly returned: boolean };
	forceCount: number;
	readonly exempt: boolean;
}

interface SessionLifecycleEnforcementRegistry {
	register(sessionId: string, entry: SessionLifecycleEnforcementEntry): void;
	get(sessionId: string): SessionLifecycleEnforcementEntry | undefined;
	incrementForce(sessionId: string): void;
	unregister(sessionId: string): void;
}

interface SessionLifecycleReturnGate {
	observe(event: HarnessEvent): void;
	readonly returned: boolean;
}

interface SessionLifecycleSandboxHandle {
	readonly sandboxId: string;
	readonly path: string;
}

interface SessionLifecycleSandboxAdapter {
	spawn(baseDir: string): Promise<SessionLifecycleSandboxHandle>;
	exec(
		handle: SessionLifecycleSandboxHandle,
		command: string,
	): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;
	destroy(handle: SessionLifecycleSandboxHandle): Promise<void>;
}

interface SessionLifecycleHarnessRuntime {
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
	}): Promise<{ readonly tokenEnv?: Record<string, string> }>;
}

interface SessionLifecycleMcpBridgeRegistry {
	open(options: {
		readonly sessionId: string;
		readonly registry: unknown;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string }>;
	close(token: string): Promise<void>;
}

interface SessionLifecycleToolContext {
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
interface SessionLifecycleRegistrySessionWorkflow extends SessionWorkflow {
	readonly reviewMessageId: string;
	readonly subjectThreadId: string;
	readonly artifactId: string;
}

interface SessionLifecycleToolRegistry {
	invoke(name: string, rawArgs: unknown): Promise<unknown>;
}

interface SessionLifecycleToolProvider {
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

interface SessionLifecycleContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
	readonly manifestPath: string;
}

interface SessionLifecycleSessionContextData {
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

interface SessionLifecycleRoutineSessionContextData {
	readonly routine: {
		readonly id: string;
		readonly name: string;
		readonly description: string | null;
		readonly lastRunSummary: string | null;
	};
	readonly agent: { readonly id: string; readonly name: string; readonly role: string };
	readonly team: { readonly id: string; readonly name: string };
}

interface SessionLifecycleToolSummary {
	readonly name: string;
	readonly description: string;
}

interface SessionLifecycleContextAssembly {
	assembleAgentContext(input: {
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
		readonly contextBundle?: BakedContextBundle;
	}): Promise<SessionLifecycleContextAssemblyOutcome>;
	beginAgentWriteback(input: {
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly manifestPath: string;
		readonly eventBus: EventBus;
	}): { dispose(): void };
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

interface SessionLifecyclePorts {
	readonly sessionRequests: {
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "id"; requestId: string },
		): Promise<AgentSessionRequest | undefined>;
		findSessionRequest(
			exec: HyperIdleDb,
			query: { by: "terminationReason"; requestId: string },
		): Promise<string | null | undefined>;
		listSessionRequests(
			exec: HyperIdleDb,
			filter: { status: "running" },
		): Promise<AgentSessionRequest[]>;
		transitionSessionRequest(
			exec: HyperIdleDb,
			transition:
				| { requestId: string; to: "termination-requested"; reason: string; requestedBy?: string }
				| {
						requestId: string;
						to: "completed" | "failed" | "cancelled";
						precondition: "running";
						sessionId: string;
						failureCode?: string;
						errorMessage?: string;
						requireNoTerminationReason?: boolean;
						transaction?: "existing";
				  }
				| {
						requestId: string;
						to: "failed";
						precondition: "claimed";
						claimToken: string;
						failureCode?: string;
						errorMessage?: string;
						transaction?: "existing";
				  },
		): Promise<
			| AgentSessionRequest
			| null
			| boolean
			| undefined
			| "accepted"
			| "idempotent"
			| "conflict"
			| "terminal"
		>;
		abortSessionRun(sessionId: string): Promise<boolean>;
		registerSessionRun(
			sessionId: string,
			control: {
				signalAbort(): void;
				handle: SessionHandle;
				adapter: SessionLifecycleHarnessAdapter;
			},
		): void;
		deregisterSessionRun(sessionId: string): void;
	};
	readonly observability: SessionLifecycleObservability;
	readonly connections: SessionLifecycleConnectionsProvisioner;
	readonly cost: SessionLifecycleCostAccessor;
	readonly harnessRuntime: SessionLifecycleHarnessRuntime;
	readonly toolProvider: SessionLifecycleToolProvider;
	readonly contextAssembly: SessionLifecycleContextAssembly;
}

/**
 * @lore AU21 §9 Increment 10a (Decision I): the `"decomposition"` sourceKind
 * branch this function used to special-case (a bet-decomposition PM turn's
 * "Turn this bet into concrete proposed tasks" prompt) is REMOVED — the
 * built-in bet_decomposition mechanism no longer exists, so no session can
 * ever be sourced from `"decomposition"` (the sourceKind is gone from
 * `AGENT_SESSION_SOURCE_KINDS`/`AgentSessionSourceKind` itself, not merely
 * unreachable). Every task-free session now goes through the generic
 * `sourceSection` below.
 */
async function assembleTaskFreePrompt(
	_db: HyperIdleDb,
	params: ProvisionSessionParams,
	systemPromptText: string,
	toolSummaries: readonly SessionLifecycleToolSummary[],
	_ports: SessionLifecyclePorts,
): Promise<string> {
	const toolSection =
		toolSummaries.length > 0
			? `\n\n## Tools\n${toolSummaries.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`
			: "";

	const sourceSection = params.requestContext
		? `## Session request\nSource kind: ${params.requestContext.sourceKind}\nSource ID: ${params.requestContext.sourceId}\nCorrelation: ${JSON.stringify(params.requestContext.sourceCorrelation)}`
		: "## Session request\nTask-free session request";
	return [systemPromptText, sourceSection, toolSection].filter(Boolean).join("\n\n");
}

/**
 * AR2: Read-only context passed to `onBeforeTeardown` observers.
 * Exposes the session identity and sandbox location — sufficient for a
 * harness integration test to read the real files a real agent produced.
 */
interface BeforeTeardownContext {
	readonly sessionId: string;
	readonly sandboxPath: string;
}

/**
 * Read-only pre-start observation point after session files are written and
 * before the external harness process is spawned.
 *
 * @lore session-setup proof: The harness-suite needs to prove AGENTS.md,
 * CLAUDE.md, MCP config, and return hooks are produced in the exact production
 * shape each binary reads, without spending an LLM call. This seam observes the
 * already-built SessionConfig and sandbox after Phase 8b/8b-enforce. Returning
 * "abort" stops before `harness.startSession` and lets normal teardown continue.
 */
interface BeforeHarnessStartContext {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly adapter: SessionLifecycleSelectedEntry;
	readonly sessionConfig: SessionConfig;
}
const PROVISIONER_EMITTED_FILES = [".mcp.json"] as const;

/**
 * Root-level files emitted into the sandbox.
 * Currently: .mcp.json (Claude MCP auto-discovery config).
 * Exported so the AO2 scaffolding-drift-guard can assert coverage.
 *
 * .mcp.json must be excluded from authored commits so the agent
 * working on a repo that tracks .mcp.json does not overwrite the real config.
 */

// ── AO2 — Phase 4.5 mount + teardown capture-back helpers ────────────────────
//
// @lore AU21 §9 Increment 8 (Decision F2): the mount operation itself
// (`mountFilesystemsForAgent`) relocated wholesale into this package's own
// `filesystem-provisioning.ts` (imported above) — only the seam-facing
// `SessionLifecycleFilesystemsReader` port type stays declared in this file.

/**
 * AO2 Hook B: Capture-back mounted filesystems before endSession/crashSession.
 *
 * Called BEFORE each endSession (which holds the rm -rf) and before crashSession
 * on the in-runSession crash path. Best-effort: a capture failure is logged but
 * never blocks teardown (uncommitted-but-failed = same loss as today).
 *
 * The delete lives in the terminal transition, not workspace.destroy
 * (adapter-map cleanup only, runs after the delete).
 * Anchoring capture "before workspace.destroy" would capture an already-deleted tree.
 * Must be called BEFORE endSession.
 */
async function captureMountedFilesystems(
	sessionId: string,
	sandboxPath: string,
	mountedFilesystems: Filesystem[],
	mounter: FilesystemMounter,
): Promise<void> {
	if (mountedFilesystems.length === 0) return;

	for (const filesystem of mountedFilesystems) {
		try {
			await mounter.captureBack({ filesystem, sandboxPath, sessionId });
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] AO2 captureBack threw for filesystem ${filesystem.id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}

interface ProvisionSessionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly adapterPool: SessionLifecycleAdapterPool;
	readonly workspace: SessionLifecycleSandboxAdapter;
	/** X2: MCP bridge registry. When present, a bridge is created per session. */
	readonly mcpBridgeRegistry?: SessionLifecycleMcpBridgeRegistry;
	/** X2: Base URL for MCP bridge (e.g., "http://localhost:3001"). */
	readonly mcpBaseUrl?: string;
	/**
	 * AN2: Already-constructed ServiceConnectionResolver (encapsulates serverSecret).
	 * When present, held connections are provisioned into the session sandbox.
	 * Mirrors the mcpBridgeRegistry? optional pattern: absent → graceful no-op.
	 */
	readonly serviceConnectionResolver?: SessionLifecycleServiceConnectionResolver;
	/**
	 * AR2: optional observation hook, fired once after the agent's turn fully
	 * drains and the sandbox is completely written, BEFORE teardown deletes it.
	 * Observes only — it cannot pause, defer, or cancel teardown, which runs
	 * unconditionally afterward even if this callback throws. Absent → no-op
	 * (every production caller omits it). Lets a harness integration test read
	 * the real files a real agent produced before deletion.
	 */
	readonly onBeforeTeardown?: (ctx: BeforeTeardownContext) => void | Promise<void>;
	/**
	 * Optional observation hook fired after prompt/context/MCP/hook files are written
	 * and before `harness.startSession`. Returning "abort" stops before spawning
	 * the external harness and continues through normal teardown. Production callers
	 * omit this; it exists for harness-facing integration tests that validate the
	 * prepared sandbox and binary config surfaces without making an LLM call.
	 */
	readonly onBeforeHarnessStart?: (
		ctx: BeforeHarnessStartContext,
	) => undefined | "abort" | Promise<undefined | "abort">;
	/**
	 * Optional observer fired after `harness.startSession` succeeds.
	 * Production callers use the explicit `runSession` callback path; this dep-level
	 * hook lets provisionSession-based integration tests prove an abort stopped
	 * before the external harness session started.
	 */
	readonly onHarnessStarted?: () => void;
	/**
	 * AO2: Optional mounter for filesystem placement + capture-back.
	 * When absent, sessions run without any filesystem mount (degrade to today's behavior).
	 * When present, mount runs after sandbox spawn (Phase 4.5) and captureBack runs before
	 * each endSession/crashSession call.
	 */
	readonly mounter?: FilesystemMounter;
}

interface ProvisionSessionParams {
	readonly taskId: string | null;
	readonly agentId: string;
	/** @lore U1: field name kept for backward compat; value is now a teams.id (formerly products.id). */
	readonly productId: string;
	readonly sandboxBasePath: string;
	readonly factoryCap?: number;
	readonly factorySpend?: number;
	readonly reviewThreadId?: string;
	readonly modelTier?: ModelTier;
	/**
	 * X4: Resolved model from the gateway. When present, passed through to the
	 * harness adapter via SessionConfig so the adapter uses the correct provider,
	 * model, and API key.
	 */
	readonly resolvedModel?: ResolvedModel;
	/**
	 * X6: Resolved fast-tier model for builtin harness summarization.
	 * Optional — when absent the builtin harness uses resolvedModel for all LLM
	 * calls including summarization (slightly higher cost, functionally equivalent).
	 */
	readonly resolvedFastModel?: ResolvedModel;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
		readonly triggerPromptOverride?: string;
	};
	/**
	 * AA2: When set, this session is a routine session. The provisioning orchestrator
	 * will use routine context (routineSessionContextDataFromBundle + assembleRoutinePrompt)
	 * instead of task/bet context, and will populate sessions.routineId.
	 */
	readonly routineId?: string;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — the baked entity+knowledge bundle
	 * this session's sandbox context (Phase 6) and prompt persona (Phase 8.5)
	 * are built from — `kind:"task"` for `task_run`/`reengagement`,
	 * `kind:"routine"` for `routine_run`. Sourced from the emit-time resolver
	 * via the drained `AgentSessionRequest.payloadJson` (zero db read here).
	 * Absent for `knowledge_action`/`session_start`/conversational turns.
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
	 * runnable-CONFIG snapshot, baked at EMIT time by every per-kind resolver
	 * (all six intent kinds) from the SAME `agent: User` row
	 * `requireRunnableAgent` already loaded + validated there (no new read —
	 * the exact H2/Increment 11 precedent `assistant-turn-resolver.ts`'s
	 * `modelId`/`modelProvider` bake already established). `role`/
	 * `systemPrompt`/`modelTierPreference`/`harnessType`/`modelProvider`/
	 * `maxConcurrentSessions`/`teamId` all come from THIS baked snapshot —
	 * staleness there is a UX/efficiency concern only.
	 *
	 * **`kind`/`status` are DEFENSE-IN-DEPTH ONLY, never a live authority gate**
	 * (founder-final, third pass — see this file's top-of-file Wave E `@lore`
	 * for the full trace): a resolver's `requireRunnableAgent` call guarantees
	 * this snapshot's `kind`/`status` are ALWAYS runnable at emit time, so
	 * re-checking them here can only catch a resolver bug, never a real
	 * emit→deactivate→drain race — and no live/pushed mechanism replaces it,
	 * by founder ruling (orchestration never initiates work on its own, so
	 * there is nothing for it to independently re-verify). A mismatch here
	 * signals a resolver bug, not a race, and is still a hard provisioning
	 * failure either way — same throw (`TargetAgentNotRunnableError`), same
	 * `agent_run_admission_failed` pre-handoff reporting channel
	 * (`runtime.ts`'s `reportPreAdmissionProvisioningFailure`). See
	 * `admitSession`'s Phase 1 for the check. Required for every durable
	 * (request-mediated) session; absent only on the `one-shot` mode
	 * (eval/direct-test seam — see `@hyperidle/eval`'s `provision-harness.ts`,
	 * which sources its own snapshot the same way, one level up the call
	 * stack), where its absence is a hard provisioning failure, not a silent
	 * allow.
	 */
	readonly agentConfig?: BakedAgentRunnableConfig;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the server's
	 * disabled-harness-types list, baked at emit time (global `settings`
	 * config, not per-agent) so Phase 3's adapter-selection filter no longer
	 * needs a live `ports.settings.readServerConfig` read. Absent defaults to
	 * "nothing disabled" (matches the settings row's own empty-array default)
	 * — unlike `agentConfig`, this is not a security gate, so a missing bake
	 * degrades gracefully rather than hard-failing.
	 */
	readonly harnessDisabled?: readonly string[];
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — the target agent's
	 * injected-filesystems list, baked at EMIT time by every per-kind resolver
	 * via `@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`
	 * (reusing the SAME `requireRunnableAgent`-resolved agentId each resolver
	 * already has in hand). Phase 4.5 mounts directly from this list — ZERO
	 * live `-> filesystems` read at provisioning time. Absent/empty means "no
	 * injected filesystems", matching the seam-based lookup's own empty-list
	 * behavior unchanged.
	 */
	readonly injectedFilesystems?: readonly FilesystemForProvisioning[];
	/**
	 * AL7 Task 6: When set, the registry invoke router participates in the
	 * trust-first review workflow for this session.
	 */
	readonly sessionWorkflow?: SessionLifecycleRegistrySessionWorkflow;
	/**
	 * AR4a: When set, this session is a CONVERSATIONAL-mode turn (the assistant
	 * replying to a thread message). Context assembly switches to the conversation
	 * branch — thread transcript is delivered via the assembled prompt / AGENTS.md
	 * so every harness receives it.
	 */
	readonly conversational?: {
		/** The thread the assistant is replying in. */
		readonly threadId: string;
		/** The assistant agent id (ast-${userId}). */
		readonly assistantAgentId: string;
		/**
		 * Caller-supplied draft tool surface (AR4a↔AR4b seam). Opaque — this
		 * Service never inspects anything beyond `.definitions`, forwarded whole
		 * to `buildToolRegistry`'s `extraTools`.
		 */
		readonly draftRegistry: { readonly definitions: readonly { readonly name: string }[] };
		/**
		 * Conversation messages for the builtin adapter's `runChatTurn` path.
		 * Load-bearing for builtin (NIT-4).
		 */
		readonly messages: ConversationMessage[];
		/**
		 * AR4b: Strategy formation answer — persona override for this turn.
		 * null = no override; use the agent row's systemPrompt as-is.
		 * undefined = not set by caller (pre-AR4b callers; treated as no override).
		 */
		readonly systemPromptOverride?: string | null;
	};
}

interface ProvisionSessionResult {
	readonly sessionId: string;
	/** AA3: widened to include "budget_exhausted" for per-run cap enforcement. */
	readonly outcome: SessionOutcome | "budget_exhausted";
	readonly totalCostCents: number;
	readonly taskId: string | null;
	/**
	 * AL6: Return-gate verdict for this session run. Present on all task-session
	 * outcomes ("returned" | "not_returned"). Absent (undefined) on assistant
	 * turns and extraction drains which use different provisioning paths.
	 */
	readonly returnVerdict?: "returned" | "not_returned";
	/**
	 * AL6 v3: Unified turn-level force injection count.
	 */
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
	/**
	 * AR4a: The agent's reply text for a CONVERSATIONAL-mode turn — the last
	 * non-empty `completion` event text from the drain. Present ONLY when
	 * `params.conversational` was set AND the session outcome is "completed".
	 */
	readonly conversationalReply?: string;
	/**
	 * AR4a: captured tool calls from the conversational turn.
	 */
	readonly conversationalToolCalls?: readonly CapturedToolCall[];
}

/**
 * AF7 §2: The synchronous result of admission (phases 1-7). Carries everything
 * `runSession` (phases 8-11) needs to run the harness and tear down. Produced by
 * `admitSession` AFTER the session row is committed and `session_started` emitted.
 */
interface AdmittedSession {
	readonly sessionId: string;
	readonly sessionContext: SessionContext;
	readonly agentRole: string;
	readonly teamId: string | undefined;
	readonly systemPromptText: string;
	readonly modelTier: ModelTier;
	readonly sandboxHandle: SessionLifecycleSandboxHandle;
	readonly sandboxPath: string;
	/** AK2: was `watcher: FileWatcher` — renamed to `ingestion: IngestionHandle` as part of Strategy port decoupling. */
	readonly ingestion: IngestionHandle;
	readonly selectedAdapter: SessionLifecycleSelectedEntry;
	readonly harness: SessionLifecycleHarnessAdapter;
	readonly adapterId: string;
	readonly routinePerRunCap: number | null;
	/**
	 * AO2: Filesystems that were successfully mounted in Phase 4.5 for this session.
	 */
	readonly mountedFilesystems: Filesystem[];
}

/**
 * AF7 §2 — Admit a session synchronously (phases 1-7).
 *
 * Runs the HTTP-observable prefix: load agent, cost pre-flight (P2), adapter
 * select + concurrency check (P3), **resolvedModel presence guard (WARNING-2,
 * pre-P5)**, task transition, workspace spawn (P4), session row insert (P5),
 * context assembly (P6), start watcher (P7), emit `session_started`. ALL admission
 * failures (CostCapExceeded 422 / ConcurrencyLimit 429 / MissingCredential 500)
 * throw BEFORE the P5 row insert — the detach boundary — so they map to HTTP
 * status on the POST path and never leave a doomed row.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: admission coordinates multi-phase pre-flight with error handling
async function admitSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	ports: SessionLifecyclePorts,
	/**
	 * AF7 §2: enforce the synchronous resolvedModel-presence guard for builtin
	 * adapters. Set ONLY on the HTTP POST path (startSessionProvision) so a missing
	 * resolved model maps to a 500 + no row.
	 */
	enforceResolvedModelGuard = false,
): Promise<AdmittedSession> {
	const { db, eventBus, adapterPool, workspace } = deps;

	// ── Phase 1: consume the baked agent-CONFIG snapshot. NO live re-check of
	// any kind (founder-final, third pass — see this file's top-of-file Wave E
	// `@lore` for the full trace of why the live re-check/event/subscriber
	// mechanisms explored in earlier passes are all deliberately absent here).
	const agentConfig = params.agentConfig;
	// @lore AU21 §12 (RE-CORRECTED, founder, 2026-08-01): the
	// emit→deactivate→drain race needs NO mechanism — orchestration never
	// initiates work on its own; every unit of work originates from a request
	// core already sent, so there is nothing for it to independently
	// re-verify. `agentConfig` absent entirely is treated the same as a
	// deactivated agent — every real durable path bakes it (Wave E, all six
	// intent kinds); a missing bake is a hard provisioning failure, never a
	// silent allow. Reported back via the same pre-handoff
	// `agent_run_admission_failed` channel — see `runtime.ts`'s
	// `runClaimedRequest` catch, `failureCode: "TARGET_AGENT_NOT_RUNNABLE"`.
	if (!agentConfig) {
		throw new TargetAgentNotRunnableError(params.agentId);
	}
	// Defense-in-depth ONLY, never a live authority gate: the baked
	// `kind`/`status` should always be runnable (every resolver validates via
	// `requireRunnableAgent` before baking) — a mismatch here signals a
	// resolver bug, not a race, and is still a hard provisioning failure
	// either way. There is no further live read after this.
	if (agentConfig.kind !== "ai" || !["active", "idle"].includes(agentConfig.status)) {
		throw new TargetAgentNotRunnableError(params.agentId);
	}
	const agentRole = agentConfig.role;
	const teamId = agentConfig.teamId ?? undefined;

	// X3: system prompt from the baked snapshot. No file read required.
	const systemPromptText = agentConfig.systemPrompt ?? "";

	// X3: Model tier priority: explicit param > agent preference > default "workhorse".
	const rawPreference = agentConfig.modelTierPreference;
	const agentPreference =
		rawPreference !== null &&
		rawPreference !== undefined &&
		(MODEL_TIERS as readonly string[]).includes(rawPreference)
			? (rawPreference as ModelTier)
			: null;
	const modelTier: ModelTier = params.modelTier ?? agentPreference ?? "workhorse";

	// ── Phase 2: cost cap pre-flight. Throws before any DB writes.
	const capResult = await ports.cost.checkCostCap(db, eventBus, {
		agentId: params.agentId,
		teamId,
		factoryCap: params.factoryCap,
		factorySpend: params.factorySpend,
	});
	if (!capResult.allowed) {
		throw new CostCapExceededError(
			capResult.level === "factory"
				? "factory"
				: capResult.level === "team"
					? (teamId ?? "team")
					: params.agentId,
			capResult.currentSpend ?? 0,
			capResult.cap ?? 0,
		);
	}

	// ── Phase 3: adapter selection + concurrency check + task transition.
	// Wave E: `harnessDisabled` comes from the baked request (no live
	// `ports.settings.readServerConfig` read) — absent defaults to "nothing
	// disabled", matching the settings row's own empty-array default.
	const harnessDisabled = params.harnessDisabled ?? [];
	const selectRequirements = {
		harnessType: agentConfig.harnessType ?? undefined,
		...(agentConfig.modelProvider
			? { modelProviders: [agentConfig.modelProvider] as readonly string[] }
			: {}),
		disabledTypes: harnessDisabled as readonly string[],
	};
	const selectedAdapter = adapterPool.select(selectRequirements);
	if (!selectedAdapter) {
		if (agentConfig.harnessType) {
			throw new NoEligibleHarnessError(agentConfig.harnessType);
		}
		throw new Error(
			`No available adapter in pool — all adapters are at capacity${agentConfig.harnessType ? ` (harnessType: ${agentConfig.harnessType})` : ""}`,
		);
	}
	const harness = selectedAdapter.adapter;
	const adapterId = selectedAdapter.id;

	// @lore AU9: request-mediated admission already reserved/adopted this exact
	// request's session before this concurrency check runs. Exclude the request's
	// own correlated session so it does not self-block against its own limit.
	const activeCountWhere = params.requestContext
		? and(
				eq(sessions.agentId, params.agentId),
				eq(sessions.state, "active"),
				or(isNull(sessions.requestId), ne(sessions.requestId, params.requestContext.requestId)),
			)
		: and(eq(sessions.agentId, params.agentId), eq(sessions.state, "active"));
	const [activeCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(activeCountWhere)
		.limit(1);
	if ((activeCount?.count ?? 0) >= agentConfig.maxConcurrentSessions) {
		adapterPool.release(adapterId);
		throw new ConcurrencyLimitError(params.agentId, agentConfig.maxConcurrentSessions);
	}

	// AF7 §2 (WARNING-2): resolvedModel presence guard — synchronous, pre-P5.
	if (
		enforceResolvedModelGuard &&
		selectedAdapter.meta.type === "builtin" &&
		!params.resolvedModel
	) {
		adapterPool.release(adapterId);
		throw new MissingCredentialError(
			`anthropic_api_key (required for builtin harness, tier: ${modelTier}) — set it in Settings > Models`,
		);
	}

	// AU21 §9 Increment 12 (Decision H3), Wave D: the AD2 "only transition if
	// not already in_progress" guard moved core-side — a task's `in_progress`
	// transition now fires as a `session_started` reaction
	// (`core-api/src/services/work-session-started-reactions.ts`), AFTER
	// phases 4-7 below commit the session row, instead of here before them.

	// ── Phases 4-7 (wrapped): spawn workspace → insert session row →
	// context assembly → start watcher. If any step throws here, the session
	// row/harness never fully launched — see the AU21 Wave D note above
	// `SessionLifecycleWorkAccessor`'s deletion for why no task-state revert
	// is needed: the task's `in_progress` transition itself only fires
	// reactively on `session_started`, emitted AFTER this block succeeds, so
	// a failure in this window never transitioned the task away from
	// `accepted`/`blocked` in the first place.
	let sessionId: string;
	let sandboxPath: string;
	let mountedFilesystems: Filesystem[] = [];
	// ── Phase 4: spawn sandbox via adapter.
	const sandboxHandle: SessionLifecycleSandboxHandle = await workspace.spawn(
		params.sandboxBasePath,
	);
	sandboxPath = sandboxHandle.path;

	// ── Phase 5: insert session row.
	const [reservedSession] = params.requestContext
		? await db
				.select()
				.from(sessions)
				.where(eq(sessions.requestId, params.requestContext.requestId))
				.limit(1)
		: [undefined];
	sessionId = reservedSession?.id ?? randomUUID();
	const startedAt = new Date().toISOString();
	const sessionValues = {
		id: sessionId,
		taskId: params.taskId,
		...(params.requestContext
			? {
					requestId: params.requestContext.requestId,
					sourceKind: params.requestContext.sourceKind,
					sourceId: params.requestContext.sourceId,
					sourceCorrelationJson: JSON.stringify(params.requestContext.sourceCorrelation),
				}
			: {}),
		agentId: params.agentId,
		modelTier,
		startedAt,
		state: "active",
		sandboxSnapshot: sandboxPath,
		// AA2: populate routineId when this is a routine session.
		...(params.routineId ? { routineId: params.routineId } : {}),
	};
	if (reservedSession) {
		await db
			.update(sessions)
			.set({ ...sessionValues, id: undefined })
			.where(eq(sessions.id, reservedSession.id));
	} else {
		await db.insert(sessions).values(sessionValues);
	}

	// ── Phase 4.5: mount injected filesystems (AO2). AU21 §9 Increment 12
	// follow-up (F2 gap closure): mounts from the BAKED `params.injectedFilesystems`
	// list — ZERO live seam read at provisioning time (see this file's own
	// top-of-file `filesystems` `@lore`).
	if (deps.mounter) {
		mountedFilesystems = await mountFilesystemsForAgent({
			injectedFilesystems: params.injectedFilesystems ?? [],
			sandboxPath,
			mounter: deps.mounter,
		});
	}

	// ── Phase 6: assemble context into the sandbox through the agent layer.
	if (params.taskId) {
		await ports.contextAssembly.assembleAgentContext({
			sandboxPath,
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			agentRole,
			teamId: params.productId,
			isRoutine: !!params.routineId,
			sourceKind: params.requestContext?.sourceKind ?? null,
			sourceId: params.requestContext?.sourceId ?? null,
			sourceCorrelation: params.requestContext?.sourceCorrelation ?? null,
			contextBundle: params.contextBundle,
		});
	} else if (params.requestContext) {
		await ports.contextAssembly.assembleAgentContext({
			sandboxPath,
			sessionId,
			taskId: null,
			agentId: params.agentId,
			agentRole,
			teamId: params.productId,
			isRoutine: !!params.routineId,
			sourceKind: params.requestContext.sourceKind,
			sourceId: params.requestContext.sourceId,
			sourceCorrelation: params.requestContext.sourceCorrelation,
			contextBundle: params.contextBundle,
		});
	}

	// ── Phase 7: begin writeback ingestion.
	const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
	const ingestion: IngestionHandle = ports.contextAssembly.beginAgentWriteback({
		sandboxPath,
		sessionId,
		manifestPath,
		eventBus,
	});

	// Emit session_started now that the workspace is ready.
	eventBus.emit({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		...(params.requestContext
			? {
					requestId: params.requestContext.requestId,
					sourceKind: params.requestContext.sourceKind,
					sourceId: params.requestContext.sourceId,
					sourceCorrelation: params.requestContext.sourceCorrelation,
				}
			: {}),
		timestamp: Date.now(),
	});

	const sessionContext: SessionContext = {
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		...(params.requestContext ? { requestContext: params.requestContext } : {}),
		sandboxPath,
		ingestion,
		// @lore AF4/§5: traceId correlates observability events for this session
		// (H3). The provisioning path owns the session, so it mints the id.
		traceId: randomUUID(),
		// AA2: pass routineId so endSession/crashSession can update routine_runs.
		...(params.routineId ? { routineId: params.routineId } : {}),
	};

	// AA3: per-run cost cap for routine sessions — Wave E: baked onto the
	// `contextBundle` by the routine resolver from the SAME `routine` row it
	// already loaded to validate (no live `ports.routine.getRoutineById` read).
	const routinePerRunCap: number | null =
		params.routineId && params.contextBundle?.kind === "routine"
			? (params.contextBundle.routine.costCapPerRunMinor ?? null)
			: null;

	return {
		sessionId,
		sessionContext,
		agentRole,
		teamId,
		systemPromptText,
		modelTier,
		sandboxHandle,
		sandboxPath,
		ingestion,
		selectedAdapter,
		harness,
		adapterId,
		routinePerRunCap,
		mountedFilesystems,
	};
}

/**
 * AF7 §2 — Run an admitted session (phases 8-11).
 *
 * Builds the session-scoped tool registry, composes the prompt, starts the
 * harness (P9), drains the event stream (P10), and tears down (P11). Normal
 * completion calls `endSession`; an error mid-stream calls `crashSession`.
 *
 * Registers itself in the `sessionRunRegistry` (AF7 §4/§5) at harness-start so a
 * PATCH/handoff can cooperatively abort it, and deregisters at teardown.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: run coordinates harness lifecycle, event-stream consumption, abort, and teardown
async function runSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	admitted: AdmittedSession,
	ports: SessionLifecyclePorts,
	/**
	 * AF7 §2: fired exactly once right after `harness.startSession` resolves
	 * (success OR failure). The dispatcher/await callers omit it.
	 */
	onHarnessStarted?: () => void,
): Promise<ProvisionSessionResult> {
	const {
		db,
		eventBus,
		adapterPool,
		workspace,
		mcpBridgeRegistry,
		mcpBaseUrl,
		serviceConnectionResolver,
	} = deps;
	const {
		sessionId,
		sessionContext,
		agentRole,
		teamId,
		systemPromptText,
		modelTier,
		sandboxHandle,
		sandboxPath,
		ingestion,
		selectedAdapter,
		harness,
		adapterId,
		routinePerRunCap,
		mountedFilesystems,
	} = admitted;

	// AF7 §5: cooperative abort flag for non-builtin adapters (the provisioning
	// event loop checks this each iteration). For builtin the real stop is
	// stopSession (wired via sessionRunRegistry.abort).
	let aborted = false;

	// ── Phase 8: build tool registry bound to this context.
	const toolContext: SessionLifecycleToolContext = {
		db,
		eventBus,
		agentId: params.agentId,
		sessionId,
		taskId: params.taskId ?? "",
		teamId,
		...(params.requestContext ? { requestContext: params.requestContext } : {}),
		sandboxPath,
		ingestion,
		// AL7 Task 6: inject abort callback so the workflow router can end session 1
		// after capturing the first irreversible call. Fire-and-forget is intentional.
		onAbortSession: params.sessionWorkflow
			? (abortedSessionId) => {
					void ports.sessionRequests.abortSessionRun(abortedSessionId).catch(() => {
						// Non-fatal: the harness may have already exited.
					});
				}
			: undefined,
	};
	// AR4a §3b seam: in conversational mode, forward the caller-supplied draft tool
	// surface into the registry.
	const conversationalDraftTools = params.conversational?.draftRegistry.definitions ?? [];
	// @lore AR4a: Conversational mode uses ONLY [draftTools + return-status] — no role tools.
	const registry: SessionLifecycleToolRegistry = params.conversational
		? ports.toolProvider.buildToolRegistry(toolContext, {
				role: agentRole,
				useOnlyExtraTools: true,
				extraTools: [
					ports.toolProvider.returnStatusToolForRegistry(ports.harnessRuntime.enforcementRegistry),
					...conversationalDraftTools,
				],
			})
		: ports.toolProvider.buildToolRegistry(toolContext, {
				role: agentRole,
				extraTools: [
					ports.toolProvider.returnStatusToolForRegistry(ports.harnessRuntime.enforcementRegistry),
				],
				sessionWorkflow: params.sessionWorkflow,
			});

	// ── Phase 8.5a: inject registry into builtin harness before startSession.
	if (
		selectedAdapter.meta.type === "builtin" &&
		typeof harness.setSessionToolRegistry === "function"
	) {
		harness.setSessionToolRegistry(sessionId, registry);
	}

	// ── Phase 8.5: compose prompt and write CLAUDE.md.
	const toolSummaries: SessionLifecycleToolSummary[] = ports.toolProvider
		.toolsForRole(agentRole)
		.map((d) => ({
			name: d.name,
			description: d.description,
		}));

	/** AR4a: true only in conversational mode — gates the reply-capture drain branch. */
	const isConversational = !!params.conversational;
	/** AR4a NIT-4: messages for the builtin chat path (load-bearing for builtin). */
	let conversationalMessages: ConversationMessage[] | undefined;

	const effectiveSystemPromptText =
		params.requestContext?.triggerPromptOverride ?? systemPromptText;

	let assembledPrompt: string;
	if (params.conversational) {
		// AR4a: Conversational mode — assemble thread transcript as the system prompt.
		const effectivePersona =
			params.conversational.systemPromptOverride !== undefined &&
			params.conversational.systemPromptOverride !== null
				? params.conversational.systemPromptOverride
				: effectiveSystemPromptText;
		const { composedPrompt } = ports.contextAssembly.composeAssistantPrompt(effectivePersona);
		conversationalMessages = params.conversational.messages;
		const transcriptSection =
			conversationalMessages.length > 0
				? "\n\n## Conversation\n" +
					conversationalMessages
						.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
						.join("\n")
				: "";
		assembledPrompt = composedPrompt + transcriptSection;
	} else if (params.routineId && params.contextBundle?.kind === "routine") {
		// AU21 §9 Increment 12 (Decision H3): routine session — derive
		// routine+agent+team context from the baked `kind:"routine"` bundle,
		// ZERO db read (the routine/org reads this used to make via
		// `buildRoutineSessionContextData` are gone).
		const routineContextData = routineSessionContextDataFromBundle(params.contextBundle);
		({ assembledPrompt } = await ports.contextAssembly.assembleRoutinePrompt({
			systemPromptText: effectiveSystemPromptText,
			context: routineContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	} else if (
		params.taskId &&
		!params.routineId &&
		!params.requestContext &&
		params.contextBundle?.kind === "task"
	) {
		// AU21 §9 Increment 12 (Decision H3): normal (non-durable, no
		// requestContext) task session — derive task+bet+agent+team context
		// from the baked `kind:"task"` bundle, ZERO db read (the task/bet/
		// users/org reads this used to make via `buildSessionContextData` are
		// gone).
		const sessionContextData = sessionContextDataFromBundle(params.contextBundle);
		({ assembledPrompt } = await ports.contextAssembly.assemblePrompt({
			systemPromptText: effectiveSystemPromptText,
			context: sessionContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	} else {
		// AU21 §9 Increment 12 (Decision H3): every durable session (the
		// primary production path — `requestContext` is always set by
		// `consumeAgentSessionRequest`) already took this generic, db-free
		// branch pre-migration regardless of source kind (unchanged here) —
		// this is also the graceful fallback for a routine/task session whose
		// emit-time resolver hasn't been wired with the optional contextBundle
		// deps yet (`getTeamById`/`assembleSessionKnowledge`), so a wiring gap
		// degrades to a plain prompt instead of crashing the session.
		assembledPrompt = await assembleTaskFreePrompt(
			db,
			params,
			effectiveSystemPromptText,
			toolSummaries,
			ports,
		);
	}

	ports.contextAssembly.writeSandboxAgentsMd(sandboxPath, assembledPrompt);

	// Retrieve adapter capabilities once.
	const adapterCapabilities = harness.getCapabilities();

	// ── Phase 8b: create MCP bridge (if registry is configured).
	const mcpJsonPath = path.join(sandboxPath, PROVISIONER_EMITTED_FILES[0]);
	if (!fs.existsSync(mcpJsonPath)) {
		fs.writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
	}

	// AL6: One gate per session — all events observed by this gate. Declared
	// here (before the MCP bridge's `onToolCall` closure below references it)
	// so the closure captures the same binding `createReturnGate()`
	// initializes — the closure only ever fires later, once an actual tool
	// call streams in (well after this synchronous assignment completes).
	const returnGate = ports.harnessRuntime.createReturnGate();
	let mcpBridgeToken: string | undefined;
	/** AL7 delta: per-session MCP token env for CLI harnesses (codex: HYPERIDLE_MCP_TOKEN). */
	let mcpTokenEnv: Record<string, string> | undefined;
	if (mcpBridgeRegistry && mcpBaseUrl) {
		try {
			const bridge = await mcpBridgeRegistry.open({
				sessionId,
				registry,
				onToolCall: ({ toolName, args }) => {
					if (!isReturnAction(toolName, args as Record<string, unknown>)) return;

					returnGate.observe({
						type: "tool_call",
						toolName,
						args: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
					});
					if (selectedAdapter.meta.type === "opencode") {
						aborted = true;
						setTimeout(() => {
							void ports.sessionRequests.abortSessionRun(sessionId).catch(() => {
								// The harness may already have exited after the return action.
							});
						}, 0);
					}
				},
			});
			mcpBridgeToken = bridge.token;
			const mcpUrl = `${mcpBaseUrl}/api/mcp/${bridge.token}`;

			const mcpJsonConfig = {
				mcpServers: {
					hyperidle: {
						type: "http",
						url: mcpUrl,
					},
				},
			};
			fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJsonConfig, null, 2), "utf-8");

			if (adapterCapabilities.cliMcpDialect) {
				const result = await ports.harnessRuntime.writeCliMcpConfig({
					dialect: adapterCapabilities.cliMcpDialect,
					sandboxPath,
					mcpUrl,
					token: bridge.token,
				});
				if (result.tokenEnv && Object.keys(result.tokenEnv).length > 0) {
					mcpTokenEnv = result.tokenEnv;
				}
			}
		} catch (bridgeErr) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] MCP bridge creation failed for session ${sessionId}; falling back to event-stream mode:`,
				bridgeErr,
			);
		}
	}

	// ── Phase 8b-connections: AN2 Connection provisioning (parallel to inbound bridge).
	if (serviceConnectionResolver) {
		try {
			const plan = await ports.connections.buildProvisioningPlan({
				agentId: params.agentId,
				resolver: serviceConnectionResolver,
			});
			const { mcpTokenEnv: connEnv } = await ports.connections.applyProvisioningPlan({
				plan,
				sandboxPath,
				cliMcpDialect: adapterCapabilities.cliMcpDialect,
				claudeNative:
					adapterCapabilities.cliMcpDialect === undefined &&
					selectedAdapter.meta.type === "claude-code",
			});
			const mergedConnEnv: Record<string, string> = {
				...plan.envInjections,
				...connEnv,
			};
			if (Object.keys(mergedConnEnv).length > 0) {
				mcpTokenEnv = { ...(mcpTokenEnv ?? {}), ...mergedConnEnv };
			}
		} catch (connErr) {
			// biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge
			console.warn(
				`[connection-provisioning] failed for session ${sessionId}; continuing without external tools:`,
				connErr,
			);
		}
	}

	// ── Phase 8b-enforce: provision the return-enforcement hook for this adapter.
	await ports.harnessRuntime.provisionReturnHook({
		sandboxPath,
		channel: adapterCapabilities.returnEnforcement,
		bridgeToken: mcpBridgeToken ?? "",
		mcpUrl: mcpBridgeToken && mcpBaseUrl ? `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}` : "",
		forceBudget: AL6_MAX_FORCE_RETURNS,
	});

	// ── Phase 9-10: single startSession + drain (AL6 v4-final — Loop DELETED).

	// AL6 v4-final: register this session in the enforcement registry now that the
	// real gate exists.
	const exempt =
		isConversational ||
		isInternalExtractionDrain({
			tools: ports.toolProvider.toolsForRole(agentRole).map((d) => d.name),
		});
	ports.harnessRuntime.enforcementRegistry.register(sessionId, {
		gate: returnGate,
		forceCount: 0,
		exempt,
	});

	let totalCostCents = 0;
	let crashed = false;
	/** AA3: set to true when per-run cost cap is hit; breaks the event loop gracefully. */
	let budgetExhausted = false;
	/** L17: accumulated tokens by tier for the session's tokensJson column. */
	const accumulatedTokens: Partial<Record<ModelTier, { prompt: number; completion: number }>> = {};

	// Shared session config fields across runs.
	const allowedToolNames = ports.toolProvider.toolsForRole(agentRole).map((d) => d.name);
	const returnHookConfig =
		mcpBridgeToken && mcpBaseUrl
			? {
					bridgeToken: mcpBridgeToken,
					mcpUrl: `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}`,
					forceBudget: AL6_MAX_FORCE_RETURNS,
				}
			: undefined;
	const sessionStartConfig = {
		sessionId,
		sandboxPath,
		systemPromptPath: "", // @deprecated X3
		assembledPrompt,
		modelTier,
		tools: allowedToolNames,
		resolvedModel: params.resolvedModel as ResolvedModel | undefined,
		resolvedFastModel: params.resolvedFastModel as ResolvedModel | undefined,
		mcpConnectionInfo: mcpBridgeToken
			? { url: `${mcpBaseUrl}/api/mcp/${mcpBridgeToken}`, token: mcpBridgeToken }
			: undefined,
		returnHook: returnHookConfig,
		...(params.sessionWorkflow ? { sessionWorkflow: params.sessionWorkflow } : {}),
		...(mcpTokenEnv ? { mcpTokenEnv } : {}),
		...(conversationalMessages ? { messages: conversationalMessages } : {}),
	};

	// X5: Determine whether to intercept tool_call events from the stream.
	const interceptToolCalls = !(adapterCapabilities.mcpSupport && mcpBridgeToken);

	let beforeHarnessStartError: unknown;
	try {
		const beforeHarnessStartResult = await deps.onBeforeHarnessStart?.({
			sessionId,
			sandboxPath,
			adapter: selectedAdapter,
			sessionConfig: sessionStartConfig as SessionConfig,
		});
		if (beforeHarnessStartResult === "abort") {
			aborted = true;
		}
	} catch (err) {
		beforeHarnessStartError = err;
		aborted = true;
	}

	let harnessHandle: SessionHandle | null = null;
	let metrics: SessionMetrics | undefined;
	let conversationalReplyText = "";
	let conversationalToolCallsCapture: readonly CapturedToolCall[] | undefined;

	// W1: try/finally ensures the adapter pool slot is ALWAYS released once, even
	// on errors.
	try {
		if (!aborted) {
			harnessHandle = await harness.startSession(sessionStartConfig as SessionConfig);
			ports.sessionRequests.registerSessionRun(sessionId, {
				signalAbort: () => {
					aborted = true;
				},
				handle: harnessHandle,
				adapter: harness,
			});
		}
		onHarnessStarted?.();

		// ── Phase 10: drain the event stream (single pass in v4).
		try {
			if (harnessHandle) {
				for await (const event of harness.streamEvents(harnessHandle)) {
					// AL6: Observe every event FIRST — the gate is read-only.
					returnGate.observe(event);

					if (aborted) {
						break;
					}
					if (event.type === "cost_update") {
						const delta = Math.max(0, event.deltaCost);
						const currency = event.currency ?? "USD";
						const scale = 10 ** scaleForCurrency(currency);
						const deltaMinor = Math.round(delta * scale);
						totalCostCents += deltaMinor;
						if (routinePerRunCap != null && totalCostCents >= routinePerRunCap) {
							budgetExhausted = true;
							break;
						}
						await ports.cost.recordCostAndCheck(db, eventBus, {
							sessionId,
							costMinor: deltaMinor,
							currency,
							agentId: params.agentId,
							teamId,
							...(params.taskId ? { taskId: params.taskId } : {}),
							factoryCap: params.factoryCap,
							factorySpend: params.factorySpend,
							reviewThreadId: params.reviewThreadId,
						});
					} else if (event.type === "token_usage") {
						const tier: ModelTier = event.tier ?? modelTier;
						const existing = accumulatedTokens[tier];
						accumulatedTokens[tier] = {
							prompt: (existing?.prompt ?? 0) + event.inputTokens,
							completion: (existing?.completion ?? 0) + event.outputTokens,
						};
					} else if (event.type === "tool_call") {
						eventBus.emit({
							type: "tool_call_recorded",
							streamId: sessionId,
							sessionId,
							toolName: event.toolName,
							argsSummary: ports.observability.summarizeToolArgs(event.args),
							timestamp: Date.now(),
						});
						if (interceptToolCalls && selectedAdapter.meta.type !== "builtin") {
							await registry.invoke(event.toolName, event.args);
						}
					} else if (event.type === "completion") {
						if (isConversational && event.text.length > 0) {
							conversationalReplyText = event.text;
							conversationalToolCallsCapture =
								event.toolCalls && event.toolCalls.length > 0 ? event.toolCalls : undefined;
						}
					} else if (event.type === "error") {
						crashed = true;
						break;
					}
				}
			}
		} catch {
			crashed = true;
		}
		// Stop the harness session.
		if (crashed) {
			try {
				metrics = harnessHandle ? (await harness.stopSession(harnessHandle))?.metrics : undefined;
			} catch (stopErr) {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[session-provisioning] stopSession failed during crash teardown for ${sessionId}:`,
					stopErr,
				);
			}
		} else if (harnessHandle) {
			metrics = (await harness.stopSession(harnessHandle))?.metrics;
		}
	} finally {
		// W1: release the adapter pool slot EXACTLY ONCE after the single run.
		adapterPool.release(adapterId);
	}

	// ── Phase 11: teardown.
	// AF7 §4/§5: the run is over — drop the abort affordance.
	ports.sessionRequests.deregisterSessionRun(sessionId);

	// X2: Unregister the MCP bridge BEFORE calling endSession/crashSession.
	if (mcpBridgeRegistry && mcpBridgeToken) {
		await mcpBridgeRegistry.close(mcpBridgeToken);
	}

	function computeForceReturnCount(): number {
		const registryEntry = ports.harnessRuntime.enforcementRegistry.get(sessionId);
		const registryForceCount = registryEntry?.forceCount ?? 0;
		const adapterForceCount = harness.getForceReturnCount?.(sessionId) ?? 0;
		return registryForceCount + adapterForceCount;
	}

	// AR2: observation seam.
	if (deps.onBeforeTeardown) {
		try {
			await deps.onBeforeTeardown({ sessionId, sandboxPath });
		} catch (observeErr) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] onBeforeTeardown observer threw for ${sessionId}; ` +
					`continuing teardown:`,
				observeErr,
			);
		}
	}

	if (crashed) {
		// ── Hook B: capture-back before crash teardown (AO2 §9).
		if (deps.mounter && mountedFilesystems.length > 0) {
			await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
		}
		await transitionRun(
			{ db, eventBus, ports },
			{
				target: "session",
				context: sessionContext,
				disposition: "crash",
				costInCents: totalCostCents,
				baselineCost: 0,
				...(params.taskId ? { tokensByTier: accumulatedTokens } : {}),
			},
		);
		const returnVerdict = ports.harnessRuntime.evaluateReturn(returnGate, "crashed");
		ports.harnessRuntime.enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "crashed",
			totalCostCents,
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: computeForceReturnCount(),
			...(metrics ? { metrics } : {}),
		};
	}

	// AA3: Per-run cap hit — end the session gracefully and record budget_exhausted outcome.
	if (budgetExhausted) {
		if (sessionContext.requestContext) {
			await transitionRun(
				{ db, eventBus, ports },
				{
					target: "request",
					intent: "request-termination",
					requestId: sessionContext.requestContext.requestId,
					reason: "cost_cap",
				},
			);
		}
		// ── Hook B: capture-back before budget_exhausted teardown (AO2 §9).
		if (deps.mounter && mountedFilesystems.length > 0) {
			await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
		}
		await transitionRun(
			{ db, eventBus, ports },
			{
				target: "session",
				context: sessionContext,
				disposition: "end",
				costInCents: totalCostCents,
				baselineCost: 0,
				routineOutcome: "budget_exhausted",
				...(params.taskId ? { tokensByTier: accumulatedTokens } : {}),
			},
		);
		await workspace.destroy(sandboxHandle);
		const returnVerdict = ports.harnessRuntime.evaluateReturn(returnGate, "budget_exhausted");
		ports.harnessRuntime.enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "budget_exhausted",
			totalCostCents,
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: computeForceReturnCount(),
			...(metrics ? { metrics } : {}),
		};
	}

	// AL6: Evaluate the return gate at normal turn completion.
	const returnEndReason = aborted || isConversational ? "stopped" : "completed";
	const returnVerdict = ports.harnessRuntime.evaluateReturn(returnGate, returnEndReason);

	if (returnVerdict === "not_returned") {
		// AC3: never silently complete a not-returned turn — surface the escape.
		eventBus.emit({
			type: "session_not_returned",
			streamId: sessionId,
			sessionId,
			agentId: params.agentId,
			taskId: params.taskId,
			...(params.requestContext
				? {
						requestId: params.requestContext.requestId,
						sourceKind: params.requestContext.sourceKind,
						sourceId: params.requestContext.sourceId,
						sourceCorrelation: params.requestContext.sourceCorrelation,
					}
				: {}),
			timestamp: Date.now(),
		});

		// ── Hook B: capture-back before not_returned teardown (AO2 §9).
		if (deps.mounter && mountedFilesystems.length > 0) {
			await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
		}
		await transitionRun(
			{ db, eventBus, ports },
			{
				target: "session",
				context: sessionContext,
				disposition: "end",
				costInCents: totalCostCents,
				baselineCost: 0,
				terminalOutcome: "not_returned",
				...(params.taskId ? { tokensByTier: accumulatedTokens } : {}),
			},
		);
		await workspace.destroy(sandboxHandle);
		const notReturnedForceCount = computeForceReturnCount();
		ports.harnessRuntime.enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "not_returned",
			totalCostCents,
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: notReturnedForceCount,
			...(metrics ? { metrics } : {}),
		};
	}

	// ── Hook B: capture-back before normal teardown (AO2 §9).
	if (deps.mounter && mountedFilesystems.length > 0) {
		await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, deps.mounter);
	}
	await transitionRun(
		{ db, eventBus, ports },
		{
			target: "session",
			context: sessionContext,
			disposition: "end",
			costInCents: totalCostCents,
			baselineCost: 0,
			...(params.taskId ? { tokensByTier: accumulatedTokens } : {}),
		},
	);
	await workspace.destroy(sandboxHandle);
	ports.harnessRuntime.enforcementRegistry.unregister(sessionId);

	if (beforeHarnessStartError) {
		throw beforeHarnessStartError;
	}

	return {
		sessionId,
		outcome: "completed",
		totalCostCents,
		taskId: params.taskId,
		returnVerdict,
		forceReturnCount: computeForceReturnCount(),
		...(metrics ? { metrics } : {}),
		...(isConversational ? { conversationalReply: conversationalReplyText } : {}),
		...(isConversational && conversationalToolCallsCapture
			? { conversationalToolCalls: conversationalToolCallsCapture }
			: {}),
	};
}

/**
 * AF7 §2 — Admit a session synchronously and DETACH its run.
 *
 * `POST /api/sessions` calls this: it awaits `admitSession` (phases 1-7, all
 * admission errors throw pre-insert) and then fires the long-running `runSession`
 * (phases 8-11) WITHOUT awaiting it, so the HTTP caller is not blocked for the
 * full agent run.
 */
async function startSessionProvision(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	ports: SessionLifecyclePorts,
): Promise<{ sessionId: string; taskId: string }> {
	// AF7 §2: HTTP path — enforce the resolvedModel guard.
	const admitted = await admitSession(deps, params, ports, true);

	let signalStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});

	void runSession(deps, params, admitted, ports, signalStarted)
		.catch(async (err) => {
			try {
				await transitionRun(
					{ db: deps.db, eventBus: deps.eventBus, ports },
					{
						target: "session",
						context: admitted.sessionContext,
						disposition: "crash",
						costInCents: 0,
						baselineCost: 0,
					},
				);
			} catch (teardownErr) {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.error(
					`[session-provisioning] detached runSession crash teardown failed for ${admitted.sessionId}:`,
					teardownErr,
				);
			}
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.error(
				`[session-provisioning] detached runSession threw for ${admitted.sessionId}:`,
				err,
			);
		})
		.finally(() => {
			signalStarted();
		});

	await started;

	if (!admitted.sessionContext.taskId) {
		throw new Error("startSessionProvision requires a task-backed session");
	}
	return { sessionId: admitted.sessionId, taskId: admitted.sessionContext.taskId };
}

/**
 * Provision an end-to-end agent session, awaiting the full run.
 *
 * AF7 §2: retained as a thin wrapper over `admitSession` + `runSession` for the
 * dispatcher (which is already off the request path in a fire-and-forget drain)
 * and for tests that assert on the final outcome.
 */
async function provisionSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	ports: SessionLifecyclePorts,
): Promise<ProvisionSessionResult> {
	const admitted = await admitSession(deps, params, ports);
	return runSession(deps, params, admitted, ports, deps.onHarnessStarted);
}

interface Provisioner {
	readonly emittedFiles: readonly string[];
	admit(
		deps: ProvisionSessionDeps,
		params: ProvisionSessionParams,
		enforceResolvedModelGuard?: boolean,
	): Promise<AdmittedSession>;
	run(
		deps: ProvisionSessionDeps,
		params: ProvisionSessionParams,
		admitted: AdmittedSession,
		onHarnessStarted?: () => void,
	): Promise<ProvisionSessionResult>;
	provision(
		deps: ProvisionSessionDeps,
		params: ProvisionSessionParams,
	): Promise<ProvisionSessionResult>;
	start(
		deps: ProvisionSessionDeps,
		params: ProvisionSessionParams,
	): ReturnType<typeof startSessionProvision>;
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure): takes the agent's
	 * already-BAKED `injectedFilesystems` list directly (no `agentId`
	 * parameter, no live seam read) — `mountFilesystemsForAgent` no longer
	 * reads back through a `filesystems` port at all. See
	 * `filesystem-provisioning.ts`'s own top-of-file `@lore`.
	 */
	mount(
		injectedFilesystems: readonly FilesystemForProvisioning[],
		sandboxPath: string,
		mounter: FilesystemMounter,
	): Promise<Filesystem[]>;
	capture: typeof captureMountedFilesystems;
}

export function createProvisioner(ports: SessionLifecyclePorts): Provisioner {
	return {
		emittedFiles: PROVISIONER_EMITTED_FILES,
		admit: (deps, params, guard) => admitSession(deps, params, ports, guard),
		run: (deps, params, admitted, onHarnessStarted) =>
			runSession(deps, params, admitted, ports, onHarnessStarted),
		provision: (deps, params) => provisionSession(deps, params, ports),
		start: (deps, params) => startSessionProvision(deps, params, ports),
		mount: (injectedFilesystems, sandboxPath, mounter) =>
			mountFilesystemsForAgent({ injectedFilesystems, sandboxPath, mounter }),
		capture: (...args) => captureMountedFilesystems(...args),
	};
}
