/**
 * X5: CliHarnessAdapter — spawns an external CLI tool as a child process and
 * translates its stdout into HarnessEvents.
 *
 * Supports any tool that can be invoked as a subprocess. Each CLI tool is
 * registered as its own adapter instance in the pool with its own harnessType
 * (e.g. "codex", "opencode").
 *
 * @lore X5 W1: spawn() is called with the args ARRAY form, never a shell string.
 * This is the critical security boundary: array form prevents shell injection
 * because the OS execvp() call receives arguments verbatim without any
 * shell-level interpolation. Never change this to spawn(cmd, { shell: true })
 * — that would allow an attacker who controls workspace path or model name to
 * inject shell commands.
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
import {
	isRequiredReturnAction,
	MAX_FORCE_RETURNS,
	opencodeToolName,
	shouldForceReturn,
} from "@hyperidle/harness-protocol";
import type { EnforcementRegistry } from "./enforcement-registry.js";
import { normalizeHarnessEvent, preMapClaudeEvent } from "./harness-event-normalization.js";
import { modelOptionArgv } from "./model-options.js";
import { createReturnEnforcement } from "./return-enforcement.js";

/** Used when no enforcement is injected (tests that don't care about the registry). */
function createIsolatedEnforcementRegistry(): EnforcementRegistry {
	return createReturnEnforcement();
}

/**
 * @lore claude-cli-adapter: Claude return enforcement is the `settings-claude`
 * Stop hook (writes .claude/settings.json + return-check.sh) — NOT stream
 * return-detection. The process does not emit a sentinel line that signals
 * completion; the Stop hook fires inside the claude subprocess before it exits.
 * The preMapClaudeEvent pre-map is applied per-line in parseStdoutLine only when
 * eventDialect === "claude-stream-json". It is best-effort one-event-per-line:
 * multi-block assistant messages keep the first tool_use block; else the first
 * text block; else an empty completion event. Applied explicitly here — NOT
 * inside normalizeHarnessEvent — so codex/opencode adapters are unaffected.
 */

/**
 * Template variable names used in args and envMap.
 * @lore AK1: {{workspace}} renamed to {{sandbox}} in AK1 harness-vocab rename.
 * @lore {{prompt}} added for per-session seed prompt carrier (codex exec).
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
	// @lore Two fields stood here: `credentialEnvByProvider`, which put a stored
	// API key into the subprocess under its own provider's variable name, and
	// `customEndpointProvider`, which declared a brought OpenAI-compatible
	// endpoint in the harness's own config file. Both existed so someone could
	// bring a key and have a harness run on it. That is not a thing any more —
	// the harness is what you bring, and the key lives in its own login. HyperIdle
	// stores no model credential, so there is nothing left to inject.

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
	 * @lore Per-binary channel is declared here so
	 * provisionReturnHook can dispatch correctly without coupling to binary names.
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
	 * @lore Without this field, re-engage runs use the same generic
	 * "proceed" prompt regardless of the forcing message — the agent never sees the
	 * "you must return" instruction on re-engage.
	 *
	 * @lore cli-adapter-stdin: "stdin" was removed from this union. The adapter closes
	 * stdin immediately after spawn (child.stdin?.end()) to prevent codex/opencode from
	 * blocking on stdin EOF. No production config ever set seedPrompt:"stdin" and there
	 * is no code that writes to child.stdin. A future stdin carrier would require a
	 * conditional skip of the stdin-close.
	 */
	readonly seedPrompt?: "positional";
	/**
	 * Per-session re-engage carrier for OpenCode.
	 * OpenCode `--dir <sandbox>` does not accept a per-session prompt. On re-engage
	 * (process-reengage channel), this field declares how the forcing message is
	 * delivered to the re-invoked process.
	 *
	 * "run-arg" — pass the forcing message as a positional argument to `opencode run <msg>`.
	 * Absent → re-engage uses the sandbox instruction file only.
	 *
	 * @lore cli-adapter-stdin: "stdin" was removed from this union. stdin is closed
	 * immediately after spawn to prevent blocking on stdin EOF. No production config
	 * ever set reEngageCarrier:"stdin" and no code writes to child.stdin.
	 */
	readonly reEngageCarrier?: "run-arg";
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
	 *
	 * @lore AL7 mcpConfig: The dialect knowledge lives entirely in writeCliMcpConfig
	 * (cli-mcp-config.ts). CLI_TOOL_CONFIGS declares the dialect; session-provisioning
	 * calls writeCliMcpConfig. No per-backend branching in the router/registry.
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
	 * @lore AR2 codex-stderr-filter: codex always emits "Reading additional input from
	 * stdin..." to stderr on startup, even when stdin is closed immediately. Without this
	 * filter, that line becomes { type: "error", code: "CliStderr" } → provisionSession
	 * sets crashed=true on the first event. Verified codex-cli 0.141.x: the message is
	 * purely informational (codex still runs the LLM turn and exits 0); only the stderr
	 * line causes the false crash.
	 */
	readonly stderrIgnorePatterns?: readonly RegExp[];
}

