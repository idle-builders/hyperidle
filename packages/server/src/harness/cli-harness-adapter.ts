/**
 * X5: CliHarnessAdapter — spawns an external CLI tool as a child process and
 * translates its stdout into HarnessEvents.
 *
 * Supports any tool that can be invoked as a subprocess. Each CLI tool is
 * registered as its own adapter instance in the pool with its own harnessType
 * (e.g. "aider", "goose", "opencode").
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
import * as fs from "node:fs";
import * as path from "node:path";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { normalizeHarnessEvent } from "@hyperidle/shared";

/**
 * Template variable names used in args and envMap.
 * @lore AK1: {{workspace}} renamed to {{sandbox}} in AK1 harness-vocab rename.
 */
type TemplateVar = "{{sandbox}}" | "{{model}}" | "{{apiKey}}" | "{{baseUrl}}" | "{{mcpUrl}}";

function isExecutableFile(filePath: string): boolean {
	try {
		fs.accessSync(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function binaryOnPath(binary: string): boolean {
	const pathEntries = process.env.PATH?.split(path.delimiter) ?? [];
	return pathEntries.some((entry) => isExecutableFile(path.join(entry, binary)));
}

export interface CliAdapterConfig {
	/** Executable name or absolute path. */
	readonly binary: string;
	/**
	 * CLI arguments with template variables:
	 * {{sandbox}}, {{model}}, {{apiKey}}, {{baseUrl}}, {{mcpUrl}}.
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
	 * ClaudeAgentSdkAdapter's ALLOWED_ENV_KEYS allowlist.
	 */
	readonly envAllowlist: readonly string[];
	/**
	 * @lore AF10 (Z8-049/Z8-088): The JSON field name on the CLI terminal result
	 * line that carries the total cost in USD. Defaults to "total_cost_usd" (the
	 * field the `claude` CLI uses, same as the SDK adapter at
	 * claude-agent-sdk-adapter.ts:287). Override for CLI tools that use a
	 * different field name — this makes version drift a one-line config change
	 * rather than a code change. Only a finite non-negative number is accepted;
	 * anything else is treated as missing (no cost_update emitted).
	 */
	readonly costField?: string;
}

/** Injected dependencies (for testing). */
export interface CliAdapterDeps {
	/** Defaults to node:child_process.spawn. Injected in tests. */
	readonly spawnFn?: typeof spawn;
}

/** Injected dependencies for checkAvailability (for testing). */
export interface CliAvailabilityDeps {
	/**
	 * Override the binary availability check. Defaults to `spawnSync("which", [binary])`.
	 * Injected in tests to avoid filesystem dependency.
	 */
	readonly whichFn?: (binary: string) => Promise<string>;
}

interface CliSession {
	readonly child: ChildProcess;
	readonly sessionId: string;
	done: boolean;
	exitCode: number | null;
	exitSignal: string | null;
	readonly stdoutLines: string[];
	readonly stderrLines: string[];
	notifyStream: (() => void) | null;
	resolveStop: ((result: SessionResult) => void) | null;
	killTimer: ReturnType<typeof setTimeout> | null;
	/**
	 * @lore AF10 (Z8-049): Total session cost in USD captured from the terminal
	 * result line (e.g. `{"type":"result","total_cost_usd":0.0123,...}`).
	 * Set by parseStdoutLine when the result line is detected.
	 * Emitted as a single terminal cost_update in streamEvents before break.
	 * Undefined until a result line with a valid cost field is seen.
	 */
	totalCostUsd?: number;
	/** True once the terminal cost_update has been yielded (prevents double-emit). */
	costEmitted: boolean;
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

export class CliHarnessAdapter implements HarnessAdapter {
	private readonly config: CliAdapterConfig;
	private readonly spawnFn: typeof spawn;
	private readonly sessions = new Map<string, CliSession>();

	constructor(config: CliAdapterConfig, deps?: CliAdapterDeps) {
		this.config = config;
		this.spawnFn = deps?.spawnFn ?? spawn;
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
		const templateVars: Record<TemplateVar, string> = {
			"{{sandbox}}": config.sandboxPath,
			"{{model}}": config.resolvedModel?.model ?? "",
			"{{apiKey}}": config.resolvedModel?.apiKey ?? "",
			"{{baseUrl}}": config.resolvedModel?.baseUrl ?? "",
			"{{mcpUrl}}": config.mcpConnectionInfo?.url ?? "",
		};

		// Resolve args
		const resolvedArgs = this.config.args.map((arg) => resolveTemplates(arg, templateVars));

		// Resolve envMap
		const resolvedEnvMap: Record<string, string> = {};
		for (const [key, value] of Object.entries(this.config.envMap)) {
			resolvedEnvMap[key] = resolveTemplates(value, templateVars);
		}

		// Build sandboxed environment
		const sandboxedEnv = buildSandboxedEnv(this.config.envAllowlist, resolvedEnvMap);

		// Spawn the child process
		// @lore X5 W1: args ARRAY form is the security boundary — no shell: true
		const child = this.spawnFn(this.config.binary, resolvedArgs, {
			cwd: config.sandboxPath,
			env: sandboxedEnv,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const sessionId = `cli-session-${nextId++}`;

		const session: CliSession = {
			child,
			sessionId,
			done: false,
			exitCode: null,
			exitSignal: null,
			stdoutLines: [],
			stderrLines: [],
			notifyStream: null,
			resolveStop: null,
			killTimer: null,
			costEmitted: false,
		};

		this.sessions.set(sessionId, session);

		// Wire stdout line reader
		this.wireStdout(session);
		this.wireStderr(session);

		// Wire exit handler
		child.on("exit", (code, signal) => {
			// @lore AF10: process all remaining stdout lines before building the
			// result so that any terminal result line (with total_cost_usd) is
			// captured into session.totalCostUsd BEFORE buildResult reads it.
			for (const bufferedLine of session.stdoutLines) {
				this.parseStdoutLine(bufferedLine, session);
			}
			session.exitCode = code;
			session.exitSignal = signal;
			session.done = true;
			if (session.killTimer) {
				clearTimeout(session.killTimer);
				session.killTimer = null;
			}
			session.notifyStream?.();
			const result = this.buildResult(code, signal, session.totalCostUsd);
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
					const line = session.stdoutLines[stdoutCursor++];
					if (line !== undefined) {
						yield adapter.parseStdoutLine(line, session);
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

				// @lore AF10 (Z8-049): Emit one terminal cost_update when the CLI
				// result line carried a total_cost_usd (or configured costField).
				// Done here (not in parseStdoutLine) so the event is yielded AFTER
				// all stdout lines have been emitted, consistent with the SDK adapter.
				// deltaCost == totalCostUsd: the whole session is one delta (§4 plan).
				if (session.done && session.totalCostUsd !== undefined && !session.costEmitted) {
					session.costEmitted = true;
					const costEvent: HarnessEvent = {
						type: "cost_update",
						deltaCost: session.totalCostUsd,
						totalCost: session.totalCostUsd,
						currency: "USD",
					};
					yield costEvent;
				}

				if (session.done) break;

				await waitForMore();
			}
		})();
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) {
			return {
				outcome: "crashed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		}

		if (session.done) {
			this.sessions.delete(handle.sessionId);
			return this.buildResult(session.exitCode, session.exitSignal, session.totalCostUsd);
		}

		// Send SIGTERM first (graceful shutdown)
		session.child.kill("SIGTERM");

		// Escalate to SIGKILL after 5 seconds if process hasn't exited
		// @lore X5 W1: SIGTERM -> 5s wait -> SIGKILL mirrors IsolatedHarnessAdapter pattern
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

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false, // External CLI tools don't expose compaction signals
			subAgents: false, // External CLI tools manage their own sub-agents
			modelProviders: [], // CLI tool brings its own provider; selected by harnessType not provider
			// X5: mcpSupport: true — CLI tools use MCP (via .mcp.json written to workspace)
			// for HyperIdle tool calling.
			mcpSupport: true,
			// AL6 v3: CLI has no native in-turn hook (Layer-A). Forced via Layer-B
			// sandbox-file rewrite + re-spawn (the only instruction channel CLI reads).
			hasNativeReturnHook: false,
			// AL6 v3: CLI can re-engage — the re-spawned subprocess reads the rewritten
			// AGENTS.md/CLAUDE.md from cwd:sandboxPath on each startSession.
			canReEngage: true,
		};
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private parseStdoutLine(line: string, session?: CliSession): HarnessEvent {
		if (this.config.eventFormat === "text") {
			return { type: "completion", text: line };
		}

		// ndjson mode: try to parse as HarnessEvent
		try {
			const parsed: unknown = JSON.parse(line);
			if (
				parsed !== null &&
				typeof parsed === "object" &&
				"type" in parsed &&
				typeof (parsed as Record<string, unknown>)["type"] === "string"
			) {
				const obj = parsed as Record<string, unknown>;

				// @lore AF10 (Z8-049/Z8-088): If this is a terminal result line from
				// the CLI, capture the total cost. The CLI reports the full session
				// total in a single result line; we store it on the session and emit
				// one synthetic terminal cost_update in streamEvents (after all stdout
				// lines are drained). Only a finite non-negative number is accepted —
				// anything else (missing, string, negative) is ignored (fallback = 0).
				if (obj["type"] === "result" && session) {
					const costField = this.config.costField ?? "total_cost_usd";
					const rawCost = obj[costField];
					if (typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0) {
						session.totalCostUsd = rawCost;
					}
				}

				return normalizeHarnessEvent(parsed);
			}
		} catch {
			// Fall through to completion event
		}

		return { type: "completion", text: line };
	}

	private buildResult(
		code: number | null,
		signal: string | null,
		totalCostUsd?: number,
	): SessionResult {
		let outcome: SessionResult["outcome"];
		if (signal !== null) {
			outcome = "stopped";
		} else if (code === 0) {
			outcome = "completed";
		} else {
			outcome = "crashed";
		}
		// @lore AF10 (Z8-049): Return the captured CLI cost from the terminal
		// result line (total_cost_usd → minor cents). 0 when the CLI reported
		// nothing — honest absent, not a silent drop (§4 plan constraint).
		const minor = totalCostUsd !== undefined ? Math.round(totalCostUsd * 100) : 0;
		return {
			outcome,
			cost: { minor, currency: "USD" },
			tokenUsage: { byTier: {} },
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

		session.child.stderr?.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.length > 0) {
					session.stderrLines.push(line);
					session.notifyStream?.();
				}
			}
		});

		session.child.stderr?.on("end", () => {
			if (buffer.length > 0) {
				session.stderrLines.push(buffer);
				buffer = "";
				session.notifyStream?.();
			}
		});
	}
}
