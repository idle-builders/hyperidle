/** Consolidated private session provisioner and its DI boundary. */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	BakedAgentRunnableConfig,
	BakedContextBundle,
	BakedSessionResumeRequest,
	ChangeRow,
	DoneWhenLine,
	ModelTier,
	SessionOutcome,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import {
	type ConversationMessage,
	type HarnessEvent,
	isRequiredReturnAction,
	literalToolNamerForAdapterType,
	MAX_FORCE_RETURNS,
	type SessionConfig,
	type SessionHandle,
	type SessionMetrics,
	type SessionResult,
} from "@hyperidle/harness-protocol";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { readAgentRunConfig } from "./agent-run-config-store.js";
import {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type HeldConnectionsReaderPort,
} from "./connection-provisioning.js";
import {
	sessionContextDataFromBundle,
	subscriptionSessionContextDataFromBundle,
} from "./context.js";
import {
	ConcurrencyLimitError,
	NoAvailableHarnessError,
	NoEligibleHarnessError,
	TargetAgentNotRunnableError,
} from "./errors.js";
import {
	type FilesystemMounterPort,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
// Filesystem: local to this package — sibling service boundary.
import { ensureSandboxGitRepo, type Filesystem, localTrustedPath } from "./mounter.js";
import { sessionAwaitsVerdict } from "./review-sessions.js";
import { fetchPreviousSessionNotes } from "./session-store.js";
import { transitionRun } from "./transition-run.js";
import { buildVerdictMessage } from "./verdict-message.js";

type TransitionSpec = Parameters<typeof transitionRun>[1];
type SessionContext = Extract<TransitionSpec, { target: "session" }>["context"];

interface IngestionHandle {
	dispose(): void;
}

const logger = createLogger({ pkg: "run-orchestration.session-provisioner" });

// ---- ports ----

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// observability — SessionLifecycleObservability (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

interface SessionLifecycleObservability {
	summarizeToolArgs(args: Record<string, unknown>): string;
}

// ---------------------------------------------------------------------------
// filesystems: `filesystems` and `filesystem_injections` are
// `agent-orchestration`'s OWN tables; spawn reads them LIVE — no seam, no stale
// bake. `deps.injectedFilesystems` (`InjectedFilesystemsReaderPort`) is a port
// (not a direct import) — service boundary.
// ---------------------------------------------------------------------------

interface SessionLifecycleServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// connections: `service_connections` is `agent-orchestration`'s OWN table; spawn
// reads it LIVE — no seam. `deps.heldConnections` (`HeldConnectionsReaderPort`)
// is a port — service boundary.
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
	/**
	 * The harness's own id for this session, once it has one. Optional because an
	 * adapter with no resume support never reports one.
	 */
	getNativeSessionId?(handle: SessionHandle): string | undefined;
	/**
	 * Reopen a session the harness already had, delivering `message` as a fresh
	 * user turn. Optional because not every adapter supports resumption.
	 */
	resumeSession?(
		nativeSessionId: string,
		message: string,
		config: {
			readonly sandboxPath: string;
			readonly modelTier: ModelTier;
			readonly selectedModel?: string;
			readonly mcpTokenEnv?: Readonly<Record<string, string>>;
		},
	): Promise<SessionHandle>;
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
}

interface SessionLifecycleSelectedEntry {
	readonly id: string;
	readonly adapter: SessionLifecycleHarnessAdapter;
	readonly meta: SessionLifecycleAdapterMeta;
}

interface SessionLifecycleAdapterPool {
	select(requirements?: SessionLifecycleSelectRequirements): SessionLifecycleSelectedEntry | null;
	release(id: string): void;
	/**
	 * Why `select` would decline, in the pool's own words. REQUIRED, not
	 * optional: an optional diagnostic is one every implementer quietly skips,
	 * and the fallback message then becomes the thing everyone actually reads.
	 */
	describeSelectFailure(requirements?: SessionLifecycleSelectRequirements): string;
}

interface SessionLifecycleEnforcementEntry {
	readonly gate: { readonly returned: boolean };
	forceCount: number;
	readonly exempt: boolean;
	/** The session's specific required return subset, when it has one. */
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
	/** Take ownership of a directory that already exists — see the Phase 4 lore. */
	adopt(path: string): Promise<SessionLifecycleSandboxHandle>;
	exec(
		handle: SessionLifecycleSandboxHandle,
		command: string,
	): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;
	destroy(handle: SessionLifecycleSandboxHandle): Promise<void>;
}

interface SessionLifecycleHarnessRuntime {
	enforcementRegistry: SessionLifecycleEnforcementRegistry;
	/**
	 * `requiredReturnActions`, when supplied,
	 * narrows the predicate in the closure to only that subset. Absent ⇒ the
	 * the default (any member of the closed return set).
	 */
	createReturnGate(
		requiredReturnActions?: readonly string[],
		taskId?: string,
	): SessionLifecycleReturnGate;
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
		/** The session's mounted filesystems, so a harness with a trust precondition (codex) can declare them trusted alongside the sandbox. */
		readonly trustedPaths?: readonly string[];
	}): Promise<{ readonly tokenEnv?: Record<string, string> }>;
	writePluginStdioMcpEntries(params: {
		readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
		readonly sandboxPath: string;
		readonly servers: ReadonlyArray<{
			readonly key: string;
			readonly config: Record<string, unknown>;
		}>;
	}): void;
	/**
	 * The session-scoped MCP dial — bridge-open; folded into `harness-registry`'s
	 * own session provisioning (`openMcpBridgeSession`). `registry`/`baseUrl` are
	 * threaded through as call-time data.
	 */
	openMcpBridge(options: {
		// optional: execution face owns registry+mcpBaseUrl; call site still type-checks with these present
		readonly registry?: SessionLifecycleMcpBridgeRegistry;
		readonly baseUrl?: string;
		readonly sessionId: string;
		readonly toolRegistry: unknown;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string; readonly url: string }>;
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
	 * The session's calling thread, forwarded
	 * straight from `params.callingThreadId` (baked at emit — zero
	 * orchestration -> core read). Absent for `subscription_run`.
	 */
	readonly threadId?: string;
}

