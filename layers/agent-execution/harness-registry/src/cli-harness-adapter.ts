/**
 * CliHarnessAdapter — spawns an external CLI tool as a child process and
 * translates its stdout into HarnessEvents.
 *
 * Supports any tool that can be invoked as a subprocess. Each CLI tool is
 * registered as its own adapter instance in the pool with its own harnessType
 * (e.g. "codex", "opencode").
 *
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionMetrics,
	SessionResult,
	SessionResumeConfig,
} from "@hyperidle/harness-protocol";
import { isRequiredReturnAction } from "@hyperidle/harness-protocol";
import type { EnforcementRegistry } from "./enforcement-registry.js";
import { normalizeHarnessEvent, preMapClaudeEvent } from "./harness-event-normalization.js";
import { modelOptionArgv } from "./model-options.js";
import { createReturnEnforcement } from "./return-enforcement.js";

/** Used when no enforcement is injected (tests that don't care about the registry). */
function createIsolatedEnforcementRegistry(): EnforcementRegistry {
	return createReturnEnforcement();
}

// @lore: preMapClaudeEvent — per-line in parseStdoutLine when dialect==claude-stream-json; applied here only, not in normalizeHarnessEvent

/**
 * Template variable names used in args and envMap.
 */
type TemplateVar = "{{sandbox}}" | "{{model}}" | "{{mcpUrl}}" | "{{prompt}}";

