/** Consolidated private session provisioner and its DI boundary. */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedContextBundle,
	SessionOutcome,
} from "@hyperidle/domain-model";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	MODEL_TIERS,
	type ModelTier,
	type ResolvedModel,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import {
	type ConversationMessage,
	type HarnessEvent,
	isReturnAction,
	literalToolNamerForAdapterType,
	MAX_FORCE_RETURNS,
	type SessionConfig,
	type SessionHandle,
	type SessionMetrics,
	type SessionResult,
	type SessionWorkflow,
} from "@hyperidle/harness-protocol";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { readAgentRunConfig } from "./agent-run-config-store.js";
import {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type HeldConnectionsReaderPort,
} from "./connection-provisioning.js";
import { routineSessionContextDataFromBundle, sessionContextDataFromBundle } from "./context.js";
import {
	ConcurrencyLimitError,
	NoEligibleHarnessError,
	TargetAgentNotRunnableError,
} from "./errors.js";
import {
	type FilesystemMounterPort,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
// Filesystem: local to this package — sibling service boundary (Mechanism C).
// @lore AU44 b2: moved from @hyperidle/domain-model (dissolved filesystem-contract).
import type { Filesystem } from "./mounter.js";
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
//   - AU21 Increment 14a: the admission-time routine per-run cost cap this
//     bullet used to describe (`params.contextBundle.routine
//     .costCapPerRunMinor`) is DELETED along with the rest of the cost-cap
//     gate — no replacement.
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
// filesystems (AU26 F2, founder ruling): `filesystems` and
// `filesystem_injections` are `agent-orchestration`'s OWN tables now, so the
// spawn reads them LIVE — no seam, and no emit-time bake to go stale. AU21 §9
// Increment 12's `ProvisionSessionParams.injectedFilesystems` is DELETED;
// `deps.injectedFilesystems` (an `InjectedFilesystemsReaderPort` the
// Application backs with `@hyperidle/filesystems`) replaces it. A port, not a
// direct import, because `run-orchestration` is itself a Service and may depend
// only on db+shared (Mechanism C) — the same reason `heldConnections` beside it
// is injected. See `filesystem-provisioning.ts`'s own top-of-file `@lore`.
// ---------------------------------------------------------------------------

interface SessionLifecycleServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// connections (AU26 E3, AU21 Decision J3): `service_connections` is
// `agent-orchestration`'s OWN table now, so the spawn reads it LIVE — no seam,
// and no emit-time bake to go stale. AU21 K1's `ProvisionSessionParams
// .injectedConnections` is DELETED; `deps.heldConnections` (a
// `HeldConnectionsReaderPort` the Application backs with
// `@hyperidle/connections`) replaces it. A port, not a direct import, because
// `run-orchestration` is itself a Service and may depend only on db+shared
// (Mechanism C) — the same reason `serviceConnectionResolver` beside it is
// injected. See `connection-provisioning.ts`'s own top-of-file `@lore`.
// ---------------------------------------------------------------------------

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
	/** AU27 Increment 3 (Decision 3) — the session's specific required return subset, when it has one. */
	readonly requiredReturnActions?: readonly string[];
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
	/**
	 * AU27 Increment 3 (Decision 3) — `requiredReturnActions`, when supplied,
	 * narrows the predicate in the closure to only that subset. Absent ⇒ the
	 * pre-Increment-3 default (any member of the closed return set).
	 */
	createReturnGate(requiredReturnActions?: readonly string[]): SessionLifecycleReturnGate;
	evaluateReturn(
		gate: SessionLifecycleReturnGate,
		endReason: "completed" | "crashed" | "stopped",
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
	/** @lore BA9b B2: write plugin stdio MCP entries in the harness's dialect. Dialect knowledge lives in cli-mcp-config.ts. */
	writePluginStdioMcpEntries(params: {
		readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
		readonly sandboxPath: string;
		readonly servers: ReadonlyArray<{
			readonly key: string;
			readonly config: Record<string, unknown>;
		}>;
	}): void;
	/**
	 * AU31 §2.7/§3.1 sites 12,14 (B1): the session-scoped MCP dial —
	 * bridge-open plus the `/api/mcp/` URL spelling — folded into
	 * `harness-registry`'s own session provisioning (`openMcpBridgeSession`,
	 * `layers/agent-execution/harness-registry/src/mcp/index.ts`); this
	 * package no longer calls `.open()` on the registry or builds the URL
	 * itself. `registry`/`baseUrl` are the caller's own already-received
	 * `mcpBridgeRegistry`/`mcpBaseUrl` values (`ProvisionSessionDeps`,
	 * unchanged), threaded through as call-time data — not a stored
	 * reference — same Mechanism C shape as `provisionReturnHook`/
	 * `writeCliMcpConfig` above.
	 */
	openMcpBridge(options: {
		// AU31 vestige: the execution face now owns the ONE bridge registry +
		// mcpBaseUrl (closed over in `bootAgentExecution`); these per-call values
		// are ignored by the adapter and are no longer wired in production. Kept
		// optional only so the (now harness-gated) call site still type-checks.
		readonly registry?: SessionLifecycleMcpBridgeRegistry;
		readonly baseUrl?: string;
		readonly sessionId: string;
		readonly toolRegistry: unknown;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string; readonly url: string }>;
	/** The dial's close half — see `openMcpBridge`'s `@lore`. */
	closeMcpBridge(
		registry: SessionLifecycleMcpBridgeRegistry | undefined,
		token: string,
	): Promise<void>;
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
	/**
	 * AU27 Increment 1 (Decision 1) — the session's calling thread, forwarded
	 * straight from `params.callingThreadId` (baked at emit — zero
	 * orchestration -> core read). Absent for `routine_run`/`knowledge_action`.
	 */
	readonly threadId?: string;
}

/** `RegistrySessionWorkflow` (`tool-registry.ts`) — extends `@hyperidle/harness-protocol`'s `SessionWorkflow` with server-side capture anchors. This Service's own public `ProvisionSessionParams.sessionWorkflow` field type. */
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
			readonly role: string;
			readonly extraTools?: readonly unknown[];
			readonly sessionWorkflow?: SessionLifecycleRegistrySessionWorkflow;
			readonly useOnlyExtraTools?: boolean;
		},
	): SessionLifecycleToolRegistry;
	toolsForRole(role: string): readonly { readonly name: string; readonly description: string }[];
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
		/** BA1 D3: one column, one field — replaces `description`. */
		readonly prompt: string | null;
		readonly lastRunSummary: string | null;
	};
	readonly agent: { readonly id: string; readonly name: string; readonly role: string };
	/** BA1 D4: nullable — the owner agent may belong to no team. */
	readonly team: { readonly id: string; readonly name: string } | null;
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
		readonly agentRole: string;
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
	/**
	 * AU27 Increment 8 (BLOCKER fix) — the selected adapter's registration
	 * `type` (e.g. "opencode", "claude-code"), used to name the `reply` tool
	 * literally in the orientation line below — see `literalToolNamerForAdapterType`.
	 */
	adapterType: string | undefined,
): Promise<string> {
	const toolSection =
		toolSummaries.length > 0
			? `\n\n## Tools\n${toolSummaries.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`
			: "";

	// AU27 Increment 4 (Decision 2, item 2): when a transcript is present,
	// render a human-readable source line instead of the raw machine-id
	// Correlation JSON (`threadId`/`messageId`) — raw ids in the system
	// prompt of the most user-facing session is a rough edge, not a
	// requirement; a transcript-bearing session already carries its own
	// context in the `## Conversation` section below.
	const sourceSection = params.transcript
		? "## Session request\nYou are replying in an ongoing conversation."
		: params.requestContext
			? `## Session request\nSource kind: ${params.requestContext.sourceKind}\nSource ID: ${params.requestContext.sourceId}\nCorrelation: ${JSON.stringify(params.requestContext.sourceCorrelation)}`
			: "## Session request\nTask-free session request";

	// The `## Conversation` section renders the session's calling-thread
	// transcript, when one was baked for it, so any agent kind can see the
	// conversation it is replying within.
	const conversationSection =
		params.transcript && params.transcript.length > 0
			? `## Conversation\n${params.transcript.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}`
			: "";

	// AU27 Increment 4 (Decision 3 orientation): a one-line reminder when this
	// session's only satisfying return action is `reply`, not the trio.
	//
	// AU27 Increment 8 (BLOCKER fix): name the LITERAL tool the harness
	// exposes (e.g. `mcp__hyperidle__reply` / `hyperidle_reply`), not the bare
	// name — a model that must resolve a bare mention itself either burns an
	// extra round trip doing so (Claude's internal tool search) or, on a
	// smaller model, fails outright trying to call a tool name that does not
	// exist ("Model tried to call unavailable tool 'reply'").
	const replyToolName = literalToolNamerForAdapterType(adapterType)("reply");
	const replyOrientation =
		params.callingThreadId != null && params.taskId == null
			? `When you are done, call \`${replyToolName}\` to answer in this conversation.`
			: "";

	return [systemPromptText, sourceSection, conversationSection, replyOrientation, toolSection]
		.filter(Boolean)
		.join("\n\n");
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
/**
 * @lore BA9b: Expand Agent Plugins 1.0.0 template variables in MCP config values.
 * ${PLUGIN_ROOT} → installPath; ${PLUGIN_DATA} → installPath/data (per-plugin persistent store).
 * "Resolve command as a single executable token" means treat command as one atom, not shell-split —
 * the config schema already separates command and args, so no further transformation is needed.
 */
function expandPluginVars(value: string, pluginRoot: string): string {
	const pluginData = path.join(pluginRoot, "data");
	return value.replace(/\$\{PLUGIN_ROOT\}/g, pluginRoot).replace(/\$\{PLUGIN_DATA\}/g, pluginData);
}

function expandMcpConfigValue(val: unknown, pluginRoot: string): unknown {
	if (typeof val === "string") return expandPluginVars(val, pluginRoot);
	if (Array.isArray(val)) return val.map((v) => expandMcpConfigValue(v, pluginRoot));
	if (val && typeof val === "object") {
		return Object.fromEntries(
			Object.entries(val as Record<string, unknown>).map(([k, v]) => [
				k,
				expandMcpConfigValue(v, pluginRoot),
			]),
		);
	}
	return val;
}

/**
 * @lore BA9b: Merge plugin-contributed MCP servers into the session sandbox.
 * Only plugins in scope for this session contribute: factory-scoped (all sessions)
 * and team-scoped (teamId match). Servers from plugins without an installPath are
 * skipped (no ${PLUGIN_ROOT} to expand).
 *
 * For no dialect (claude-code): merges into .mcp.json.
 * For CLI dialects: calls `writeStdioEntries` (ports.harnessRuntime.writePluginStdioMcpEntries)
 * so dialect knowledge stays in cli-mcp-config.ts — one owner for all harness file shapes.
 *
 * AC6: plugin mcp.json merged WITH the tool-bridge entry already written above.
 * AC7: scope filtering ensures team-scoped plugins only reach matching team sessions.
 *
 * @lore BA9b governance: plugins/pluginConfigurationDefaults are owned by settings
 * (core-api layer). run-orchestration (agent-orchestration layer) cannot query them
 * directly. The data arrives through PluginMcpContributionsPort, wired by the
 * application via CoreApiBoot.pluginMcpContributions → ApplicationProvisionSessionDeps.
 */
/** @for-testing exported so the unit test can verify expansion + routing without copy-pasting helpers. */
export async function mergePluginMcpContributions(
	port: PluginMcpContributionsPort | undefined,
	sandboxPath: string,
	teamId: string | null,
	dialect?: "codex-toml" | "opencode-json" | "cursor-json",
	writeStdioEntries?: (params: {
		readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
		readonly sandboxPath: string;
		readonly servers: ReadonlyArray<{
			readonly key: string;
			readonly config: Record<string, unknown>;
		}>;
	}) => void,
): Promise<void> {
	if (!port) return;

	const rows = await port.getContributions(teamId);

	if (rows.length === 0) return;

	// Build the list of expanded server configs. Rows with no installPath or
	// invalid JSON are skipped; the file is still written (rows were present).
	const servers: Array<{ key: string; config: Record<string, unknown> }> = [];

	for (const row of rows) {
		const pluginRoot = row.installPath;
		if (!pluginRoot) continue; // no installPath → cannot expand ${PLUGIN_ROOT}
		let rawConfig: Record<string, unknown>;
		try {
			rawConfig = JSON.parse(row.defaultValueJson) as Record<string, unknown>;
		} catch {
			continue;
		}
		// Expand ${PLUGIN_ROOT} and ${PLUGIN_DATA} in all string values.
		// command is treated as a single executable token (separate from args by the schema).
		const expanded = expandMcpConfigValue(rawConfig, pluginRoot) as Record<string, unknown>;
		// Default cwd to plugin root when not specified
		if (!expanded.cwd) {
			expanded.cwd = pluginRoot;
		}
		servers.push({ key: row.key, config: expanded });
	}

	if (!dialect) {
		// claude-code: standard .mcp.json. Always write even if servers is empty
		// (rows were present) to preserve/merge any existing content.
		const mcpJsonPath = path.join(sandboxPath, ".mcp.json");
		let existing: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
		if (fs.existsSync(mcpJsonPath)) {
			try {
				existing = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8")) as typeof existing;
			} catch {
				// leave existing as empty baseline
			}
		}
		const merged: Record<string, unknown> = { ...(existing.mcpServers ?? {}) };
		for (const { key, config } of servers) {
			merged[key] = config;
		}
		fs.writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: merged }, null, 2), "utf-8");
	} else if (writeStdioEntries && servers.length > 0) {
		// CLI dialects: delegate to the canonical dialect writer (cli-mcp-config.ts).
		// Dialect knowledge lives there — no per-dialect code here.
		writeStdioEntries({ dialect, sandboxPath, servers });
	}
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
	mounter: FilesystemMounterPort,
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