interface SessionLifecycleToolRegistry {
	invoke(name: string, rawArgs: unknown): Promise<unknown>;
}

interface SessionLifecycleToolProvider {
	buildToolRegistry(
		ctx: SessionLifecycleToolContext,
		options: {
			readonly extraTools?: readonly unknown[];
		},
	): SessionLifecycleToolRegistry;
	/** Every tool an agent gets — the same list for every agent. */
	toolsForRole(): readonly { readonly name: string; readonly description: string }[];
	/** `returnStatusTool.forRegistry(enforcementRegistry)` — opaque `RegisteredTool`, never inspected here. */
	returnStatusToolForRegistry(registry: SessionLifecycleEnforcementRegistry): unknown;
}

// ---------------------------------------------------------------------------
// context-assembly — SessionLifecycleContextAssembly (same-layer DI; wired by
// the composition root to `@hyperidle/context-assembly`'s `createContextAssemblyOps`)
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
		readonly doneWhen: readonly DoneWhenLine[];
	};
	/** Root-first chain of ancestor tasks. ancestors[0] is the root task (the former "bet"). */
	readonly ancestors: readonly {
		readonly id: string;
		readonly title: string;
		readonly description: string | null;
		readonly doneWhen: readonly DoneWhenLine[];
	}[];
	readonly agent: { readonly id: string; readonly name: string; readonly role: string };
	readonly team: { readonly id: string; readonly name: string };
}