/** Injected dependencies (for testing). */
interface CliAdapterDeps {
	/** Defaults to node:child_process.spawn. Injected in tests. */
	readonly spawnFn?: typeof spawn;
	/** Return-enforcement registry. Injected so the adapter and boot share one instance. */
	readonly enforcement?: EnforcementRegistry;
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
	 * observed in the event stream. Used to skip re-engage when the agent
	 * already returned voluntarily.
	 *
	 * Must be REQUIRED-SET-aware, not plain
	 * membership — `isReturnAction` alone let a session with a specific
	 * required action (e.g. the assistant's `["reply"]`) mark itself
	 * "returned" by calling an unrelated member (`send_message`), which
	 * short-circuits the `isReEngage && !session.returnSeen` pre-check below
	 * BEFORE it ever reaches the registry's own required-subset-aware
	 * `shouldForceReturn` — silently skipping the force this session actually
	 * needs. Dormant through Phase A (no request set `requiredReturnActions`
	 * yet); the assistant landing on the shared poller (Increment 6) makes it
	 * live for the first time.
	 */
	returnSeen: boolean;
	/**
	 * This session's required-return subset,
	 * threaded from `SessionConfig.requiredReturnActions` at spawn time so
	 * `returnSeen` tracking (and any future re-engage spawn) can stay
	 * required-set-aware without re-reading the original `SessionConfig`.
	 */
	readonly requiredReturnActions?: readonly string[];
	/**
	 * Number of process-reengage re-spawns for this session.
	 * Bounded by MAX_FORCE_RETURNS. Prevents infinite re-engage loops.
	 */
	reEngageCount: number;
	/**
	 * The sandbox path for re-spawn (needed to spawn additional
	 * processes in the same workspace).
	 */
	readonly sandboxPath: string;
	/**
	 * The reEngageCarrier config from the adapter, threaded here
	 * so streamEvents can spawn additional processes without accessing this.config.
	 */
	readonly reEngageCarrier?: "run-arg";
	/**
	 * The resolved env for the process (includes CODEX_HOME, etc).
	 * Reused for re-engage spawns.
	 */
	readonly spawnEnv: Record<string, string>;
	/**
	 * The resolved model string (e.g. "openrouter/~anthropic/claude-haiku-latest")
	 * stored at session start so re-engage spawns can pass --model correctly.
	 * Required for opencode "run-arg" carrier: `opencode run <msg> --format json --model <model>`.
	 *
	 * @lore Opencode re-engage model: The re-engage spawn cannot re-resolve templates
	 * (no config object available in streamEvents). Storing the resolved model here avoids
	 * the need to thread SessionConfig through streamEvents.
	 */
	readonly reEngageResolvedModel?: string;
	/**
	 * The agent's configured option args, kept so a re-engage rebuilds the same
	 * invocation. The re-engage path constructs argv from scratch rather than
	 * reusing the start args, so without this the agent's options would silently
	 * disappear part-way through a session.
	 */
	readonly reEngageOptionArgv: readonly string[];
	/**
	 * The harness's own native session id, captured from the event stream or
	 * assigned by us at start time (claude: --session-id). Set once the first
	 * relevant event arrives; undefined until then (or for harnesses that do not
	 * emit one before the session ends).
	 *
	 * @lore BA2: This is the handle that makes resumption possible. For claude we
	 * assign it via --session-id at start time. For codex, cursor-agent, and
	 * opencode we extract it from the first relevant event (thread.started,
	 * system/init, any-event.sessionID respectively).
	 */
	nativeSessionId?: string;
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

/**
 * Derive the return-enforcement channel from the CLI binary name.
 * codex → settings-codex (writes .codex/hooks.json Stop hook before startSession)
 * opencode → process-reengage (.opencode/plugins/return-signal.ts + re-spawn wrapper)
 * unknown → none (drain-gate floor backstop only)
 *
 * @lore Codex has a hooks.json mechanism (Stop hook). Without a trust
 * marker the hook is silently skipped (WARN-F1). Per-session prompt carrier is a
 * separate concern (tracked in CLI_TOOL_CONFIGS.codex.args — the {{prompt}} slot).
 */
function deriveCliChannel(binary: string): ReturnEnforcementChannel {
	if (binary === "codex") return "settings-codex";
	if (binary === "opencode") return "process-reengage";
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
	// @lore BA2 cursor-metrics: cursor-agent is configured with the same
	// eventDialect: "claude-stream-json" as claude (it advertises a
	// claude-compatible `--output-format stream-json`), and its terminal
	// `result` line does carry a `usage` object — but with CAMELCASE keys
	// (`inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheWriteTokens`),
	// not claude's native snake_case. Proven against the installed binary
	// (2026.08.25-3e8eec8): a real run reported
	// `"usage":{"inputTokens":4,"outputTokens":759,"cacheReadTokens":61008,
	// "cacheWriteTokens":9070}`. Without this fallback every cursor-agent
	// session silently reports 0 input/output tokens regardless of real
	// spend — the exact thing that made a real, reasoned model refusal look
	// like "the prompt never arrived" in a resumed-session investigation.
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
		// @lore BA10: {{prompt}} is the session's opening user turn — what the agent
		// is being ASKED to do — and it is delivered whole. `assembledPrompt` is
		// context and goes to AGENTS.md; it is not an instruction and is no longer
		// used as one. This used to be `assembledPrompt.slice(0, 200)` with newlines
		// flattened, and a real agent replied "your initial message appears to have
		// been cut off". "proceed" remains the default for a session with nothing to
		// ask — a subscription waking on a heartbeat has no instruction of its own.
		const promptSeed = config.instruction?.trim() || "proceed";
		const templateVars: Record<TemplateVar, string> = {
			"{{sandbox}}": config.sandboxPath,
			// The agent's own choice, and nothing else. A fallback to the model
			// gateway's answer used to sit here, and on a subscription-authenticated
			// machine it was absent — which is how the person's chosen model got
			// silently discarded.
			"{{model}}": config.selectedModel ?? "",
			"{{mcpUrl}}": config.mcpConnectionInfo?.url ?? "",
			"{{prompt}}": promptSeed,
		};

		// Resolve args
		let resolvedArgs = this.config.args.map((arg) => resolveTemplates(arg, templateVars));

		// @lore AR4 WARNING-D1 conditional-model: When the agent named no model, the
		// {{model}} template resolves to "". Passing --model "" to codex sends an empty string
		// to the OpenAI API → 400 invalid_request_error. Before AR4 codex had no --model flag
		// and used its CLI default. Preserve pre-AR4 behavior: drop --model + the following
		// empty-string arg when the resolved model is empty. Only --model flag pairs are
		// stripped (not arbitrary empty args) — the flag name is the sentinel.
		// The non-empty path is unchanged: --model gpt-5.4-mini is injected as before.
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

		// The agent's configured options. Empty for an agent that has none, so its
		// invocation stays character-for-character what it was before options existed.
		const optionArgv = modelOptionArgv(deriveHarnessType(this.config.binary), config.modelOptions);
		if (optionArgv.length > 0) resolvedArgs = [...resolvedArgs, ...optionArgv];

		// Resolve envMap
		const resolvedEnvMap: Record<string, string> = {};
		for (const [key, value] of Object.entries(this.config.envMap)) {
			resolvedEnvMap[key] = resolveTemplates(value, templateVars);
		}

		// @lore No API key is injected into a harness, ever. Two blocks stood here —
		// one putting a stored key under its provider's variable name, one writing a
		// brought endpoint into the harness's own config file. A harness
		// authenticates itself, and an injected key can shadow the login the person
		// already has rather than help it.

		// ── Per-session CODEX_HOME injection.
		//
		// If the sandbox contains a .codex-home/ directory (written by provisionCodexHome),
		// set CODEX_HOME to point at it. This makes codex load hooks.json from the
		// per-session dir instead of ~/.codex/hooks.json.
		//
		// Also append --dangerously-bypass-hook-trust to args when CODEX_HOME is set
		// so codex runs the hook without prompting for user confirmation.
		//
		// @lore CODEX_HOME must NOT be in envAllowlist (it is
		// injected here, not forwarded from process.env). The per-session .codex-home/
		// dir contains only auth.json + config.toml (no SQLite) + hooks.json.
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
		// Replaces the removed --pure flag (which also disabled the sandbox plugin).
		//
		// @lore BA2: CODEX_HOME injection pattern; neither var is in envAllowlist.
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
			// @lore BA2: OPENCODE_PERMISSION is unconditional now. It used to be read
			// from `.hyperidle/opencode-permission.json` when the interception
			// installer had written one, falling back to allow-all when it had not.
			// That installer is deleted, so nothing ever wrote the file and the read
			// always threw into the fallback — a branch that could not be taken,
			// reading a path nothing produces. The fallback was always the real
			// behaviour, so it is the only behaviour.
			//
			// It is required even though nothing is being gated: without it opencode
			// asks the user before each tool call, and in a non-interactive spawned
			// process (no TTY) that auto-REJECTS every tool — write and read fail with
			// "The user rejected permission to use this specific tool call." Verified
			// 2026-09-01: {} also rejects; {"*":"allow"} grants non-interactive
			// auto-approval.
			resolvedEnvMap.OPENCODE_PERMISSION = '{"*":"allow"}';
		}

		// ── Per-session MCP token env var injection.
		//
		// For codex, the MCP token is delivered via HYPERIDLE_MCP_TOKEN env var
		// (codex's bearer_token_env_var mechanism). It is injected OUTSIDE the
		// envAllowlist — the token is per-session-generated and NOT in process.env.
		// This mirrors the CODEX_HOME injection pattern above.
		//
		// @lore AL7 N6: inject-outside-allowlist is non-optional. The allowlist
		// forwards from process.env; the MCP token is not there. Caller-provided
		// mcpTokenEnv overrides (and does not pollute) the allowlisted env.
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
		// @lore BA2 claude-session-id: Assigning rather than capturing is strictly simpler
		// — no stream-parsing needed, id available at startSession return time. The UUID
		// must be unique per session; randomUUID() guarantees this.
		let claudeAssignedSessionId: string | undefined;
		if (this.config.binary === "claude") {
			claudeAssignedSessionId = randomUUID();
			extraArgs = [...extraArgs, "--session-id", claudeAssignedSessionId];
		}

		const finalArgs = [...resolvedArgs, ...extraArgs];

		// Build sandboxed environment
		const sandboxedEnv = buildSandboxedEnv(this.config.envAllowlist, resolvedEnvMap);

		// Spawn the child process
		// @lore X5 W1: args ARRAY form is the security boundary — no shell: true
		const child = this.spawnFn(this.config.binary, finalArgs, {
			cwd: config.sandboxPath,
			env: sandboxedEnv,
			stdio: ["pipe", "pipe", "pipe"],
		});

		// @lore cli-adapter-stdin: Close stdin immediately after spawn.
		// The adapter delivers the prompt via argv (positional {{prompt}} for codex/opencode,
		// -p for claude) — NEVER via stdin. Leaving stdin open causes `codex exec` to block
		// on "Reading additional input from stdin..." waiting for EOF before it runs the LLM
		// turn. Closing immediately is safe for all supported binaries: claude uses -p (positional),
		// opencode uses `run` (positional), codex uses `exec <prompt>` (positional). None read
		// stdin. Proven via the real-binary adapter test (cli-adapter-real-binary.integration.test.ts).
		// Optional-chain: the mock spawnFn in unit tests returns a ChildProcess without .stdin.
		child.stdin?.end();

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
			reEngageCount: 0,
			sandboxPath: config.sandboxPath,
			reEngageCarrier: this.config.reEngageCarrier,
			spawnEnv: sandboxedEnv,
			// store resolved model for re-engage spawn (opencode --model flag).
			reEngageResolvedModel: config.selectedModel,
			reEngageOptionArgv: optionArgv,
			// for claude, we assigned this at start time; for all other harnesses
			// it is captured from the event stream (set in parseStdoutLine).
			nativeSessionId: claudeAssignedSessionId,
		};