/**
 * @lore BA9b: Fetches plugin MCP server contributions scoped to a team.
 * Defined here as an opaque port — settings owns the tables, so provisioner
 * cannot query them directly. The application composition root wires the
 * implementation (from @hyperidle/settings via @hyperidle/core-api's boot).
 */
export interface PluginMcpContributionsPort {
	getContributions(teamId: string | null): Promise<
		readonly {
			readonly key: string;
			readonly defaultValueJson: string;
			readonly installPath: string | null;
		}[]
	>;
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
	 * AU26 E3: the live, in-layer held-connection read one spawn performs.
	 * Application-composed from `@hyperidle/connections`. Absent → the
	 * provisioning plan is empty, the same graceful no-op an absent
	 * `serviceConnectionResolver` already gives.
	 */
	readonly heldConnections?: HeldConnectionsReaderPort;
	/**
	 * AU26 F2: the live, in-layer injected-filesystem read one spawn performs.
	 * Application-composed from `@hyperidle/filesystems`. Absent → nothing is
	 * mounted, the same graceful no-op an absent `mounter` already gives.
	 */
	readonly injectedFilesystems?: InjectedFilesystemsReaderPort;
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
	readonly mounter?: FilesystemMounterPort;
	/**
	 * BA9b: Plugin MCP server contributions for this session's team scope.
	 * When absent, no plugin MCP servers are merged into the session config.
	 * Provided by the application via CoreApiBoot.pluginMcpContributions.
	 */
	readonly pluginMcpContributions?: PluginMcpContributionsPort;
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
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
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
	 * Absent for `knowledge_action`/`session_start`/`assistant_turn` turns.
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
	 * AU27 Increment 1 (Decision 1) — the session's calling thread id, baked at
	 * EMIT time by every per-kind resolver that has one (`assistant_turn` from
	 * the triggering message's thread; `task_run`/`session_start`/
	 * `reengagement` from Decision 0's resolve-or-create). Absent for
	 * `routine_run`/`knowledge_action`. Forwarded verbatim onto
	 * `SessionLifecycleToolContext.threadId` in Phase 8 — the `reply` tool
	 * (Increment 2) reads it from there. ZERO orchestration -> core read.
	 */
	readonly callingThreadId?: string;
	/**
	 * The session's calling-thread transcript, mapped to generic chat
	 * messages at drain time (`runtime.ts`'s `mapTranscriptToMessages`).
	 * Feeds the `## Conversation` prompt section (Phase 8.5, every harness)
	 * and `SessionConfig.messages` (selects the builtin adapter's chat
	 * completion over the planning loop). Absent for a session with no
	 * transcript.
	 */
	readonly transcript?: readonly ConversationMessage[];
	/**
	 * AL7 Task 6: When set, the registry invoke router participates in the
	 * trust-first review workflow for this session.
	 */
	readonly sessionWorkflow?: SessionLifecycleRegistrySessionWorkflow;
}

interface ProvisionSessionResult {
	readonly sessionId: string;
	readonly outcome: SessionOutcome;
	readonly taskId: string | null;
	/**
	 * Return-gate verdict for this session run. Present on all task-session
	 * outcomes ("returned" | "not_returned"). Absent (undefined) on assistant
	 * turns and extraction drains which use different provisioning paths.
	 */
	readonly returnVerdict?: "returned" | "not_returned";
	/**
	 * Unified turn-level force injection count.
	 */
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
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
	/**
	 * The harness options this agent was configured with, read from its run
	 * config during admit alongside the system prompt and tier. Empty for an
	 * agent that has none.
	 */
	readonly modelOptions: Readonly<Record<string, string | number | boolean>>;
	/**
	 * The model this agent was configured with, read from its own run config
	 * during admit. `null` when the person chose none — the harness then keeps
	 * its own default. No credential is resolved to produce this.
	 */
	readonly selectedModel: string | null;
	readonly sandboxHandle: SessionLifecycleSandboxHandle;
	readonly sandboxPath: string;
	/** AK2: was `watcher: FileWatcher` — renamed to `ingestion: IngestionHandle` as part of Strategy port decoupling. */
	readonly ingestion: IngestionHandle;
	readonly selectedAdapter: SessionLifecycleSelectedEntry;
	readonly harness: SessionLifecycleHarnessAdapter;
	readonly adapterId: string;
	/**
	 * AO2: Filesystems that were successfully mounted in Phase 4.5 for this session.
	 */
	readonly mountedFilesystems: Filesystem[];
}

/**
 * AF7 §2 — Admit a session synchronously (phases 1-7).
 *
 * Runs the HTTP-observable prefix: load agent, adapter
 * select + concurrency check (P3), **resolvedModel presence guard (WARNING-2,
 * pre-P5)**, task transition, workspace spawn (P4), session row insert (P5),
 * context assembly (P6), start watcher (P7), emit `session_started`. ALL admission
 * failures (ConcurrencyLimit 429 / MissingCredential 500)
 * throw BEFORE the P5 row insert — the detach boundary — so they map to HTTP
 * status on the POST path and never leave a doomed row.
 * @lore AU21 Increment 14a: the cost-cap pre-flight (was Phase 2, `CostCapExceeded`
 * 422) is deleted — no replacement gate. Phase numbering below keeps its
 * historical P3/P4/... labels rather than renumbering.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: admission coordinates multi-phase pre-flight with error handling
async function admitSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	ports: SessionLifecyclePorts,
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

	// AU26 G1 (§D-L): the run-config fields are read LIVE here from
	// `agent_run_config` — orchestration's OWN table — instead of coming off the
	// emit-time bake. An agent with no row resolves the all-null default, which
	// is exactly what an all-null `users` row resolved before the move.
	const runConfig = await readAgentRunConfig(db, params.agentId);

	// X3: system prompt from the agent's run config. No file read required.
	const systemPromptText = runConfig.systemPrompt ?? "";

	// X3: Model tier priority: explicit param > agent preference > default "workhorse".
	const rawPreference = runConfig.modelTierPreference;
	const agentPreference =
		rawPreference !== null &&
		rawPreference !== undefined &&
		(MODEL_TIERS as readonly string[]).includes(rawPreference)
			? (rawPreference as ModelTier)
			: null;
	const modelTier: ModelTier = params.modelTier ?? agentPreference ?? "workhorse";

	// ── Phase 3: adapter selection + concurrency check + task transition.
	// Wave E: `harnessDisabled` comes from the baked request (no live
	// `ports.settings.readServerConfig` read) — absent defaults to "nothing
	// disabled", matching the settings row's own empty-array default.
	const harnessDisabled = params.harnessDisabled ?? [];
	const selectRequirements = {
		harnessType: runConfig.harnessType ?? undefined,
		...(runConfig.modelProvider
			? { modelProviders: [runConfig.modelProvider] as readonly string[] }
			: {}),
		disabledTypes: harnessDisabled as readonly string[],
	};
	const selectedAdapter = adapterPool.select(selectRequirements);
	if (!selectedAdapter) {
		if (runConfig.harnessType) {
			throw new NoEligibleHarnessError(runConfig.harnessType);
		}
		throw new Error(
			`No available adapter in pool — all adapters are at capacity${runConfig.harnessType ? ` (harnessType: ${runConfig.harnessType})` : ""}`,
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
	if ((activeCount?.count ?? 0) >= runConfig.maxConcurrentSessions) {
		adapterPool.release(adapterId);
		throw new ConcurrencyLimitError(params.agentId, runConfig.maxConcurrentSessions);
	}

	// @lore The synchronous resolvedModel-presence guard that stood here existed
	// for the built-in harness alone: it was the only adapter that made the model
	// call itself, so a session with no resolved credential could not run at all.
	// A CLI harness authenticates itself — its own login, its own key — so there
	// is nothing for orchestration to pre-check, and the guard went with it.

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

	// ── Phase 4.5: mount injected filesystems (AO2). AU26 F2: reads the
	// injection record LIVE, in-layer, at spawn — no seam, and no emit-time bake
	// to go stale (see this file's own top-of-file `filesystems` `@lore`).
	if (deps.mounter) {
		mountedFilesystems = await mountFilesystemsForAgent({
			agentId: params.agentId,
			...(deps.injectedFilesystems ? { filesystems: deps.injectedFilesystems } : {}),
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

	return {
		sessionId,
		sessionContext,
		agentRole,
		teamId,
		systemPromptText,
		modelTier,
		modelOptions: runConfig.modelOptions,
		// The model this agent was configured with, read straight from its own
		// config. No credential, no provider union, no tier — see
		// `SessionConfig.selectedModel`.
		selectedModel: runConfig.modelId,
		sandboxHandle,
		sandboxPath,
		ingestion,
		selectedAdapter,
		harness,
		adapterId,
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
		heldConnections,
	} = deps;
	const {
		sessionId,
		sessionContext,
		agentRole,
		teamId,
		systemPromptText,
		modelTier,
		modelOptions,
		selectedModel,
		sandboxHandle,
		sandboxPath,
		ingestion,
		selectedAdapter,
		harness,
		adapterId,
		mountedFilesystems,
	} = admitted;

	// AF7 §5: cooperative abort flag — the provisioning event loop checks it each
	// iteration.
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
		...(params.callingThreadId ? { threadId: params.callingThreadId } : {}),
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
	// Every session, assistant included, gets the ordinary role-scoped tool
	// registry — the assistant's tool surface spans every `roles: undefined`
	// tool, deliberately, per the founder's own direction.
	const registry: SessionLifecycleToolRegistry = ports.toolProvider.buildToolRegistry(toolContext, {
		role: agentRole,
		extraTools: [
			ports.toolProvider.returnStatusToolForRegistry(ports.harnessRuntime.enforcementRegistry),
		],
		sessionWorkflow: params.sessionWorkflow,
	});

	// ── Phase 8.5: compose prompt and write CLAUDE.md.
	const toolSummaries: SessionLifecycleToolSummary[] = ports.toolProvider
		.toolsForRole(agentRole)
		.map((d) => ({
			name: d.name,
			description: d.description,
		}));

	let assembledPrompt: string;
	if (params.routineId && params.contextBundle?.kind === "routine") {
		// AU21 §9 Increment 12 (Decision H3): routine session — derive
		// routine+agent+team context from the baked `kind:"routine"` bundle,
		// ZERO db read (the routine/org reads this used to make via
		// `buildRoutineSessionContextData` are gone).
		const routineContextData = routineSessionContextDataFromBundle(params.contextBundle);
		({ assembledPrompt } = await ports.contextAssembly.assembleRoutinePrompt({
			systemPromptText,
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
			systemPromptText,
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
			systemPromptText,
			toolSummaries,
			ports,
			selectedAdapter.meta.type,
		);
	}

	// @lore AU27 Increment 4 delivered the transcript twice: once as
	// `SessionConfig.messages`, which only the built-in adapter read (it picked
	// its chat loop over its planning loop on their presence), and once as the
	// `## Conversation` section `assembleTaskFreePrompt` renders. A CLI harness
	// only ever saw the second. With the built-in adapter gone the first has no
	// reader, so the prompt section is now the single delivery.

	ports.contextAssembly.writeSandboxAgentsMd(sandboxPath, assembledPrompt);

	// Retrieve adapter capabilities once.
	const adapterCapabilities = harness.getCapabilities();

	// ── Phase 8b: create MCP bridge for CLI harnesses that dial it over HTTP.
	const mcpJsonPath = path.join(sandboxPath, PROVISIONER_EMITTED_FILES[0]);
	if (!fs.existsSync(mcpJsonPath)) {
		fs.writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
	}

	// A session whose output belongs in a calling thread and has no task (the
	// assistant, and now knowledge_action too) must call `reply`, not the
	// trio — purely structural, no `sourceKind` check anywhere. A task-bound
	// session (task_run/session_start/reengagement/proposed_call) also bakes
	// a calling thread but keeps the trio available (`reply` still lands in
	// the same thread, but so does e.g. `handoff_to`).
	const requiredReturnActions: readonly string[] | undefined =
		params.callingThreadId != null && params.taskId == null ? ["reply"] : undefined;

	// One gate per session — all events observed by this gate. Declared
	// here (before the MCP bridge's `onToolCall` closure below references it)
	// so the closure captures the same binding `createReturnGate()`
	// initializes — the closure only ever fires later, once an actual tool
	// call streams in (well after this synchronous assignment completes).
	const returnGate = ports.harnessRuntime.createReturnGate(requiredReturnActions);
	let mcpBridgeToken: string | undefined;
	let mcpUrl: string | undefined;
	/** AL7 delta: per-session MCP token env for CLI harnesses (codex: HYPERIDLE_MCP_TOKEN). */
	let mcpTokenEnv: Record<string, string> | undefined;
	try {
		const bridge = await ports.harnessRuntime.openMcpBridge({
			registry: mcpBridgeRegistry,
			baseUrl: mcpBaseUrl,
			sessionId,
			toolRegistry: registry,
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
		mcpUrl = bridge.url;

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

	// ── Phase 8b-connections: AN2 Connection provisioning (parallel to inbound bridge).
	// AU26 E3: reads the held-connection record LIVE, in-layer, at spawn — no
	// seam, and no emit-time bake to go stale (AC1(c)).
	if (serviceConnectionResolver) {
		try {
			const plan = await buildProvisioningPlan({
				...(heldConnections ? { connections: heldConnections } : {}),
				resolver: serviceConnectionResolver,
			});
			const { mcpTokenEnv: connEnv } = await applyProvisioningPlan({
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
	try {
		await mergePluginMcpContributions(
			deps.pluginMcpContributions,
			sandboxPath,
			teamId ?? null,
			adapterCapabilities.cliMcpDialect,
			adapterCapabilities.cliMcpDialect
				? (params) => ports.harnessRuntime.writePluginStdioMcpEntries(params)
				: undefined,
		);
	} catch (mcpMergeErr) {
		// biome-ignore lint/suspicious/noConsole: graceful-degradation, matches inbound bridge
		console.warn(
			`[session-provisioning] plugin MCP merge failed for session ${sessionId}:`,
			mcpMergeErr,
		);
	}

	// ── Phase 8b-enforce: provision the return-enforcement hook for this adapter.
	await ports.harnessRuntime.provisionReturnHook({
		sandboxPath,
		channel: adapterCapabilities.returnEnforcement,
		bridgeToken: mcpBridgeToken ?? "",
		mcpUrl: mcpUrl ?? "",
		forceBudget: MAX_FORCE_RETURNS,
	});

	// ── Phase 9-10: single startSession + drain.

	// Register this session in the enforcement registry now that the
	// real gate exists.
	// The assistant is not exempt from return enforcement — it must call
	// `reply` like every other required-return session.
	const exempt = ports.toolProvider.toolsForRole(agentRole).length === 0;
	ports.harnessRuntime.enforcementRegistry.register(sessionId, {
		gate: returnGate,
		forceCount: 0,
		exempt,
		...(requiredReturnActions ? { requiredReturnActions } : {}),
	});

	let crashed = false;
	/** L17: accumulated tokens by tier for the session's tokensJson column. */
	const accumulatedTokens: Partial<Record<ModelTier, { prompt: number; completion: number }>> = {};

	// Shared session config fields across runs.
	const allowedToolNames = ports.toolProvider.toolsForRole(agentRole).map((d) => d.name);
	const returnHookConfig =
		mcpBridgeToken && mcpUrl
			? {
					bridgeToken: mcpBridgeToken,
					mcpUrl,
					forceBudget: MAX_FORCE_RETURNS,
				}
			: undefined;
	const sessionStartConfig = {
		sessionId,
		sandboxPath,
		assembledPrompt,
		modelTier,
		tools: allowedToolNames,
		resolvedModel: params.resolvedModel as ResolvedModel | undefined,
		// Absent when the agent chose nothing, so the harness keeps its own default
		// rather than being handed an empty string to strip back out.
		...(selectedModel ? { selectedModel } : {}),
		// The options this agent was configured with. Absent when the agent has
		// none, so an unconfigured agent's invocation is byte-identical to what it
		// was before per-agent options existed.
		...(Object.keys(modelOptions).length > 0 ? { modelOptions } : {}),
		mcpConnectionInfo:
			mcpBridgeToken && mcpUrl ? { url: mcpUrl, token: mcpBridgeToken } : undefined,
		returnHook: returnHookConfig,
		...(params.sessionWorkflow ? { sessionWorkflow: params.sessionWorkflow } : {}),
		...(mcpTokenEnv ? { mcpTokenEnv } : {}),
		...(requiredReturnActions ? { requiredReturnActions } : {}),
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
					// Observe every event FIRST — the gate is read-only.
					returnGate.observe(event);

					if (aborted) {
						break;
					}
					if (event.type === "token_usage") {
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
						if (interceptToolCalls) {
							await registry.invoke(event.toolName, event.args);
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
	// Close whenever a bridge was opened (token present) — `mcpBridgeRegistry` is
	// the vestigial, now-unwired dep and the face ignores it on close.
	if (mcpBridgeToken) {
		await ports.harnessRuntime.closeMcpBridge(mcpBridgeRegistry, mcpBridgeToken);
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
				...(params.taskId ? { tokensByTier: accumulatedTokens } : {}),
			},
		);
		const returnVerdict = ports.harnessRuntime.evaluateReturn(returnGate, "crashed");
		ports.harnessRuntime.enforcementRegistry.unregister(sessionId);
		return {
			sessionId,
			outcome: "crashed",
			taskId: params.taskId,
			returnVerdict,
			forceReturnCount: computeForceReturnCount(),
			...(metrics ? { metrics } : {}),
		};
	}

	// Evaluate the return gate at normal turn completion.
	const returnEndReason = aborted ? "stopped" : "completed";
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
			// AU27 Increment 5 (Decision 5): the never-silent net's `conversation`
			// subscriber needs somewhere to post — forward the already-baked
			// calling thread id (Increment 1), zero extra read.
			...(params.callingThreadId ? { callingThreadId: params.callingThreadId } : {}),
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
		taskId: params.taskId,
		returnVerdict,
		forceReturnCount: computeForceReturnCount(),
		...(metrics ? { metrics } : {}),
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
	const admitted = await admitSession(deps, params, ports);

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
	admit(deps: ProvisionSessionDeps, params: ProvisionSessionParams): Promise<AdmittedSession>;
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
	 * AU26 F2: takes the agent id plus the live, in-layer injected-filesystem
	 * reader — `mountFilesystemsForAgent` reads the record itself at spawn
	 * rather than consuming a list frozen onto the request. See
	 * `filesystem-provisioning.ts`'s own top-of-file `@lore`.
	 */
	mount(
		agentId: string,
		filesystems: InjectedFilesystemsReaderPort | undefined,
		sandboxPath: string,
		mounter: FilesystemMounterPort,
	): Promise<Filesystem[]>;
	capture: typeof captureMountedFilesystems;
}

export function createProvisioner(ports: SessionLifecyclePorts): Provisioner {
	return {
		emittedFiles: PROVISIONER_EMITTED_FILES,
		admit: (deps, params) => admitSession(deps, params, ports),
		run: (deps, params, admitted, onHarnessStarted) =>
			runSession(deps, params, admitted, ports, onHarnessStarted),
		provision: (deps, params) => provisionSession(deps, params, ports),
		start: (deps, params) => startSessionProvision(deps, params, ports),
		mount: (agentId, filesystems, sandboxPath, mounter) =>
			mountFilesystemsForAgent({
				agentId,
				...(filesystems ? { filesystems } : {}),
				sandboxPath,
				mounter,
			}),
		capture: (...args) => captureMountedFilesystems(...args),
	};
}