function isExecutableFile(filePath: string): boolean {
	try {
		fs.accessSync(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export type { CliAdapterConfig, CliAdapterDeps, CliAvailabilityDeps };

function binaryOnPath(binary: string): boolean {
	const pathEntries = process.env.PATH?.split(path.delimiter) ?? [];
	return pathEntries.some((entry) => isExecutableFile(path.join(entry, binary)));
}

interface CliAdapterConfig {
	/** Executable name or absolute path. */
	readonly binary: string;
	/**
	 * CLI arguments with template variables:
	 * {{sandbox}}, {{model}}, {{mcpUrl}}.
	 */
	readonly args: readonly string[];
	/**
	 * Environment variable mappings. Values may use the same template variables.
	 * These are merged with the allowlisted host env vars.
	 */
	readonly envMap: Readonly<Record<string, string>>;
	/**
	 * How to interpret stdout lines.
	 * "ndjson" — each line is parsed as JSON; valid HarnessEvent objects are
	 * yielded directly; invalid JSON is wrapped as completion events.
	 * "text" — all lines are wrapped as completion events regardless of content.
	 */
	readonly eventFormat: "ndjson" | "text";
	/**
	 * Host env vars to forward into the subprocess.
	 * Anything not listed here is NOT forwarded — same sandboxing model as
	 * the claude CLI adapter's ALLOWED_ENV_KEYS allowlist.
	 */
	readonly envAllowlist: readonly string[];
	/**
	 * The return-enforcement channel for this CLI adapter.
	 * Overrides the binary-derived default when set.
	 * Default derivation: "codex" → "settings-codex", "opencode" → "process-reengage", else "none".
	 *
	 */
	readonly returnEnforcementChannel?: ReturnEnforcementChannel;
	/**
	 * Per-session seed prompt mechanism for Codex.
	 * Codex `exec proceed --json` uses a hardcoded "proceed" prompt. When a session
	 * needs a per-session kickoff message (e.g. the forcing message on re-engage),
	 * this field declares the delivery mechanism:
	 *
	 * "positional" — appended as the last positional argument after the template `{{prompt}}`.
	 * Absent → no per-session prompt carrier (hardcoded only).
	 *
	 * @lore: seedPrompt — without it re-engage uses the hardcoded "proceed" prompt; the agent never receives the forcing message
	 */
	readonly seedPrompt?: "positional";
	/**
	 * claude-cli-adapter: Dialect tag for per-line event pre-mapping.
	 * When set to "claude-stream-json", parseStdoutLine translates each parsed
	 * object via preMapClaudeEvent before calling normalizeHarnessEvent.
	 * Absent ⇒ no pre-map (codex/opencode behavior unchanged).
	 */
	readonly eventDialect?: "claude-stream-json";
	/**
	 * Per-session MCP config file the binary reads to reach the HyperIdle bridge.
	 * Mirrors claude's .mcp.json. Absent ⇒ binary gets no MCP wiring (builtin/SDK paths).
	 *
	 * "codex-toml"   — appends [mcp_servers.hyperidle] to .codex-home/config.toml;
	 *                  token delivered via HYPERIDLE_MCP_TOKEN env var (outside allowlist).
	 * "opencode-json" — writes opencode.json to sandbox cwd; token inline in headers.
	 */
	readonly mcpConfig?:
		| { readonly dialect: "codex-toml" }
		| { readonly dialect: "opencode-json" }
		| { readonly dialect: "cursor-json" };
	/**
	 * Stderr lines matching any of these patterns are silently dropped (not yielded as
	 * error events). Use for known-benign, binary-specific informational stderr output
	 * that does NOT indicate a failure.
	 *
	 * @lore: codex-stderr-filter — codex emits "Reading additional input from stdin..." on startup even with closed stdin; without filter: CliStderr → crashed=true
	 */
	readonly stderrIgnorePatterns?: readonly RegExp[];
	/**
	 * Stdin delivery mode for this adapter.
	 *
	 * "json-stream" — stdin stays open after spawn; the first user prompt and
	 * any subsequent deliver() calls are written as JSON lines in the
	 * claude --input-format stream-json format. The binary exits when stdin
	 * is closed (triggered automatically after the result event).
	 *
	 * Absent — stdin is closed immediately after spawn (existing behaviour for
	 * codex/opencode/cursor-agent, which deliver the prompt via argv).
	 */
	readonly stdinDelivery?: "json-stream";
}

/** Injected dependencies (for testing). */
interface CliAdapterDeps {
	/** Defaults to node:child_process.spawn. Injected in tests. */
	readonly spawnFn?: typeof spawn;
	/** Return-enforcement registry. Injected so the adapter and boot share one instance. */
	readonly enforcement?: EnforcementRegistry;
	/**
	 * Sends a signal to a pid (or, negated, a whole process group). Defaults to
	 * node:process.kill. Injected in tests so a fake child's fabricated pid never
	 * reaches a real kill(2) syscall.
	 */
	readonly killFn?: (pid: number, signal: NodeJS.Signals) => void;
}

/** Injected dependencies for checkAvailability (for testing). */
interface CliAvailabilityDeps {
	/**
	 * Override the binary availability check. Defaults to `spawnSync("which", [binary])`.
	 * Injected in tests to avoid filesystem dependency.
	 */
	readonly whichFn?: (binary: string) => Promise<string>;
}

interface CliSession {
	/** The active child process. Replaced on process-reengage re-spawns. */
	child: ChildProcess;
	readonly sessionId: string;
	/**
	 * The real session UUID from SessionConfig.sessionId (not the
	 * internal cli-session-N id). Used to look up the enforcement registry for
	 * process-reengage re-spawn decisions.
	 */
	readonly configSessionId: string;
	done: boolean;
	exitCode: number | null;
	exitSignal: string | null;
	readonly stdoutLines: string[];
	readonly stderrLines: string[];
	notifyStream: (() => void) | null;
	resolveStop: ((result: SessionResult) => void) | null;
	killTimer: ReturnType<typeof setTimeout> | null;
	metricsProcessedLineCount: number;
	inputTokens: number;
	outputTokens: number;
	cachedInputTokens: number;
	cacheCreationInputTokens: number;
	reasoningOutputTokens: number;
	pendingInputTokens: number;
	pendingOutputTokens: number;
	pendingCachedInputTokens: number;
	pendingCacheCreationInputTokens: number;
	pendingReasoningOutputTokens: number;
	modelTurns: number;
	processStarts: number;
	toolCalls: number;
	completionEvents: number;
	durationMs?: number;
	apiDurationMs?: number;
	readonly modelTier: SessionConfig["modelTier"];
	/**
	 * True once a return action satisfying this session's
	 * `requiredReturnActions` (or, absent one, any return action) has been
	 * observed in the event stream.
	 */
	returnSeen: boolean;
	/** This session's required-return subset, threaded from `SessionConfig.requiredReturnActions` at spawn time. */
	readonly requiredReturnActions?: readonly string[];
	/**
	 * The sandbox path for process operations.
	 */
	readonly sandboxPath: string;
	/**
	 * The resolved env for the process (includes CODEX_HOME, etc).
	 */
	readonly spawnEnv: Record<string, string>;
	/**
	 * The harness's own native session id, captured from the event stream or
	 * assigned by us at start time (claude: --session-id). Set once the first
	 * relevant event arrives; undefined until then (or for harnesses that do not
	 * emit one before the session ends).
	 */
	nativeSessionId?: string;
	/**
	 * True while stdin is open for json-stream delivery. Set at spawn, cleared
	 * on the first result event (or process exit).
	 *
	 * @lore: stdinOpen — guards deliver() against a closed stream; cleared on result because a pre-result deliver is batched into that same turn
	 */
	stdinOpen: boolean;
}

/** Replace all template variables in a string. */
function resolveTemplates(template: string, vars: Record<TemplateVar, string>): string {
	let result = template;
	for (const [key, value] of Object.entries(vars) as [TemplateVar, string][]) {
		result = result.split(key).join(value);
	}
	return result;
}

/** Build the sandboxed environment from allowlist + resolved envMap. */
function buildSandboxedEnv(
	allowlist: readonly string[],
	resolvedEnvMap: Record<string, string>,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of allowlist) {
		const value = process.env[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}
	for (const [key, value] of Object.entries(resolvedEnvMap)) {
		env[key] = value;
	}
	return env;
}

let nextId = 1;

// ── Process-exit backstop ───────────────────────────────────────────────────
//
// @lore: process-exit backstop — detached:true = no terminal signals; shared "exit" SIGKILLs all session groups; registered once; no listener accumulation
//
const liveAdapters = new Set<CliHarnessAdapter>();
let exitHandlerRegistered = false;

/**
 * Stops (SIGKILLs the process group of) every still-running session across
 * every `CliHarnessAdapter` instance constructed in this process. This is
 * the exact sweep the shared `process.on("exit", ...)` handler below performs
 * — kept as a named, standalone, EXPORTED function for two reasons: a unit
 * test can call it directly, with an injected killFn, and assert on the
 * result without calling `process.exit()` or emitting "exit"; and a
 * live-harness integration test in another package (core-api) can call it
 * directly from its own `afterEach` as a "stop everything now" safety net —
 * a vitest test timeout skips a test's own `finally` block, but `afterEach`
 * still runs, and `dispose()`-ing the composition it built does not stop any
 * harness session that composition started. Re-exported from `test-utils.ts`.
 */
export function stopAllLiveHarnessSessions(): void {
	for (const adapter of liveAdapters) {
		adapter.killAllLiveSessionGroups();
	}
}

function registerExitHandlerOnce(): void {
	if (exitHandlerRegistered) return;
	exitHandlerRegistered = true;
	process.on("exit", stopAllLiveHarnessSessions);
}

/**
 * Derive the return-enforcement channel from the CLI binary name.
 * codex → settings-codex (writes .codex/hooks.json Stop hook before startSession)
 * unknown → none (drain-gate floor backstop only)
 *
 * @lore: codex hooks.json — Stop hook requires a trust marker or silently skipped; per-session prompt is the {{prompt}} slot in codex.args, a separate concern
 */
function deriveCliChannel(binary: string): ReturnEnforcementChannel {
	if (binary === "codex") return "settings-codex";
	if (binary === "claude") return "settings-claude";
	return "none";
}

/**
 * The harness family this CLI adapter is, derived from its binary — the same
 * shape as {@link deriveCliChannel} right above, and for the same reason: a CLI
 * adapter is configured by binary, not by a declared type field.
 *
 * Used to look up which per-model options this harness carries.
 */
function deriveHarnessType(binary: string): string {
	if (binary === "claude") return "claude-code";
	return binary;
}

function finiteNonNegative(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function recordTokenUsage(
	session: CliSession,
	usage: {
		inputTokens?: number;
		outputTokens?: number;
		cachedInputTokens?: number;
		cacheCreationInputTokens?: number;
		reasoningOutputTokens?: number;
	},
	opts?: { pending?: boolean },
): void {
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const cachedInputTokens = usage.cachedInputTokens ?? 0;
	const cacheCreationInputTokens = usage.cacheCreationInputTokens ?? 0;
	const reasoningOutputTokens = usage.reasoningOutputTokens ?? 0;

	session.inputTokens += inputTokens;
	session.outputTokens += outputTokens;
	session.cachedInputTokens += cachedInputTokens;
	session.cacheCreationInputTokens += cacheCreationInputTokens;
	session.reasoningOutputTokens += reasoningOutputTokens;

	if (opts?.pending) {
		session.pendingInputTokens += inputTokens;
		session.pendingOutputTokens += outputTokens;
		session.pendingCachedInputTokens += cachedInputTokens;
		session.pendingCacheCreationInputTokens += cacheCreationInputTokens;
		session.pendingReasoningOutputTokens += reasoningOutputTokens;
	}
}

function extractClaudeResultMetrics(obj: Record<string, unknown>): {
	durationMs?: number;
	apiDurationMs?: number;
	modelTurns?: number;
	inputTokens?: number;
	outputTokens?: number;
	cachedInputTokens?: number;
	cacheCreationInputTokens?: number;
} {
	const usage =
		obj.usage && typeof obj.usage === "object" ? (obj.usage as Record<string, unknown>) : {};
	// @lore: cursor-metrics — cursor-agent emits camelCase keys (inputTokens/outputTokens/cacheRead/cacheWrite) not snake_case; without mapping, 0 tokens reported
	return {
		durationMs: finiteNonNegative(obj.duration_ms),
		apiDurationMs: finiteNonNegative(obj.duration_api_ms),
		modelTurns: finiteNonNegative(obj.num_turns),
		inputTokens: finiteNonNegative(usage.input_tokens) ?? finiteNonNegative(usage.inputTokens),
		outputTokens: finiteNonNegative(usage.output_tokens) ?? finiteNonNegative(usage.outputTokens),
		cachedInputTokens:
			finiteNonNegative(usage.cache_read_input_tokens) ?? finiteNonNegative(usage.cacheReadTokens),
		cacheCreationInputTokens:
			finiteNonNegative(usage.cache_creation_input_tokens) ??
			finiteNonNegative(usage.cacheWriteTokens),
	};
}

function extractOpencodeStepMetrics(obj: Record<string, unknown>): {
	inputTokens?: number;
	outputTokens?: number;
	cachedInputTokens?: number;
	cacheCreationInputTokens?: number;
	reasoningOutputTokens?: number;
} {
	const part =
		obj.part && typeof obj.part === "object" ? (obj.part as Record<string, unknown>) : {};
	const tokens =
		part.tokens && typeof part.tokens === "object" ? (part.tokens as Record<string, unknown>) : {};
	const cache =
		tokens.cache && typeof tokens.cache === "object"
			? (tokens.cache as Record<string, unknown>)
			: {};
	return {
		inputTokens: finiteNonNegative(tokens.input),
		outputTokens: finiteNonNegative(tokens.output),
		cachedInputTokens: finiteNonNegative(cache.read),
		cacheCreationInputTokens: finiteNonNegative(cache.write),
		reasoningOutputTokens: finiteNonNegative(tokens.reasoning),
	};
}

export class CliHarnessAdapter implements HarnessAdapter {
	private readonly config: CliAdapterConfig;
	private readonly spawnFn: typeof spawn;
	private readonly enforcement: EnforcementRegistry;
	private readonly killFn: (pid: number, signal: NodeJS.Signals) => void;
	private readonly sessions = new Map<string, CliSession>();
	/**
	 * Persists harness-native session ids even after a session is removed
	 * from `sessions` by stopSession. Keyed by the adapter's internal sessionId.
	 * This lets the caller read the native id after the session has completed.
	 */
	private readonly nativeSessionIds = new Map<string, string>();

	constructor(config: CliAdapterConfig, deps?: CliAdapterDeps) {
		this.config = config;
		this.spawnFn = deps?.spawnFn ?? spawn;
		// Default: create an isolated registry. Production always injects the shared one.
		this.enforcement = deps?.enforcement ?? createIsolatedEnforcementRegistry();
		this.killFn = deps?.killFn ?? ((pid, signal) => process.kill(pid, signal));
		// Every instance registers itself with the single shared 'exit'
		// backstop above — see registerExitHandlerOnce for why this is shared,
		// not per-instance.
		liveAdapters.add(this);
		registerExitHandlerOnce();
	}

	/**
	 * Check if the CLI binary is available on the system PATH.
	 * Returns false instead of throwing — used at registration time to skip
	 * unavailable tools gracefully.
	 */
	static async checkAvailability(binary: string, deps?: CliAvailabilityDeps): Promise<boolean> {
		try {
			if (deps?.whichFn) {
				await deps.whichFn(binary);
				return true;
			}
			return binaryOnPath(binary);
		} catch {
			return false;
		}
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		// Build template variable map
		const promptSeed = config.instruction?.trim() || "proceed";
		const templateVars: Record<TemplateVar, string> = {
			"{{sandbox}}": config.sandboxPath,
			"{{model}}": config.selectedModel ?? "",
			"{{mcpUrl}}": config.mcpConnectionInfo?.url ?? "",
			"{{prompt}}": promptSeed,
		};

		// Resolve args
		let resolvedArgs = this.config.args.map((arg) => resolveTemplates(arg, templateVars));

		// @lore: conditional-model — {{model}} resolves to "" when none selected; --model "" causes codex 400 invalid_request_error; strip the --model+"" pair
		if (!templateVars["{{model}}"]) {
			const filtered: string[] = [];
			for (let j = 0; j < resolvedArgs.length; j++) {
				if (
					resolvedArgs[j] === "--model" &&
					j + 1 < resolvedArgs.length &&
					resolvedArgs[j + 1] === ""
				) {
					j++; // skip "--model" + "" pair
				} else {
					filtered.push(resolvedArgs[j] as string);
				}
			}
			resolvedArgs = filtered;
		}

		// The agent's configured options. Empty for an agent that has none.
		const optionArgv = modelOptionArgv(deriveHarnessType(this.config.binary), config.modelOptions);
		if (optionArgv.length > 0) resolvedArgs = [...resolvedArgs, ...optionArgv];

		// Resolve envMap
		const resolvedEnvMap: Record<string, string> = {};
		for (const [key, value] of Object.entries(this.config.envMap)) {
			resolvedEnvMap[key] = resolveTemplates(value, templateVars);
		}

		// @lore: no API key injection — harness authenticates itself; an injected key can shadow the person's existing login

		// ── Per-session CODEX_HOME injection.
		//
		// If the sandbox contains a .codex-home/ directory (written by provisionCodexHome),
		// set CODEX_HOME to point at it. This makes codex load hooks.json from the
		// per-session dir instead of ~/.codex/hooks.json.
		//
		// Also append --dangerously-bypass-hook-trust to args when CODEX_HOME is set
		// so codex runs the hook without prompting for user confirmation.
		//
		// @lore: CODEX_HOME — injected here, not in envAllowlist; per-session .codex-home/ contains auth.json + config.toml + hooks.json (no SQLite)
		const codexHomeDir = path.join(config.sandboxPath, ".codex-home");
		let extraArgs: string[] = [];
		if (this.config.binary === "codex" && fs.existsSync(codexHomeDir)) {
			resolvedEnvMap.CODEX_HOME = codexHomeDir;
			// --dangerously-bypass-hook-trust: bypass hash-check so hook runs without
			// requiring the user to have pre-approved the hook command.
			extraArgs = ["--dangerously-bypass-hook-trust"];
		}

		// ── Per-session opencode gate env injection.
		//
		// XDG_CONFIG_HOME isolates opencode's config dir so the return-signal plugin
		// in <sandbox>/.opencode/ loads while the user's global plugins do not.
		//
		if (this.config.binary === "opencode") {
			// Always inject XDG_CONFIG_HOME for opencode, so the user's global
			// ~/.config/opencode plugins and config cannot reach into the session.
			const xdgConfigDir = path.join(config.sandboxPath, ".hyperidle", "opencode-xdg-config");
			try {
				fs.mkdirSync(xdgConfigDir, { recursive: true });
				resolvedEnvMap.XDG_CONFIG_HOME = xdgConfigDir;
			} catch {
				// sandbox dir not yet created (test harness with fake path) — skip XDG isolation
			}
			// @lore: OPENCODE_PERMISSION — without it opencode asks before each tool call; non-TTY auto-rejects every tool; {"*":"allow"} grants non-interactive approval
			resolvedEnvMap.OPENCODE_PERMISSION = '{"*":"allow"}';
		}

		// ── Per-session MCP token env var injection.
		//
		// For codex, the MCP token is delivered via HYPERIDLE_MCP_TOKEN env var
		// (codex's bearer_token_env_var mechanism). It is injected OUTSIDE the
		// envAllowlist — the token is per-session-generated and NOT in process.env.
		// This mirrors the CODEX_HOME injection pattern above.
		//
		// @lore: inject-outside-allowlist — envAllowlist forwards from process.env; MCP token not there; mcpTokenEnv injects without polluting the allowlisted env
		if (config.mcpTokenEnv) {
			for (const [key, value] of Object.entries(config.mcpTokenEnv)) {
				resolvedEnvMap[key] = value;
			}
		}

		// ── claude session-id assignment.
		//
		// claude supports --session-id <uuid> which lets the caller NAME the session
		// rather than capturing an opaque id from the stream after the fact. We assign
		// a UUID here so that getNativeSessionId can return it immediately (before any
		// stream events arrive) and resumeSession can use it later.
		//
		let claudeAssignedSessionId: string | undefined;
		if (this.config.binary === "claude") {
			claudeAssignedSessionId = randomUUID();
			extraArgs = [...extraArgs, "--session-id", claudeAssignedSessionId];
		}

		const finalArgs = [...resolvedArgs, ...extraArgs];

		// Build sandboxed environment
		const sandboxedEnv = buildSandboxedEnv(this.config.envAllowlist, resolvedEnvMap);

		// Spawn the child process
		// @lore: args ARRAY form — security boundary; prevents shell injection; never use spawn(cmd, { shell: true })
		const child = this.spawnFn(this.config.binary, finalArgs, {
			cwd: config.sandboxPath,
			env: sandboxedEnv,
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
		});

		// @lore: cli-adapter-stdin — json-stream: stdin stays open for delivers; codex/opencode/cursor-agent: stdin closes at spawn, prompt via argv
		if (this.config.stdinDelivery !== "json-stream") {
			child.stdin?.end();
		}

		const sessionId = `cli-session-${nextId++}`;

		const session: CliSession = {
			child,
			sessionId,
			// store real config sessionId for registry lookup
			configSessionId: config.sessionId,
			done: false,
			exitCode: null,
			exitSignal: null,
			stdoutLines: [],
			stderrLines: [],
			notifyStream: null,
			resolveStop: null,
			killTimer: null,
			metricsProcessedLineCount: 0,
			inputTokens: 0,
			outputTokens: 0,
			cachedInputTokens: 0,
			cacheCreationInputTokens: 0,
			reasoningOutputTokens: 0,
			pendingInputTokens: 0,
			pendingOutputTokens: 0,
			pendingCachedInputTokens: 0,
			pendingCacheCreationInputTokens: 0,
			pendingReasoningOutputTokens: 0,
			modelTurns: 0,
			processStarts: 1,
			toolCalls: 0,
			completionEvents: 0,
			modelTier: config.modelTier,
			returnSeen: false,
			requiredReturnActions: config.requiredReturnActions,
			sandboxPath: config.sandboxPath,
			spawnEnv: sandboxedEnv,
			// for claude, we assigned this at start time; for all other harnesses
			// it is captured from the event stream (set in parseStdoutLine).
			nativeSessionId: claudeAssignedSessionId,
			stdinOpen: this.config.stdinDelivery === "json-stream",
		};

		this.sessions.set(sessionId, session);

		// For json-stream delivery: write the first user message as a JSON line now that
		// the session is registered. Stdin stays open for subsequent deliver() calls.
		if (this.config.stdinDelivery === "json-stream") {
			const promptText = config.instruction?.trim() ?? "proceed";
			const line = JSON.stringify({
				type: "user",
				message: { role: "user", content: [{ type: "text", text: promptText }] },
			});
			child.stdin?.write(`${line}\n`);
		}

		// for claude, persist the assigned id immediately so getNativeSessionId
		// works even after stopSession removes the session from `sessions`.
		if (claudeAssignedSessionId !== undefined) {
			this.nativeSessionIds.set(sessionId, claudeAssignedSessionId);
		}

		// Wire stdout line reader
		this.wireStdout(session);
		this.wireStderr(session);

		// Wire exit handler
		child.on("exit", (code, signal) => {
			// @lore: process stdout before buildResult — terminal result line's token/turn metrics must be captured into session before buildResult reads them
			for (let i = 0; i < session.stdoutLines.length; i++) {
				const bufferedLine = session.stdoutLines[i];
				if (bufferedLine !== undefined) {
					this.parseStdoutLine(bufferedLine, session, i);
				}
			}
			// Close stdin if still open (process exit is the final backstop).
			if (session.stdinOpen) {
				session.child.stdin?.end();
				session.stdinOpen = false;
			}
			session.exitCode = code;
			session.exitSignal = signal;
			session.done = true;
			if (session.killTimer) {
				clearTimeout(session.killTimer);
				session.killTimer = null;
			}
			session.notifyStream?.();
			const result = this.buildResult(session, code, signal);
			session.resolveStop?.(result);
		});

		// Catch ENOENT from spawn and produce a clear "binary not found" error.
		// @lore: ENOENT handling — when spawn fails, child.pid is undefined and 'error' fires on next tick; waiting avoids timer heuristics under vi.useFakeTimers()
		if (child.pid === undefined) {
			// pid is undefined — spawn failed; wait for the error event to arrive.
			await new Promise<void>((resolve, reject) => {
				const onError = (err: NodeJS.ErrnoException) => {
					child.off("exit", onExit);
					if (err.code === "ENOENT") {
						reject(
							new Error(
								`CliHarnessAdapter: binary not found — '${this.config.binary}' is not installed or not on PATH`,
							),
						);
					} else {
						reject(err);
					}
				};
				// Guard: if exit fires before error (e.g. tests), resolve cleanly
				const onExit = () => {
					child.off("error", onError);
					resolve();
				};
				child.once("error", onError);
				child.once("exit", onExit);
			});
		}
		// pid is defined — process spawned successfully. Resolve immediately.

		return { sessionId };
	}

	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent> {
		const adapter = this;
		const sessionId = handle.sessionId;

		return (async function* (): AsyncGenerator<HarnessEvent, void, unknown> {
			const session = adapter.sessions.get(sessionId);
			if (!session) return;

			let stdoutCursor = 0;
			let stderrCursor = 0;

			function waitForMore(): Promise<void> {
				return new Promise<void>((resolve) => {
					if (!session) {
						resolve();
						return;
					}
					session.notifyStream = () => {
						session.notifyStream = null;
						resolve();
					};
				});
			}

			while (true) {
				// Yield buffered stdout events
				while (stdoutCursor < session.stdoutLines.length) {
					const lineIndex = stdoutCursor;
					const line = session.stdoutLines[stdoutCursor++];
					if (line !== undefined) {
						yield adapter.parseStdoutLine(line, session, lineIndex);
					}
				}

				// Yield buffered stderr events
				while (stderrCursor < session.stderrLines.length) {
					const line = session.stderrLines[stderrCursor++];
					if (line !== undefined) {
						const ev: HarnessEvent = {
							type: "error",
							message: line,
							code: "CliStderr",
						};
						yield ev;
					}
				}

				if (
					session.done &&
					(session.pendingInputTokens > 0 ||
						session.pendingOutputTokens > 0 ||
						session.pendingCachedInputTokens > 0 ||
						session.pendingCacheCreationInputTokens > 0 ||
						session.pendingReasoningOutputTokens > 0)
				) {
					yield {
						type: "token_usage",
						inputTokens: session.pendingInputTokens,
						outputTokens: session.pendingOutputTokens,
						...(session.pendingCachedInputTokens > 0
							? { cachedInputTokens: session.pendingCachedInputTokens }
							: {}),
						...(session.pendingCacheCreationInputTokens > 0
							? { cacheCreationInputTokens: session.pendingCacheCreationInputTokens }
							: {}),
						...(session.pendingReasoningOutputTokens > 0
							? { reasoningOutputTokens: session.pendingReasoningOutputTokens }
							: {}),
						tier: session.modelTier,
					};
					session.pendingInputTokens = 0;
					session.pendingOutputTokens = 0;
					session.pendingCachedInputTokens = 0;
					session.pendingCacheCreationInputTokens = 0;
					session.pendingReasoningOutputTokens = 0;
				}

				if (session.done) {
					break;
				}

				await waitForMore();
			}
		})();
	}

	/**
	 * Signals the whole process group a session's child is the leader of — not
	 * just the child itself.
	 *
	 * @lore: process-group kill — child.kill() misses grandchildren; detached: true makes child the group leader; process.kill(-pid, signal) kills the whole group
	 *
	 * @lore: session.done branch — a grandchild can outlive its exited parent; done branch signals the group too; parent gone ≠ group empty
	 */
	private killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
		if (child.pid === undefined) {
			child.kill(signal);
			return;
		}
		try {
			this.killFn(-child.pid, signal);
		} catch {
			// ESRCH — the group is already gone (process exited between our done-check
			// and this call). Nothing left to signal.
		}
	}

	/**
	 * SIGKILLs every still-RUNNING session this adapter holds a live
	 * child for. Called by the shared process 'exit' handler above; also
	 * callable directly: the unit test calls `stopAllLiveHarnessSessions()`
	 * itself, with an injected killFn, and never emits "exit" on the real
	 * `process` (that would sweep every other test's adapter too).
	 *
	 * @lore: reused-pid gap — done entry stays in map unbounded; OS may recycle pid before sweep; signalling then SIGKILLs wrong process
	 * @lore: skip done entries here — done-branch's signal at stopSession (after drain) is the only kill; sweeping too risks hitting a recycled pid
	 */
	killAllLiveSessionGroups(): void {
		for (const session of this.sessions.values()) {
			if (session.done) continue;
			// A session whose child never got a pid (spawn failed before or during
			// ENOENT handling) has no process group to signal — skip it rather than
			// fall into killProcessGroup's single-child fallback, which assumes a
			// real ChildProcess with a working `.kill`.
			if (session.child.pid !== undefined) {
				this.killProcessGroup(session.child, "SIGKILL");
			}
		}
	}

	// biome-ignore lint/suspicious/useAwait: killProcessGroup below can throw synchronously (its child.kill fallback); async is what turns that throw into a rejected promise for callers.
	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			return {
				outcome: "crashed",
				tokenUsage: { byTier: {} },
			};
		}

		if (session.done) {
			// @lore: done branch SIGKILLs immediately — CLI already exited; grandchild may still run; no live parent means SIGTERM buys nothing; ESRCH tolerated
			this.killProcessGroup(session.child, "SIGKILL");
			const result = this.buildResult(session, session.exitCode, session.exitSignal);
			this.sessions.delete(handle.sessionId);
			return result;
		}

		// Send SIGTERM first (graceful shutdown)
		this.killProcessGroup(session.child, "SIGTERM");

		// Escalate to SIGKILL after 5 seconds if process hasn't exited
		session.killTimer = setTimeout(() => {
			const s = this.sessions.get(handle.sessionId);
			if (s && !s.done) {
				this.killProcessGroup(s.child, "SIGKILL");
			}
		}, 5_000);

		return new Promise<SessionResult>((resolve) => {
			session.resolveStop = (result: SessionResult) => {
				this.sessions.delete(handle.sessionId);
				resolve(result);
			};
		});
	}

	getNativeSessionId(handle: SessionHandle): string | undefined {
		// Check the live session first (set during stream parsing or at start).
		// Fall back to the persistent map which survives stopSession.
		return (
			this.sessions.get(handle.sessionId)?.nativeSessionId ??
			this.nativeSessionIds.get(handle.sessionId)
		);
	}

	// biome-ignore lint/suspicious/useAwait: throws synchronously for an unsupported binary below; async is what turns that throw into a rejected promise for callers.
	async resumeSession(
		nativeSessionId: string,
		message: string,
		config: SessionResumeConfig,
	): Promise<SessionHandle> {
		const model = config.selectedModel ?? "";
		const sandboxPath = config.sandboxPath;

		let args: string[];
		const extraEnv: Record<string, string> = {};
		let extraArgs: string[] = [];

		switch (this.config.binary) {
			case "claude": {
				// claude -p <msg> --resume <uuid> [standard flags]
				// @lore: claude-resume — --resume takes uuid from --session-id at start; cwd must match original session; sessions are bound to their working directory
				args = [
					"-p",
					message,
					"--resume",
					nativeSessionId,
					"--output-format",
					"stream-json",
					"--verbose",
					...(model ? ["--model", model] : []),
					"--mcp-config",
					".mcp.json",
					"--strict-mcp-config",
					"--permission-mode",
					"bypassPermissions",
					"--settings",
					".claude/settings.json",
				];
				break;
			}
			case "codex": {
				// codex exec resume <thread-id> <msg> --json [--model <m>]
				// @lore: codex-resume — exec resume is a first-class subcommand; thread-id from thread.started; CODEX_HOME must point to per-session .codex-home/ for hooks+state
				// @lore: codex-sandbox-inherit — exec resume has no --sandbox flag; workspace-write inherited from original thread; flag is thread-scoped, not config-scoped
				args = [
					"exec",
					"resume",
					nativeSessionId,
					message,
					"--json",
					...(model ? ["--model", model] : []),
				];
				const codexHomeDir = path.join(sandboxPath, ".codex-home");
				if (fs.existsSync(codexHomeDir)) {
					extraEnv.CODEX_HOME = codexHomeDir;
					extraArgs = ["--dangerously-bypass-hook-trust"];
				}
				break;
			}
			case "cursor-agent": {
				// cursor-agent -p <msg> --print --output-format stream-json --model <m>
				//   --trust --approve-mcps --force --resume <chat-id>
				// @lore: cursor-agent-resume — --force required for headless resume; without it cursor-agent prompts interactively; cwd must match original session
				// @lore: cursor-agent-silent-fail — exits 0 on wrong/missing session id, echoing the id back; caller must verify prior context from the session's content
				args = [
					"-p",
					message,
					"--print",
					"--output-format",
					"stream-json",
					...(model ? ["--model", model] : []),
					"--trust",
					"--approve-mcps",
					"--force",
					"--resume",
					nativeSessionId,
				];
				break;
			}
			case "opencode": {
				// opencode run <msg> --dir <sandbox> --format json --pure [--model <m>]
				//   --session <id>
				// @lore: opencode-dir-pairing — --dir must match start-time usage; mixing (--dir at start, no --dir at resume) hangs forever with zero output
				args = [
					"run",
					message,
					"--dir",
					sandboxPath,
					"--format",
					"json",
					"--pure",
					...(model ? ["--model", model] : []),
					"--session",
					nativeSessionId,
				];
				break;
			}
			default:
				throw new Error(
					`CliHarnessAdapter.resumeSession: binary "${this.config.binary}" does not support session resumption`,
				);
		}

		if (config.mcpTokenEnv) {
			for (const [k, v] of Object.entries(config.mcpTokenEnv)) {
				extraEnv[k] = v;
			}
		}

		// ── Resolve envMap the same way startSession does.
		//
		// startSession builds resolvedEnvMap from this.config.envMap with template
		// vars resolved against the session's config. extraEnv entries override
		// (they are per-session specifics that
		// take precedence over the template).
		//
		// {{mcpUrl}} and {{prompt}} are not meaningful at resume time and resolve
		// to empty string, which is safe — neither appears in any production envMap.
		const resumeTemplateVars: Record<TemplateVar, string> = {
			"{{sandbox}}": config.sandboxPath,
			"{{model}}": config.selectedModel ?? "",
			"{{mcpUrl}}": "",
			"{{prompt}}": "",
		};
		const resolvedEnvMap: Record<string, string> = {};
		for (const [key, value] of Object.entries(this.config.envMap)) {
			resolvedEnvMap[key] = resolveTemplates(value, resumeTemplateVars);
		}
		// extraEnv (CODEX_HOME, mcpTokenEnv) takes precedence over the template-resolved
		// envMap entries — per-session specifics win over the credential template.
		for (const [k, v] of Object.entries(extraEnv)) {
			resolvedEnvMap[k] = v;
		}

		const finalArgs = [...args, ...extraArgs];
		const sandboxedEnv = buildSandboxedEnv(this.config.envAllowlist, resolvedEnvMap);

		const child = this.spawnFn(this.config.binary, finalArgs, {
			cwd: sandboxPath,
			env: sandboxedEnv,
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
		});
		child.stdin?.end();

		const sessionId = `cli-session-${nextId++}`;
		const session: CliSession = {
			child,
			sessionId,
			configSessionId: `resume:${nativeSessionId}`,
			done: false,
			exitCode: null,
			exitSignal: null,
			stdoutLines: [],
			stderrLines: [],
			notifyStream: null,
			resolveStop: null,
			killTimer: null,
			metricsProcessedLineCount: 0,
			inputTokens: 0,
			outputTokens: 0,
			cachedInputTokens: 0,
			cacheCreationInputTokens: 0,
			reasoningOutputTokens: 0,
			pendingInputTokens: 0,
			pendingOutputTokens: 0,
			pendingCachedInputTokens: 0,
			pendingCacheCreationInputTokens: 0,
			pendingReasoningOutputTokens: 0,
			modelTurns: 0,
			processStarts: 1,
			toolCalls: 0,
			completionEvents: 0,
			modelTier: config.modelTier,
			returnSeen: false,
			requiredReturnActions: undefined,
			sandboxPath,
			spawnEnv: sandboxedEnv,
			// Resume sessions use the same native id we resumed into.
			nativeSessionId,
			// Resume sessions never use json-stream delivery.
			stdinOpen: false,
		};

		this.sessions.set(sessionId, session);
		// Persist the native id so getNativeSessionId works after stopSession.
		this.nativeSessionIds.set(sessionId, nativeSessionId);
		this.wireStdout(session);
		this.wireStderr(session);

		child.on("exit", (code, signal) => {
			for (let i = 0; i < session.stdoutLines.length; i++) {
				const bufferedLine = session.stdoutLines[i];
				if (bufferedLine !== undefined) {
					this.parseStdoutLine(bufferedLine, session, i);
				}
			}
			session.exitCode = code;
			session.exitSignal = signal;
			session.done = true;
			if (session.killTimer) {
				clearTimeout(session.killTimer);
				session.killTimer = null;
			}
			session.notifyStream?.();
			const result = this.buildResult(session, code, signal);
			session.resolveStop?.(result);
		});

		return { sessionId };
	}

	deliver(handle: SessionHandle, text: string): Promise<"delivered" | "unsupported"> {
		if (this.config.stdinDelivery !== "json-stream") return Promise.resolve("unsupported");
		const session = this.sessions.get(handle.sessionId);
		if (!session?.stdinOpen || session.child.stdin?.destroyed)
			return Promise.resolve("unsupported");
		const line = JSON.stringify({
			type: "user",
			message: { role: "user", content: [{ type: "text", text }] },
		});
		session.child.stdin?.write(`${line}\n`);
		return Promise.resolve("delivered");
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false, // External CLI tools don't expose compaction signals
			subAgents: false, // External CLI tools manage their own sub-agents
			modelProviders: [], // CLI tool brings its own provider; selected by harnessType not provider
			// mcpSupport: true — CLI tools use MCP (via .mcp.json written to workspace) for HyperIdle tool calling.
			mcpSupport: true,
			// Channel is explicit in config, or derived from binary name.
			// codex → settings-codex (writes .codex/hooks.json Stop hook)
			// opencode → process-reengage (opencode plugin + re-spawn wrapper)
			// unknown → none (drain-gate floor backstop only)
			returnEnforcement:
				this.config.returnEnforcementChannel ?? deriveCliChannel(this.config.binary),
			// Expose the MCP config dialect so session-provisioning can
			// call writeCliMcpConfig with the right dialect. Absent if no mcpConfig set.
			...(this.config.mcpConfig ? { cliMcpDialect: this.config.mcpConfig.dialect } : {}),
		};
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private parseStdoutLine(line: string, session?: CliSession, lineIndex?: number): HarnessEvent {
		if (this.config.eventFormat === "text") {
			if (session) session.completionEvents++;
			return { type: "completion", text: line };
		}

		// ndjson mode: try to parse as HarnessEvent
		try {
			const parsed: unknown = JSON.parse(line);
			if (
				parsed !== null &&
				typeof parsed === "object" &&
				"type" in parsed &&
				typeof (parsed as Record<string, unknown>).type === "string"
			) {
				const obj = parsed as Record<string, unknown>;

				// ── native session id capture per harness dialect.
				//
				// Extract the harness's own session id from the first relevant event so that
				// getNativeSessionId() can return it after streaming has started.
				//
				// codex:        thread.started carries thread_id (dot-namespaced, unique to codex)
				// cursor-agent: system/init carries session_id (system+session_id combo only
				//               on cursor-agent; claude emits system but never session_id)
				// opencode:     every event carries sessionID (capital D, opencode-specific field)
				// claude:       id was assigned by us at startSession time — not set here.
				if (session && !session.nativeSessionId) {
					let capturedId: string | undefined;
					if (obj.type === "thread.started" && typeof obj.thread_id === "string") {
						// codex — thread.started is the session-init lifecycle event
						capturedId = obj.thread_id;
					} else if (
						obj.type === "system" &&
						typeof obj.session_id === "string" &&
						this.config.binary === "cursor-agent"
					) {
						// cursor-agent — system/init line; guard on binary to avoid claude system events
						capturedId = obj.session_id;
					} else if (typeof obj.sessionID === "string" && this.config.binary === "opencode") {
						// opencode — all events carry sessionID; guard on binary for safety
						capturedId = obj.sessionID;
					}
					if (capturedId !== undefined) {
						session.nativeSessionId = capturedId;
						// Write to the persistent map so the id survives stopSession.
						this.nativeSessionIds.set(session.sessionId, capturedId);
					}
				}

				const shouldRecordMetrics =
					session !== undefined &&
					(lineIndex === undefined || lineIndex >= session.metricsProcessedLineCount);

				// @lore: result-line metrics capture — runs on original object before dialect pre-map; "result" type and fields present on raw claude stream-json
				if (obj.type === "result" && session && shouldRecordMetrics) {
					const metrics = extractClaudeResultMetrics(obj);
					session.durationMs = metrics.durationMs ?? session.durationMs;
					session.apiDurationMs = metrics.apiDurationMs ?? session.apiDurationMs;
					session.modelTurns = metrics.modelTurns ?? session.modelTurns;
					recordTokenUsage(
						session,
						{
							inputTokens: metrics.inputTokens,
							outputTokens: metrics.outputTokens,
							cachedInputTokens: metrics.cachedInputTokens,
							cacheCreationInputTokens: metrics.cacheCreationInputTokens,
						},
						{ pending: true },
					);
					// @lore: json-stream stdin close — unconditional on result; pre-result deliver batches into that turn; post-result returns "unsupported" and falls back to queue
					if (session.stdinOpen) {
						session.child.stdin?.end();
						session.stdinOpen = false;
					}
				}

				if (obj.type === "step_finish" && session && shouldRecordMetrics) {
					const metrics = extractOpencodeStepMetrics(obj);
					session.modelTurns++;
					recordTokenUsage(
						session,
						{
							inputTokens: metrics.inputTokens,
							outputTokens: metrics.outputTokens,
							cachedInputTokens: metrics.cachedInputTokens,
							cacheCreationInputTokens: metrics.cacheCreationInputTokens,
							reasoningOutputTokens: metrics.reasoningOutputTokens,
						},
						{ pending: true },
					);
				}

				// claude-cli-adapter: Apply dialect pre-map if configured.
				// preMapClaudeEvent translates claude stream-json types (assistant/result/system)
				// to canonical HarnessEvent types before normalization.
				const toNormalize =
					this.config.eventDialect === "claude-stream-json" ? preMapClaudeEvent(parsed) : parsed;

				const event = normalizeHarnessEvent(toNormalize);

				if (session && shouldRecordMetrics) {
					if (event.type === "token_usage") {
						recordTokenUsage(session, {
							inputTokens: event.inputTokens,
							outputTokens: event.outputTokens,
							cachedInputTokens: event.cachedInputTokens,
							cacheCreationInputTokens: event.cacheCreationInputTokens,
							reasoningOutputTokens: event.reasoningOutputTokens,
						});
						if (obj.type === "turn.completed") {
							session.modelTurns++;
						}
					} else if (event.type === "tool_call") {
						session.toolCalls++;
					} else if (event.type === "completion") {
						session.completionEvents++;
					}
					if (lineIndex !== undefined) {
						session.metricsProcessedLineCount = Math.max(
							session.metricsProcessedLineCount,
							lineIndex + 1,
						);
					}
				}

				// track return actions for process-reengage decisions.
				// When the agent calls a return action satisfying this session's
				// required subset, mark returnSeen so
				// we skip re-engage on process exit.
				if (
					session &&
					event.type === "tool_call" &&
					isRequiredReturnAction(event.toolName, session.requiredReturnActions)
				) {
					session.returnSeen = true;
				}

				return event;
			}
		} catch {
			// Fall through to completion event
		}

		if (session) session.completionEvents++;
		return { type: "completion", text: line };
	}

	private buildResult(
		session: CliSession,
		code: number | null,
		signal: string | null,
	): SessionResult {
		let outcome: SessionResult["outcome"];
		if (signal !== null) {
			outcome = "stopped";
		} else if (code === 0) {
			outcome = "completed";
		} else {
			outcome = "crashed";
		}
		const tokenUsage =
			session && (session.inputTokens > 0 || session.outputTokens > 0)
				? {
						byTier: {
							[session.modelTier]: {
								prompt: session.inputTokens,
								completion: session.outputTokens,
								...(session.cachedInputTokens > 0
									? { cachedPrompt: session.cachedInputTokens }
									: {}),
							},
						},
					}
				: { byTier: {} };
		const metrics: SessionMetrics | undefined = session
			? {
					modelTurns: session.modelTurns,
					processStarts: session.processStarts,
					toolCalls: session.toolCalls,
					completionEvents: session.completionEvents,
					inputTokens: session.inputTokens,
					outputTokens: session.outputTokens,
					cachedInputTokens: session.cachedInputTokens,
					cacheCreationInputTokens: session.cacheCreationInputTokens,
					reasoningOutputTokens: session.reasoningOutputTokens,
					...(session.durationMs !== undefined ? { durationMs: session.durationMs } : {}),
					...(session.apiDurationMs !== undefined ? { apiDurationMs: session.apiDurationMs } : {}),
				}
			: undefined;
		return {
			outcome,
			tokenUsage,
			...(metrics ? { metrics } : {}),
		};
	}

	private wireStdout(session: CliSession): void {
		let buffer = "";

		session.child.stdout?.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			// The last element is either empty (clean newline) or a partial line
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.length > 0) {
					session.stdoutLines.push(line);
					session.notifyStream?.();
				}
			}
		});

		session.child.stdout?.on("end", () => {
			// Flush any remaining partial line
			if (buffer.length > 0) {
				session.stdoutLines.push(buffer);
				buffer = "";
				session.notifyStream?.();
			}
		});
	}

	private wireStderr(session: CliSession): void {
		let buffer = "";
		const ignorePatterns = this.config.stderrIgnorePatterns;

		session.child.stderr?.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.length > 0) {
					// Drop known-benign informational lines before they become error events.
					if (ignorePatterns?.some((re) => re.test(line))) continue;
					session.stderrLines.push(line);
					session.notifyStream?.();
				}
			}
		});

		session.child.stderr?.on("end", () => {
			if (buffer.length > 0) {
				// Apply filter to the final buffered fragment as well.
				if (!ignorePatterns?.some((re) => re.test(buffer))) {
					session.stderrLines.push(buffer);
				}
				buffer = "";
				session.notifyStream?.();
			}
		});
	}
}