interface SessionLifecycleSubscriptionSessionContextData {
	readonly subscription: {
		readonly id: string;
		readonly event: string | null;
		readonly schedule: string | null;
	};
	readonly prompt: string | null;
	readonly change: ChangeRow | null;
	readonly agent: { readonly id: string; readonly name: string; readonly role: string };
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
		readonly teamId: string | null;
		/** True for a subscription-fired session — no task/bet context to read. */
		readonly taskFree: boolean;
		readonly sourceKind: AgentSessionSourceKind | null;
		readonly sourceId: string | null;
		readonly sourceCorrelation: AgentSessionSourceCorrelation | null;
		readonly contextBundle?: BakedContextBundle;
		readonly previousSessionNotes?: string | null;
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
	assembleSubscriptionPrompt(input: {
		readonly systemPromptText: string;
		readonly context: SessionLifecycleSubscriptionSessionContextData;
		readonly tools: readonly SessionLifecycleToolSummary[];
		readonly sandboxPath: string;
		readonly returnOrientation?: string;
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
		/**
		 * `reason` distinguishes a genuine stop from an adapter's own return —
		 * see `stopRequested` below for why the distinction has to survive the
		 * whole way to the registry's `signalAbort`, not just get decided here.
		 */
		abortSessionRun(sessionId: string, reason: "stop" | "return"): Promise<boolean>;
		registerSessionRun(
			sessionId: string,
			control: {
				signalAbort(reason: "stop" | "return"): void;
				handle: SessionHandle;
				adapter: SessionLifecycleHarnessAdapter;
				/** Pre-bound deliver fn; absent when the adapter doesn't support stdin delivery. */
				deliver?: (text: string) => Promise<"delivered" | "unsupported">;
				agentId?: string;
				threadId?: string;
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
 * True for a task-free session whose only satisfying return action is
 * `send_message` — one line, shared by the prompt orientation
 * (`assembleTaskFreePrompt`) and the enforced gate (`requiredReturnActions`
 * below) so the two can never drift apart. A session that replies into a
 * calling thread (the assistant) resolves `true`. A
 * task-bound session (task_run) keeps the full return set,
 * `edit_task` included, even with a calling thread.
 *
 * A subscription wake is deliberately NOT covered here — see
 * `requiresReturnStatusReturn` below. Forcing `send_message` on a
 * subscription session made every wake end with an unwanted direct message
 * to whoever the session happened to fall back to reporting to, even when
 * the subscription's own instruction never asked it to say anything.
 */
function requiresSendMessageReturn(params: ProvisionSessionParams): boolean {
	return params.taskId == null && params.callingThreadId != null;
}

/**
 * True for a subscription wake: a task-free session with no calling thread
 * to reply into (`resolveSubscriptionWakeRequest` never bakes one — there is
 * no conversation to answer), woken by an event or schedule rather than a
 * person. It has no work-output return action to call at all, so its only
 * satisfying return action is the self-check `return_status` tool —
 * reporting that it is done IS its return. It speaks when the subscription's
 * own instruction tells it to — or, with none written, when it judges the
 * change needs it — by calling `send_message` itself; never forced, because a subscription session has nowhere
 * structural for a forced message to go that is guaranteed to be right (see
 * `requiresSendMessageReturn`'s note).
 */
function requiresReturnStatusReturn(params: ProvisionSessionParams): boolean {
	return params.taskId == null && params.requestContext?.sourceKind === "subscription";
}

function assembleTaskFreePrompt(
	_db: HyperIdleDb,
	params: ProvisionSessionParams,
	systemPromptText: string,
	toolSummaries: readonly SessionLifecycleToolSummary[],
	_ports: SessionLifecyclePorts,
	/**
	 * The selected adapter's registration
	 * `type` (e.g. "opencode", "claude-code"), used to name the `send_message`
	 * tool literally in the orientation line below — see `literalToolNamerForAdapterType`.
	 */
	adapterType: string | undefined,
): Promise<string> {
	const toolSection =
		toolSummaries.length > 0
			? `\n\n## Tools\n${toolSummaries.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`
			: "";

	// When a transcript is present,
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

	// A one-line reminder when this
	// session's only satisfying return action is `send_message`, not the trio.
	//
	// Name the LITERAL tool the harness
	// exposes (e.g. `mcp__hyperidle__send_message` / `hyperidle_send_message`),
	// not the bare name — a model that must resolve a bare mention itself
	// either burns an extra round trip doing so (Claude's internal tool
	// search) or, on a smaller model, fails outright trying to call a tool
	// name that does not exist ("Model tried to call unavailable tool
	// 'send_message'").
	const sendMessageToolName = literalToolNamerForAdapterType(adapterType)("send_message");
	// requiresSendMessageReturn is true only when a calling thread is present
	// (see its own doc comment) — this session always has one here.
	const sendMessageOrientation = requiresSendMessageReturn(params)
		? `When you are done, call \`${sendMessageToolName}\` to answer in this conversation.`
		: "";

	// A subscription wake (no calling thread, no work-output action) reports
	// its status instead — see `requiresReturnStatusReturn`. This is the
	// graceful-degrade fallback prompt (no `kind:"subscription"` bundle to
	// build the real `assembleSubscriptionPrompt` from); the real composer
	// carries the same line (`context.ts`'s `returnOrientation`).
	// No bundle means no instruction reached this prompt, so it is the
	// no-instruction line whatever the subscription holds.
	const returnStatusToolName = literalToolNamerForAdapterType(adapterType)("return_status");
	const returnStatusOrientation = requiresReturnStatusReturn(params)
		? subscriptionReturnOrientation(returnStatusToolName, false)
		: "";

	return Promise.resolve(
		[
			systemPromptText,
			sourceSection,
			conversationSection,
			sendMessageOrientation,
			returnStatusOrientation,
			toolSection,
		]
			.filter(Boolean)
			.join("\n\n"),
	);
}

/**
 * Read-only context passed to `onBeforeTeardown` observers.
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
 */
interface BeforeHarnessStartContext {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly adapter: SessionLifecycleSelectedEntry;
	readonly sessionConfig: SessionConfig;
}
/**
 * @lore: plugin template variables — ${PLUGIN_ROOT} → installPath; ${PLUGIN_DATA} → installPath/data; command is one atom (schema separates command and args)
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
 * Exported so the scaffolding-drift-guard can assert coverage.
 *
 * .mcp.json must be excluded from authored commits so the agent
 * working on a repo that tracks .mcp.json does not overwrite the real config.
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
	/** MCP bridge registry. When present, a bridge is created per session. */
	readonly mcpBridgeRegistry?: SessionLifecycleMcpBridgeRegistry;
	/** Base URL for MCP bridge (e.g., "http://localhost:3001"). */
	readonly mcpBaseUrl?: string;
	/**
	 * Already-constructed ServiceConnectionResolver (encapsulates serverSecret).
	 * When present, held connections are provisioned into the session sandbox.
	 * Mirrors the mcpBridgeRegistry? optional pattern: absent → graceful no-op.
	 */
	readonly serviceConnectionResolver?: SessionLifecycleServiceConnectionResolver;
	/**
	 * The live, in-layer held-connection read one spawn performs.
	 * Application-composed from `@hyperidle/connections`. Absent → the
	 * provisioning plan is empty, the same graceful no-op an absent
	 * `serviceConnectionResolver` already gives.
	 */
	readonly heldConnections?: HeldConnectionsReaderPort;
	/**
	 * The live, in-layer injected-filesystem read one spawn performs.
	 * Application-composed from `@hyperidle/filesystems`. Absent → nothing is
	 * mounted, the same graceful no-op an absent `mounter` already gives.
	 */
	readonly injectedFilesystems?: InjectedFilesystemsReaderPort;
	/**
	 * Optional observation hook, fired once after the agent's turn fully
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
	 * Optional mounter for filesystem placement.
	 * When absent, sessions run without any filesystem mount (degrade to today's behavior).
	 * When present, mount runs after sandbox spawn (Phase 4.5).
	 */
	readonly mounter?: FilesystemMounterPort;
	/**
	 * Plugin MCP server contributions for this session's team scope.
	 * When absent, no plugin MCP servers are merged into the session config.
	 * Provided by the application via CoreApiBoot.pluginMcpContributions.
	 */
	readonly pluginMcpContributions?: PluginMcpContributionsPort;
}

interface ProvisionSessionParams {
	readonly taskId: string | null;
	readonly agentId: string;
	readonly productId: string;
	readonly sandboxBasePath: string;
	readonly factoryCap?: number;
	readonly factorySpend?: number;
	readonly reviewThreadId?: string;
	readonly modelTier?: ModelTier;
	readonly requestContext?: {
		readonly requestId: string;
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly sourceCorrelation: AgentSessionSourceCorrelation;
	};
	/**
	 * The baked entity+knowledge bundle
	 * this session's sandbox context (Phase 6) and prompt persona (Phase 8.5)
	 * are built from — `kind:"task"` for `task_run`,
	 * `kind:"subscription"` for `subscription_run`. Sourced from the emit-time
	 * resolver via the drained `AgentSessionRequest.payloadJson` (zero db read
	 * here). Absent for `assistant_turn` turns.
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * The target agent's
	 * runnable-CONFIG snapshot, baked at EMIT time by every per-kind resolver
	 * (all six intent kinds) from the SAME `agent: User` row
	 * `requireRunnableAgent` already loaded + validated there (no new read —
	 * `role`/
	 * `systemPrompt`/`harnessType`/`modelProvider`/
	 * `maxConcurrentSessions`/`teamId` all come from THIS baked snapshot —
	 * staleness there is a UX/efficiency concern only.
	 *
	 * **`kind`/`status` are DEFENSE-IN-DEPTH ONLY, never a live authority gate**
	 * — a resolver's `requireRunnableAgent` call guarantees
	 * this snapshot's `kind`/`status` are ALWAYS runnable at emit time, so
	 * re-checking them here can only catch a resolver bug, never a real
	 * emit→deactivate→drain race — and no live/pushed mechanism replaces it
	 * (orchestration never initiates work on its own, so
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
	 * The session's calling thread id, baked at
	 * EMIT time by every per-kind resolver that has one (`assistant_turn` from
	 * the triggering message's thread; `task_run` from the document's own
	 * thread). Absent for
	 * `subscription_run`. Forwarded verbatim onto
	 * `SessionLifecycleToolContext.threadId` — the `reply` tool reads it
	 * from there. ZERO orchestration -> core read.
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

	readonly resume?: BakedSessionResumeRequest;
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

// @lore: gate push-back — deny carries only the blocked-rule fact; instruction lives in the prompt; deny with next-step refused by model as suspected injection

function reviewOrientation(sendMessageToolName: string): string {
	return `

## When work needs a person
Nothing here stops you. You decide when work deserves a person's agreement before you do it — an irreversible change, something that reaches beyond this workspace, a call where being wrong would be expensive, or anything you would want a second opinion on. When you judge that it does, ask by calling \`${sendMessageToolName}\` with a \`review\`: a \`title\`, short \`reasoning\` points — what you have done, what you want to do next and why — the \`parts\` a person should look at (a live page, a code diff, an image, numbers, a text, or a batch of items), and \`flags\` on the spots you decided without asking, are not sure about, or that touch customers. A person checks rather than reads, so the flags are where they look. It goes to the conversation you were called from, or else to your person. That call ends your session. A person approves or rejects it with a reason, and you are brought back with their answer; their comments on your parts are messages in that conversation, each with an \`anchor\` — reply with the same anchor. After a reject, send the next round as a new review with \`previousReviewId\` and what \`changed\`. A reject turns down the approach you proposed, not the task — keep working toward the same goal another way.`;
}

/**
 * The line a subscription session ends its prompt with. With an instruction
 * written, the session speaks only if that instruction asks it to. With none
 * — a fresh subscription nobody has given taste to yet — it is told so and
 * left to judge for itself; telling it to speak only if an absent instruction
 * asks would silence every empty subscription for good.
 */
function subscriptionReturnOrientation(
	returnStatusToolName: string,
	hasInstruction: boolean,
): string {
	const done = `When you are done, call \`${returnStatusToolName}\` to report your status.`;
	return hasInstruction
		? `${done} Speak only if the subscription's instruction above asks you to.`
		: `Nobody has written an instruction for this event yet — decide for yourself whether it needs anything from you. ${done}`;
}

/**
 * The synchronous result of admission (phases 1-7). Carries everything
 * `runSession` (phases 8-11) needs to run the harness and tear down. Produced by
 * `admitSession` AFTER the session row is committed and `session_started` emitted.
 */
interface AdmittedSession {
	readonly sessionId: string;
	readonly sessionContext: SessionContext;
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
	readonly ingestion: IngestionHandle;
	readonly selectedAdapter: SessionLifecycleSelectedEntry;
	readonly harness: SessionLifecycleHarnessAdapter;
	readonly adapterId: string;
	/**
	 * Filesystems that were successfully mounted in Phase 4.5 for this session.
	 */
	readonly mountedFilesystems: Filesystem[];
}

/**
 * Admit a session synchronously (phases 1-7).
 *
 * Runs the HTTP-observable prefix: load agent, adapter
 * select + concurrency check, **resolvedModel presence guard**, task transition,
 * workspace spawn, session row insert, context assembly, start watcher,
 * emit `session_started`. ALL admission failures (ConcurrencyLimit 429 /
 * MissingCredential 500) throw BEFORE the session row insert — the detach
 * boundary — so they map to HTTP
 * status on the POST path and never leave a doomed row.
 */
async function admitSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	ports: SessionLifecyclePorts,
): Promise<AdmittedSession> {
	const { db, eventBus, adapterPool, workspace } = deps;

	// ── Phase 1: consume the baked agent-CONFIG snapshot. NO live re-check.
	const agentConfig = params.agentConfig;
	// @lore: admit — agentConfig absent = deactivated agent = hard provisioning failure (TARGET_AGENT_NOT_RUNNABLE); never a silent allow; every real path bakes it
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
	const teamId = agentConfig.teamId ?? undefined;

	// The run-config fields are read LIVE here from
	// `agent_run_config` — orchestration's OWN table — instead of coming off the
	// emit-time bake. An agent with no row resolves the all-null default.
	const runConfig = await readAgentRunConfig(db, params.agentId);

	// The agent's identity is the `agent_file` document bound to it,
	// baked onto the request core-side. It cannot be read here: `documents`
	// belongs to the document service, while `agent_run_config` — read just above
	// — is orchestration's own.
	const persona = agentConfig.persona ?? "";

	const modelTier: ModelTier = params.modelTier ?? "workhorse";

	// ── Phase 3: adapter selection + concurrency check + task transition.
	const selectRequirements = {
		harnessType: runConfig.harnessType ?? undefined,
		...(runConfig.modelProvider
			? { modelProviders: [runConfig.modelProvider] as readonly string[] }
			: {}),
	};
	const selectedAdapter = adapterPool.select(selectRequirements);
	if (!selectedAdapter) {
		// Ask the pool WHY — `select` declines for six distinct causes; asserting one gives the wrong diagnostic.
		const reason = adapterPool.describeSelectFailure(selectRequirements);
		if (runConfig.harnessType) {
			throw new NoEligibleHarnessError(runConfig.harnessType, reason);
		}
		throw new NoAvailableHarnessError(reason);
	}
	const harness = selectedAdapter.adapter;
	const adapterId = selectedAdapter.id;

	const systemPromptText = `${persona}${reviewOrientation(
		literalToolNamerForAdapterType(selectedAdapter.meta.type)("send_message"),
	)}`;

	// @lore: concurrency check — exclude the request's own correlated session; request-mediated admission already reserved it before this check runs
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

	// A task's `in_progress` transition fires as a `session_started` reaction
	// (`core-api/src/services/work-session-started-reactions.ts`), after
	// phases 4-7 below commit the session row.

	// ── Phases 4-7 (wrapped): spawn workspace → insert session row →
	// context assembly → start watcher. If any step throws here, the session
	// row/harness never fully launched — see the note above
	// `SessionLifecycleWorkAccessor`'s deletion for why no task-state revert
	// is needed: the task's `in_progress` transition itself only fires
	// reactively on `session_started`, emitted AFTER this block succeeds, so
	// a failure in this window never transitioned the task away from
	// `accepted`/`blocked` in the first place.
	let sessionId: string;
	let sandboxPath: string;
	let mountedFilesystems: Filesystem[] = [];
	// ── Phase 4: spawn sandbox via adapter.
	//
	// @lore: resumed session directory — adopts the original; cursor-agent keys its chat on md5(cwd); a different dir loses all context and exits 0 silently
	const sandboxHandle: SessionLifecycleSandboxHandle = params.resume?.sandboxPath
		? await workspace.adopt(params.resume.sandboxPath)
		: await workspace.spawn(params.sandboxBasePath);
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
	};
	if (reservedSession) {
		await db
			.update(sessions)
			.set({ ...sessionValues, id: undefined })
			.where(eq(sessions.id, reservedSession.id));
	} else {
		await db.insert(sessions).values(sessionValues);
	}

	// ── Phase 4.5: mount injected filesystems. Reads the
	// injection record LIVE, in-layer, at spawn — no seam, no stale bake.
	if (deps.mounter) {
		mountedFilesystems = await mountFilesystemsForAgent({
			agentId: params.agentId,
			...(deps.injectedFilesystems ? { filesystems: deps.injectedFilesystems } : {}),
			sandboxPath,
			mounter: deps.mounter,
		});
	}

	// @lore: sandbox git init — after mounting only; git clone refuses an existing .git; unconditional; every session needs it (codex trust, agent diff/revert)
	ensureSandboxGitRepo(sandboxPath);

	// ── Phase 6: assemble context into the sandbox through the agent layer.
	// Fetch the previous completed session's notes for this task so the agent
	// can pick up where it left off. Only task-backed sessions carry notes.
	const previousSessionNotes = params.taskId
		? await fetchPreviousSessionNotes(db, params.taskId)
		: null;

	if (params.taskId) {
		await ports.contextAssembly.assembleAgentContext({
			sandboxPath,
			sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			teamId: params.productId,
			taskFree: params.contextBundle?.kind === "subscription",
			sourceKind: params.requestContext?.sourceKind ?? null,
			sourceId: params.requestContext?.sourceId ?? null,
			sourceCorrelation: params.requestContext?.sourceCorrelation ?? null,
			contextBundle: params.contextBundle,
			previousSessionNotes,
		});
	} else if (params.requestContext) {
		await ports.contextAssembly.assembleAgentContext({
			sandboxPath,
			sessionId,
			taskId: null,
			agentId: params.agentId,
			teamId: params.productId,
			taskFree: params.contextBundle?.kind === "subscription",
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
		traceId: randomUUID(),
	};

	return {
		sessionId,
		sessionContext,
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
 * Run an admitted session (phases 8-11).
 *
 * Builds the session-scoped tool registry, composes the prompt, starts the
 * harness, drains the event stream, and tears down. Normal
 * completion calls `endSession`; an error mid-stream calls `crashSession`.
 *
 * Registers itself in the `sessionRunRegistry` at harness-start so a
 * PATCH/handoff can cooperatively abort it, and deregisters at teardown.
 */
/**
 * What the agent is being asked to do, for a session that has a task.
 *
 * @lore: task instruction — task IS the user prompt; assembled context goes to AGENTS.md; conflating them gave the agent a 200-char slice of the wrong prompt
 *
 * Returns undefined when the session has no task — a subscription, heartbeat, or assistant turn.
 */
function composeTaskInstruction(params: ProvisionSessionParams): string | undefined {
	const bundle = params.contextBundle;
	if (bundle?.kind !== "task") return undefined;
	const { title, description } = bundle.task;
	const parts = [`Your task: ${title}`];
	if (description) parts.push(description);
	if (bundle.ancestors.length > 0) {
		// The goal chain this task serves, root first — a leaf task read alone can
		// be followed to the letter and still miss the point of the work above it.
		const chain = bundle.ancestors
			.map((a) => {
				const openLines = a.doneWhen.filter((l) => l.state === "open" || l.state === "failed");
				const summary =
					openLines.length > 0 ? ` (done when: ${openLines.map((l) => l.what).join("; ")})` : "";
				return `${a.title}${summary}`;
			})
			.join(" → ");
		parts.push(`This serves: ${chain}`);
	}
	return parts.join("\n\n");
}

async function runSession(
	deps: ProvisionSessionDeps,
	params: ProvisionSessionParams,
	admitted: AdmittedSession,
	ports: SessionLifecyclePorts,
	/**
	 * Fired exactly once right after `harness.startSession` resolves
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

	// Cooperative abort flag — the provisioning event loop checks it each
	// iteration. Several things flip it (a registry abort, an adapter's own
	// return action, an onBeforeHarnessStart failure) and all of them must stop
	// the loop, but only one of them is an actual user stop — see
	// `stopRequested` below.
	let aborted = false;
	/**
	 * A real stop request, set ONLY inside the registry's `signalAbort` below,
	 * and only when it is called with reason "stop". `signalAbort` also fires
	 * with reason "return" — the deferred kill an adapter's own return action
	 * schedules below reaches the SAME registered session, through the SAME
	 * registry, while the entry is still live, so the discriminator has to be
	 * the `reason` each caller passes, not merely which function got called.
	 * A startup failure sets `aborted` directly, never through the registry,
	 * so it never reaches `stopRequested` either way.
	 */
	let stopRequested = false;

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
	};
	// Every session, assistant included, gets every tool.
	const registry: SessionLifecycleToolRegistry = ports.toolProvider.buildToolRegistry(toolContext, {
		extraTools: [
			ports.toolProvider.returnStatusToolForRegistry(ports.harnessRuntime.enforcementRegistry),
		],
	});

	// ── Phase 8.5: compose prompt and write CLAUDE.md.
	const toolSummaries: SessionLifecycleToolSummary[] = ports.toolProvider
		.toolsForRole()
		.map((d) => ({
			name: d.name,
			description: d.description,
		}));

	let assembledPrompt: string;
	if (params.contextBundle?.kind === "subscription") {
		// Subscription session — derive
		// subscription+agent+team context from the baked `kind:"subscription"`
		// bundle, ZERO db read.
		const subscriptionContextData = subscriptionSessionContextDataFromBundle(params.contextBundle);
		// A subscription wake has no calling thread and no work-output action;
		// needs the same proactive one-line heads-up (literal tool name the
		// SELECTED harness exposes) threaded through as pre-rendered text
		// so this module's own prompt composer never needs the
		// harness-protocol return-action vocabulary imported into it.
		const subscriptionReturnStatusToolName = literalToolNamerForAdapterType(
			selectedAdapter.meta.type,
		)("return_status");
		({ assembledPrompt } = await ports.contextAssembly.assembleSubscriptionPrompt({
			systemPromptText,
			context: subscriptionContextData,
			tools: toolSummaries,
			sandboxPath,
			...(requiresReturnStatusReturn(params)
				? {
						returnOrientation: subscriptionReturnOrientation(
							subscriptionReturnStatusToolName,
							Boolean(subscriptionContextData.prompt),
						),
					}
				: {}),
		}));
	} else if (params.taskId && !params.requestContext && params.contextBundle?.kind === "task") {
		// Task session — derive context from baked `kind:"task"` bundle, ZERO db read.
		const sessionContextData = sessionContextDataFromBundle(params.contextBundle);
		({ assembledPrompt } = await ports.contextAssembly.assemblePrompt({
			systemPromptText,
			context: sessionContextData,
			tools: toolSummaries,
			sandboxPath,
		}));
	} else {
		// Every durable session (the
		// primary production path — `requestContext` is always set by
		// `consumeAgentSessionRequest`) already took this generic, db-free
		// branch for every durable session source kind — this is also the graceful fallback for a subscription/task session whose
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

	// @lore: transcript delivery — SessionConfig.messages unread; assembled prompt section is the only delivery path

	ports.contextAssembly.writeSandboxAgentsMd(sandboxPath, assembledPrompt);

	// What the agent is asked to do, as opposed to what it is told about
	// itself. Composed from the task the session was dispatched for.
	const taskInstruction = composeTaskInstruction(params);

	// Retrieve adapter capabilities once.
	const adapterCapabilities = harness.getCapabilities();

	// ── Phase 8b: create MCP bridge for CLI harnesses that dial it over HTTP.
	const mcpJsonPath = path.join(sandboxPath, PROVISIONER_EMITTED_FILES[0]);
	if (!fs.existsSync(mcpJsonPath)) {
		fs.writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
	}

	// See `requiresReturnStatusReturn`/`requiresSendMessageReturn`. A
	// subscription wake (task-free, never bakes a calling thread — there is
	// no thread to reply into, and no task to hand off) has no work-output
	// return action at all, so its own required subset is `["return_status"]`
	// — the self-check tool reporting it is done. A session whose output
	// belongs in a calling thread and has no task (the assistant) must call
	// `send_message` instead — that thread is a real place for the message to
	// land. A task-bound session (task_run) keeps the full return set available even with
	// a calling thread (`send_message` still lands there, but so does e.g.
	// `edit_task`). Naming the specific action explicitly removes dead
	// options the default full-set forcing message would otherwise offer —
	// e.g. `edit_task` can never satisfy a task-free gate (no `taskId` to
	// match), so a session with no specific requirement could burn its whole
	// force budget on an ineffective attempt and end `not_returned`
	// regardless of harness.
	const requiredReturnActions: readonly string[] | undefined = requiresReturnStatusReturn(params)
		? ["return_status"]
		: requiresSendMessageReturn(params)
			? ["send_message"]
			: undefined;

	// One gate per session — all events observed by this gate. Declared
	// here (before the MCP bridge's `onToolCall` closure below references it)
	// so the closure captures the same binding `createReturnGate()`
	// initializes — the closure only ever fires later, once an actual tool
	// call streams in (well after this synchronous assignment completes).
	const returnGate = ports.harnessRuntime.createReturnGate(
		requiredReturnActions,
		params.taskId ?? undefined,
	);
	let mcpBridgeToken: string | undefined;
	let mcpUrl: string | undefined;
	/** Per-session MCP token env for CLI harnesses (codex: HYPERIDLE_MCP_TOKEN). */
	let mcpTokenEnv: Record<string, string> | undefined;
	try {
		const bridge = await ports.harnessRuntime.openMcpBridge({
			registry: mcpBridgeRegistry,
			baseUrl: mcpBaseUrl,
			sessionId,
			toolRegistry: registry,
			onToolCall: ({ toolName, args }) => {
				// The SAME required-aware predicate the gate itself uses (not the
				// unfiltered `isReturnAction`) — otherwise a subscription session's
				// `return_status` call (never a member of the base closed set,
				// satisfying ONLY via `requiredReturnActions`) would never trip this
				// early-abort path, unlike every other kind's return action.
				if (
					!isRequiredReturnAction(
						toolName,
						requiredReturnActions,
						args as Record<string, unknown>,
						params.taskId ?? undefined,
					)
				)
					return;

				returnGate.observe({
					type: "tool_call",
					toolName,
					args: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
				});
				if (selectedAdapter.meta.type === "opencode") {
					aborted = true;
					setTimeout(() => {
						// "return", not "stop": this is opencode's own turn ending, a
						// defensive kill in case the process is still running after it —
						// not a user asking the session to stop. See `stopRequested` above.
						void ports.sessionRequests.abortSessionRun(sessionId, "return").catch(() => {
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
			// The session's mounted filesystems (phase 4.5
			// above) are the trusted directories — tell the harness what the
			// filesystem primitive already declared, alongside the sandbox.
			const trustedPaths = mountedFilesystems
				.map((filesystem) => localTrustedPath(filesystem))
				.filter((p): p is string => p !== undefined);
			const result = await ports.harnessRuntime.writeCliMcpConfig({
				dialect: adapterCapabilities.cliMcpDialect,
				sandboxPath,
				mcpUrl,
				token: bridge.token,
				...(trustedPaths.length > 0 ? { trustedPaths } : {}),
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

	// ── Phase 8b-connections: connection provisioning (parallel to inbound bridge).
	// Reads the held-connection record LIVE, in-layer, at spawn — no
	// seam, and no emit-time bake to go stale.
	if (serviceConnectionResolver) {
		try {
			const plan = await buildProvisioningPlan({
				agentId: params.agentId,
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
	// `send_message` like every other required-return session.
	const exempt = ports.toolProvider.toolsForRole().length === 0;
	ports.harnessRuntime.enforcementRegistry.register(sessionId, {
		gate: returnGate,
		forceCount: 0,
		exempt,
		...(requiredReturnActions ? { requiredReturnActions } : {}),
	});

	let crashed = false;
	/** Accumulated tokens by tier for the session's tokensJson column. */
	const accumulatedTokens: Partial<Record<ModelTier, { prompt: number; completion: number }>> = {};

	// Shared session config fields across runs.
	const allowedToolNames = ports.toolProvider.toolsForRole().map((d) => d.name);
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
		// The ask, whole and separate from the context above.
		...(taskInstruction ? { instruction: taskInstruction } : {}),
		modelTier,
		tools: allowedToolNames,
		// Absent when the agent chose nothing, so the harness keeps its own default
		// rather than being handed an empty string to strip back out.
		...(selectedModel ? { selectedModel } : {}),
		// The options this agent was configured with. Absent when the agent has
		// none.
		...(Object.keys(modelOptions).length > 0 ? { modelOptions } : {}),
		mcpConnectionInfo:
			mcpBridgeToken && mcpUrl ? { url: mcpUrl, token: mcpBridgeToken } : undefined,
		returnHook: returnHookConfig,
		...(mcpTokenEnv ? { mcpTokenEnv } : {}),
		...(requiredReturnActions ? { requiredReturnActions } : {}),
	};

	// Determine whether to intercept tool_call events from the stream.
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

	// try/finally ensures the adapter pool slot is ALWAYS released once, even
	// on errors.
	try {
		if (!aborted) {
			// @lore: resume verdict — real turn in the harness's own session; cursor-agent refused a fabricated approval transcript; a real turn IS the human
			//
			// The resume runs in the ORIGINAL session's directory, not this one's.
			// cursor-agent keys a chat on an md5 of the cwd string
			// (`~/.cursor/chats/<md5(cwd)>/`), so resuming from anywhere else exits 0,
			// echoes back the right session id, and runs with no context at all —
			// silently, with nothing in the stream. The chat itself lives outside the
			// sandbox, so what has to match is the path, not what is in it. claude
			// finds a session by id from any directory and is unaffected either way.
			if (params.resume?.harnessSessionId && harness.resumeSession) {
				harnessHandle = await harness.resumeSession(
					params.resume.harnessSessionId,
					buildVerdictMessage(params.resume),
					{
						// Phase 4 adopted the original session's directory, so this IS it.
						sandboxPath,
						modelTier,
						...(selectedModel ? { selectedModel } : {}),
						...(mcpTokenEnv ? { mcpTokenEnv } : {}),
					},
				);
			} else {
				harnessHandle = await harness.startSession(sessionStartConfig as SessionConfig);
				// @lore: immediate harnessSessionId write — claude assigns via --session-id before spawn, so getNativeSessionId works right away; write to DB now so review verdicts and deliver calls can find the session even if the stream is still running
				const immediateNativeId = harness.getNativeSessionId?.(harnessHandle);
				if (immediateNativeId) {
					try {
						await deps.db
							.update(sessions)
							.set({ harnessSessionId: immediateNativeId })
							.where(eq(sessions.id, sessionId));
					} catch (writeErr) {
						logger.warn(
							`[session-provisioning] immediate harnessSessionId write failed for session ${sessionId}:`,
							writeErr,
						);
					}
				}
			}
			// Capture handle and deliver as consts — harnessHandle is non-null here (just set above)
			// but TypeScript sees it as SessionHandle | null since it's a `let`; consts narrow cleanly.
			const registeredHandle = harnessHandle as SessionHandle;
			const adapterDeliver = harness.deliver;
			ports.sessionRequests.registerSessionRun(sessionId, {
				signalAbort: (reason) => {
					aborted = true;
					if (reason === "stop") stopRequested = true;
				},
				handle: registeredHandle,
				adapter: harness,
				// Pre-bind deliver so the registry holds a simple (text) => Promise fn
				...(adapterDeliver !== undefined
					? {
							deliver: (text: string) => adapterDeliver(registeredHandle, text),
							agentId: params.agentId,
							...(params.callingThreadId ? { threadId: params.callingThreadId } : {}),
						}
					: {}),
			});
		}
		onHarnessStarted?.();

		// ── Phase 10: drain the event stream.
		try {
			if (harnessHandle) {
				for await (const event of harness.streamEvents(harnessHandle)) {
					// Observe every event FIRST — the gate is read-only.
					returnGate.observe(event);

					// @lore: verdict dir preservation — reviewed session is waiting; resume needs original cwd; harness hangs silently if cwd is gone and verdict reaches nobody

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
		// release the adapter pool slot EXACTLY ONCE after the single run.
		adapterPool.release(adapterId);
	}

	// The harness's own id for this session, written down before teardown drops
	// the handle. Without it there is nothing to resume, and a verdict cannot
	// bring the agent back after a human decides.
	//
	// @lore: native session id — read after stream drains; claude reports at start, others in stream; null means genuinely non-resumable
	if (harnessHandle) {
		const nativeSessionId = harness.getNativeSessionId?.(harnessHandle);
		if (nativeSessionId) {
			try {
				await deps.db
					.update(sessions)
					.set({ harnessSessionId: nativeSessionId })
					.where(eq(sessions.id, sessionId));
			} catch (persistErr) {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[session-provisioning] could not persist harness session id for ${sessionId}; ` +
						`this session will not be resumable:`,
					persistErr,
				);
			}
		}
	}

	// ── Phase 11: teardown.
	// The run is over — drop the abort affordance.
	ports.sessionRequests.deregisterSessionRun(sessionId);

	// Unregister the MCP bridge BEFORE calling endSession/crashSession.
	// Close whenever a bridge was opened (token present) — `mcpBridgeRegistry` is
	// the dep the face ignores on close.
	if (mcpBridgeToken) {
		await ports.harnessRuntime.closeMcpBridge(mcpBridgeRegistry, mcpBridgeToken);
	}

	function computeForceReturnCount(): number {
		const registryEntry = ports.harnessRuntime.enforcementRegistry.get(sessionId);
		const registryForceCount = registryEntry?.forceCount ?? 0;
		const adapterForceCount = harness.getForceReturnCount?.(sessionId) ?? 0;
		return registryForceCount + adapterForceCount;
	}

	// Observation seam.
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
		// Never silently complete a not-returned turn — surface the escape.
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
			// forward the baked calling thread id — never-silent net's subscriber posts there; zero extra read.
			...(params.callingThreadId ? { callingThreadId: params.callingThreadId } : {}),
			timestamp: Date.now(),
		});

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

	// @lore: terminalOutcome "stopped" — only from stopRequested; aborted also fires on adapter return and startup failure and must not be read as a stop
	await transitionRun(
		{ db, eventBus, ports },
		{
			target: "session",
			context: sessionContext,
			disposition: "end",
			...(stopRequested ? { terminalOutcome: "stopped" as const } : {}),
			...(params.taskId ? { tokensByTier: accumulatedTokens } : {}),
		},
	);
	// @lore: teardown dir guard — filesystem belongs to the work; reviewed session is waiting; resume hangs if cwd is gone; question is on the review_sessions row
	if (!(await sessionAwaitsVerdict(db, sessionId))) {
		await workspace.destroy(sandboxHandle);
	}
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
 * Admit a session synchronously and DETACH its run.
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
 * Retained as a thin wrapper over `admitSession` + `runSession` for the
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
	 * Takes the agent id plus the live, in-layer injected-filesystem
	 * reader — `mountFilesystemsForAgent` reads the record itself at spawn
	 * rather than consuming a list frozen onto the request.
	 */
	mount(
		agentId: string,
		filesystems: InjectedFilesystemsReaderPort | undefined,
		sandboxPath: string,
		mounter: FilesystemMounterPort,
	): Promise<Filesystem[]>;
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
	};
}