		this.sessions.set(sessionId, session);

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
			// @lore AF10: process all remaining stdout lines before building the
			// result so that any terminal result line's token/turn metrics are
			// captured into the session BEFORE buildResult reads them.
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

		// W2: Catch ENOENT from spawn and produce a clear "binary not found" error.
		//
		// @lore X5 W2: In real Node.js, when spawn fails with ENOENT the child's
		// pid is undefined and an 'error' event fires on the next tick. We check
		// pid: undefined means spawn failed so we wait for the error event. When
		// pid is defined the process started successfully and we resolve immediately.
		// This avoids any timer-based heuristics that break under vi.useFakeTimers().
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

		// biome-ignore lint/suspicious/useAwait: async generator requires async keyword
		return (async function* (): AsyncGenerator<HarnessEvent, void, unknown> {
			const session = adapter.sessions.get(sessionId);
			if (!session) return;

			// determine if this adapter uses process-reengage channel.
			const channel =
				adapter.config.returnEnforcementChannel ?? deriveCliChannel(adapter.config.binary);
			const isReEngage = channel === "process-reengage";

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
					// process-reengage — after first (or subsequent) process exits,
					// check if we need to re-engage the session with a forcing message.
					//
					// Decision logic:
					//   1. Only for process-reengage channel (opencode / remote).
					//   2. Only if returnSeen=false (agent did NOT call a return action).
					//   3. Ask the enforcement registry: if forceMessage is non-null, re-spawn.
					//   4. Bounded by reEngageCount < MAX_FORCE_RETURNS (guards infinite loops).
					//   5. reEngageCarrier="run-arg": append forceMessage as positional arg.
					//
					// @lore The re-engage spawns a NEW child process in the same
					// sandbox. The new process's stdout/stderr lines are appended to the same
					// session.stdoutLines / session.stderrLines arrays (via wireStdout/wireStderr
					// called on the new child). session.done is reset to false so the drain loop
					// continues. This gives the outer provisioner a single continuous event stream
					// with no visible seam between the initial run and re-engage runs.
					if (isReEngage && !session.returnSeen && session.reEngageCount < MAX_FORCE_RETURNS) {
						const registryEntry = adapter.enforcement.get(session.configSessionId);
						if (registryEntry) {
							// adjudicate from the registry's forceCount (single source).
							// Previously used session.reEngageCount which could diverge from the registry
							// if other paths also incremented forceCount. The registry is authoritative.
							// Narrow to the session's specific
							// required subset when the registered entry has one.
							// This branch is structurally
							// opencode-only (`isReEngage` ⟺ `channel === "process-reengage"`,
							// and only opencode's CLI_TOOL_CONFIGS entry sets that channel) —
							// `opencodeToolName` names the literal `hyperidle_<bare>` tool the
							// re-spawned opencode process actually exposes, instead of a bare
							// name it fails to resolve ("Model tried to call unavailable tool").
							const forceMsg = registryEntry.exempt
								? null
								: shouldForceReturn(
										registryEntry.gate,
										registryEntry.forceCount,
										registryEntry.requiredReturnActions,
										opencodeToolName,
									);

							if (forceMsg !== null) {
								// Increment the registry BEFORE spawning so drain-gate sees the force.
								adapter.enforcement.incrementForce(session.configSessionId);
								session.reEngageCount++;
								session.processStarts++;

								// Build re-engage args.
								//
								// @lore The previous approach stripped template vars with
								// `arg.replace(/\{\{[a-z]+\}\}/g, "")` and appended the forcing message.
								// For opencode (config.args = ["--dir", "{{sandbox}}"]) this produced
								// ["--dir", "", forceMsg] — broken: no "run" subcommand, empty --dir, and
								// the forcing message was a stray positional. We now build the correct
								// opencode headless invocation from scratch for "run-arg" carrier.
								//
								// Proven real invocation (real-harness-return-enforcement-realbinary.integration.test.ts):
								//   opencode run <forceMsg> --format json --pure --model <model>
								let finalReEngageArgs: string[];
								if (session.reEngageCarrier === "run-arg") {
									// "run-arg": opencode headless re-invoke with forcing message as first arg.
									// Build the canonical headless invocation: `opencode run <msg> --format json --pure [--model <model>]`
									// cwd is session.sandboxPath so --dir is not needed for re-engage.
									const runArgs: string[] = ["run", forceMsg, "--format", "json", "--pure"];
									if (session.reEngageResolvedModel) {
										runArgs.push("--model", session.reEngageResolvedModel);
									}
									runArgs.push(...session.reEngageOptionArgv);
									finalReEngageArgs = runArgs;
								} else {
									// No carrier configured — use the tailored forcing message
									// (was the static FORCE_RETURN_MESSAGE
									// constant; now the same `forceMsg` this session was just
									// adjudicated with, so a required session sees ITS message,
									// not the always-full-trio default).
									// Fall back to base args (stripped of unresolved template vars via exclusion
									// of any arg still containing "{{"). Empty-string args from stripping
									// are excluded to avoid passing spurious flags.
									const baseArgs = adapter.config.args
										.map((arg) => arg.replace(/\{\{[a-z]+\}\}/g, ""))
										.filter((arg) => arg.length > 0);
									// The agent's options belong on the re-engage invocation too — this
									// branch rebuilds argv from the base template, so they are not
									// carried over from the start args.
									finalReEngageArgs = [...baseArgs, ...session.reEngageOptionArgv, forceMsg];
								}

								// Spawn the re-engage child process.
								const reEngageChild = adapter.spawnFn(adapter.config.binary, finalReEngageArgs, {
									cwd: session.sandboxPath,
									env: session.spawnEnv,
									stdio: ["pipe", "pipe", "pipe"],
								});

								// @lore cli-adapter-stdin: Close stdin on re-engage spawns too.
								// Re-engage delivers the forcing message via positional arg ("run-arg" carrier).
								// The adapter never writes to stdin — stdin must be closed immediately to prevent
								// the same hang as the initial spawn (codex/opencode block on stdin EOF).
								reEngageChild.stdin?.end();

								// Reset session for the new child.
								// @lore We mutate the CliSession object to point at the
								// new child while keeping the same stdoutLines/stderrLines arrays.
								// This is safe because the old child has exited (session.done was true).
								session.child.removeAllListeners();
								session.child = reEngageChild;
								session.done = false;
								session.exitCode = null;
								session.exitSignal = null;

								// Wire the new child's stdout/stderr into the same arrays.
								adapter.wireStdout(session);
								adapter.wireStderr(session);

								// Wire exit for the new child.
								reEngageChild.on("exit", (code, signal) => {
									for (let i = stdoutCursor; i < session.stdoutLines.length; i++) {
										const bufferedLine = session.stdoutLines[i];
										if (bufferedLine !== undefined) {
											adapter.parseStdoutLine(bufferedLine, session, i);
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
									const result = adapter.buildResult(session, code, signal);
									session.resolveStop?.(result);
								});

								reEngageChild.on("error", () => {
									session.done = true;
									session.notifyStream?.();
								});

								// Continue the drain loop for the re-engage child.
								continue;
							}
						}
					}
					// No re-engage needed (or channel is not process-reengage).
					break;
				}

				await waitForMore();
			}
		})();
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			return {
				outcome: "crashed",
				tokenUsage: { byTier: {} },
			};
		}

		if (session.done) {
			const result = this.buildResult(session, session.exitCode, session.exitSignal);
			this.sessions.delete(handle.sessionId);
			return result;
		}

		// Send SIGTERM first (graceful shutdown)
		session.child.kill("SIGTERM");

		// Escalate to SIGKILL after 5 seconds if process hasn't exited
		// @lore X5 W1: SIGTERM -> 5s wait -> SIGKILL — graceful shutdown gives the process
		// time to flush output before the hard kill.
		session.killTimer = setTimeout(() => {
			const s = this.sessions.get(handle.sessionId);
			if (s && !s.done) {
				s.child.kill("SIGKILL");
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

	async resumeSession(
		nativeSessionId: string,
		message: string,
		config: SessionResumeConfig,
	): Promise<SessionHandle> {
		// @lore BA2: Per-harness resume invocations, measured against real installed
		// binaries. See harness-research/session-continuation.md for full evidence.
		const model = config.selectedModel ?? "";
		const sandboxPath = config.sandboxPath;

		let args: string[];
		const extraEnv: Record<string, string> = {};
		let extraArgs: string[] = [];

		switch (this.config.binary) {
			case "claude": {
				// claude -p <msg> --resume <uuid> [standard flags]
				// @lore BA2 claude-resume: --resume takes the uuid we assigned via
				// --session-id at start time. The sandbox (cwd) must be the same as the
				// original session — claude sessions are bound to their working directory.
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
				// @lore BA2 codex-resume: `exec resume` is a first-class subcommand;
				// thread-id is captured from thread.started at session start.
				// CODEX_HOME must point to the per-session .codex-home/ so the hook
				// runs on the resumed session too.
				//
				// @lore BA2 codex-sandbox-inherit: `exec resume` has no --sandbox flag.
				// The original thread's sandbox mode (workspace-write) is INHERITED by
				// the resumed session — codex stores it with the thread. Proved by running
				// a two-phase session (phase 1: exec --sandbox workspace-write, phase 2:
				// exec resume) and verifying the resumed turn could create new files in
				// the sandbox. This holds whether or not sandbox_mode appears in
				// config.toml — the flag is thread-scoped, not config-scoped.
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
				// @lore BA2 cursor-agent-resume: --force is required for headless resume;
				// without it cursor-agent prompts interactively. --resume targets the
				// specific chat by id. The sandbox (cwd) must match the original session.
				// @lore BA2 cursor-agent-silent-fail: cursor-agent exits 0 even on a
				// wrong or missing session id, echoing back the requested id. The caller
				// MUST verify prior context from the session's content.
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
				// @lore BA2 opencode-dir-pairing: --dir must be passed on resume and must
				// match whether --dir was passed at start time. Production always passes
				// --dir (adapter-pool.ts), so every resume must too. Mixing (--dir at start,
				// no --dir at resume, or vice versa) hangs forever with zero output.
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
		// vars resolved against the session's config. resumeSession was previously
		// passing only extraEnv (CODEX_HOME + mcpTokenEnv), silently dropping envMap
		// entries. extraEnv entries override (they are per-session specifics that
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
			reEngageCount: 0,
			sandboxPath,
			reEngageCarrier: this.config.reEngageCarrier,
			spawnEnv: sandboxedEnv,
			reEngageResolvedModel: model || undefined,
			reEngageOptionArgv: [],
			// Resume sessions use the same native id we resumed into.
			nativeSessionId,
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

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false, // External CLI tools don't expose compaction signals
			subAgents: false, // External CLI tools manage their own sub-agents
			modelProviders: [], // CLI tool brings its own provider; selected by harnessType not provider
			// X5: mcpSupport: true — CLI tools use MCP (via .mcp.json written to workspace)
			// for HyperIdle tool calling.
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

				// @lore AF10 (Z8-049/Z8-088): If this is a terminal result line from
				// the CLI, capture its turn/duration/token metrics. Metrics capture
				// runs on the ORIGINAL parsed object (before any dialect pre-map)
				// because the "result" type and its fields are present on the raw
				// claude stream-json line.
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
