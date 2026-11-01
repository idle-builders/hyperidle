/**
 * CodexAppServerAdapter — drives `codex app-server --stdio` (JSON-RPC over stdio)
 * instead of the one-shot `codex exec` path.
 *
 * The app-server protocol keeps stdin open and supports `turn/steer` to deliver
 * messages into a running turn — the feature `codex exec` cannot provide.
 *
 * Wire format: NDJSON (one JSON object per line).
 * Client → server: { method, id, params }
 * Server → client: { id, result } for responses, { method, params } for notifications.
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
} from "@hyperidle/harness-protocol";
import { modelOptionArgv } from "./model-options.js";

interface PendingRequest {
	resolve(result: unknown): void;
	reject(err: Error): void;
}

/** Return gate config — present when SessionConfig.returnHook is set. */
interface ReturnGate {
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	readonly forceBudget: number;
	readonly fetchFn: typeof globalThis.fetch;
}

interface AppServerSession {
	readonly child: ChildProcess;
	/** JSON-RPC thread id, set after thread/start response. */
	threadId?: string;
	/** The running turn id, set from turn/start response + turn/started notification. */
	activeTurnId?: string;
	/** True once turn/completed notification arrives or process exits. */
	done: boolean;
	/** Raw notification lines buffered for streamEvents. */
	readonly notificationLines: string[];
	/** Wakes up a waiting streamEvents loop. */
	notifyStream: (() => void) | null;
	resolveStop: ((result: SessionResult) => void) | null;
	exitCode: number | null;
	exitSignal: string | null;
	/** Pending client-request handlers, keyed by request id. */
	readonly pendingRequests: Map<number, PendingRequest>;
	nextReqId: number;
	readonly modelTier: SessionConfig["modelTier"];
	/** External (config) session id, for getForceReturnCount. */
	readonly configSessionId: string;
	/** Return gate config; absent when no returnHook configured. */
	readonly returnGate?: ReturnGate;
	/** Count of forced follow-up turns started by the gate in this session. */
	gateForceCount: number;
}

/** Injectable dependencies and overridable behaviors (for unit tests). */
interface CodexAppServerAdapterDeps {
	readonly spawnFn?: typeof spawn;
	readonly killFn?: (pid: number, signal: NodeJS.Signals) => void;
	readonly fetchFn?: typeof globalThis.fetch;
	/** SIGKILL escalation timeout in ms after SIGTERM (default 3000). */
	readonly sigkillTimeoutMs?: number;
}

let nextSessionId = 1;

function buildEnv(config: SessionConfig): Record<string, string> {
	const allowlist = ["PATH", "HOME", "LANG"];
	const env: Record<string, string> = {};
	for (const key of allowlist) {
		const val = process.env[key];
		if (val !== undefined) env[key] = val;
	}
	// Per-session CODEX_HOME: same pattern as CliHarnessAdapter
	const codexHomeDir = path.join(config.sandboxPath, ".codex-home");
	if (fs.existsSync(codexHomeDir)) {
		env.CODEX_HOME = codexHomeDir;
	}
	// MCP token env var (codex bearer_token_env_var mechanism)
	if (config.mcpTokenEnv) {
		for (const [key, value] of Object.entries(config.mcpTokenEnv)) {
			env[key] = value;
		}
	}
	return env;
}

function buildArgs(config: SessionConfig): string[] {
	// @lore: no --dangerously-bypass-hook-trust — app-server rejects it (only exec accepts it); return gate is in-process (checkReturnGate after turn/completed)
	return ["app-server", "--stdio", ...modelOptionArgv("codex", config.modelOptions)];
}

function parseNotificationToEvent(line: string): HarnessEvent | null {
	try {
		const msg = JSON.parse(line) as { method?: string; params?: unknown };
		const params = (msg.params ?? {}) as Record<string, unknown>;

		switch (msg.method) {
			case "item/agentMessage/delta": {
				if (typeof params.delta === "string") {
					return { type: "completion", text: params.delta };
				}
				break;
			}
			case "item/started": {
				const item = (params.item ?? {}) as Record<string, unknown>;
				const itemType = typeof item.type === "string" ? item.type : "";
				if (itemType === "commandExecution") {
					const command = typeof item.command === "string" ? item.command : "unknown";
					return { type: "tool_call", toolName: "bash", args: { command } };
				}
				if (itemType === "mcpToolCall") {
					const toolName = typeof item.tool === "string" ? item.tool : "unknown";
					const args =
						item.arguments !== null &&
						item.arguments !== undefined &&
						typeof item.arguments === "object"
							? (item.arguments as Record<string, unknown>)
							: {};
					return { type: "tool_call", toolName, args };
				}
				// reasoning, plan, agentMessage start, etc. — benign
				return { type: "completion", text: "" };
			}
			case "item/completed": {
				// agentMessage completions already streamed via delta; other item types are benign
				return { type: "completion", text: "" };
			}
			case "item/commandExecution/outputDelta":
			case "item/mcpToolCall/progress":
			case "item/reasoning/textDelta": {
				// Streaming sub-events — benign, avoids unknown-event errors
				return { type: "completion", text: "" };
			}
			case "thread/tokenUsage/updated": {
				const tokenUsage = (params.tokenUsage ?? {}) as Record<string, unknown>;
				const last = (tokenUsage.last ?? {}) as Record<string, unknown>;
				const inputTokens =
					typeof last.inputTokens === "number" && Number.isFinite(last.inputTokens)
						? last.inputTokens
						: 0;
				const outputTokens =
					typeof last.outputTokens === "number" && Number.isFinite(last.outputTokens)
						? last.outputTokens
						: 0;
				const event: HarnessEvent = { type: "token_usage", inputTokens, outputTokens };
				const cachedInput =
					typeof last.cachedInputTokens === "number" && last.cachedInputTokens >= 0
						? last.cachedInputTokens
						: undefined;
				const cacheWrite =
					typeof last.cacheWriteInputTokens === "number" && last.cacheWriteInputTokens >= 0
						? last.cacheWriteInputTokens
						: undefined;
				const reasoningOutput =
					typeof last.reasoningOutputTokens === "number" && last.reasoningOutputTokens >= 0
						? last.reasoningOutputTokens
						: undefined;
				return {
					...event,
					...(cachedInput !== undefined ? { cachedInputTokens: cachedInput } : {}),
					...(cacheWrite !== undefined ? { cacheCreationInputTokens: cacheWrite } : {}),
					...(reasoningOutput !== undefined ? { reasoningOutputTokens: reasoningOutput } : {}),
				};
			}
		}
	} catch {
		return null;
	}
	return null;
}

export class CodexAppServerAdapter implements HarnessAdapter {
	private readonly spawnFn: typeof spawn;
	private readonly killFn: (pid: number, signal: NodeJS.Signals) => void;
	private readonly fetchFn: typeof globalThis.fetch;
	private readonly sigkillTimeoutMs: number;
	private readonly sessions = new Map<string, AppServerSession>();
	/** Persists gateForceCount after a session is deleted from this.sessions. */
	private readonly forceReturnCounts = new Map<string, number>();

	constructor(deps?: CodexAppServerAdapterDeps) {
		this.spawnFn = deps?.spawnFn ?? spawn;
		this.killFn = deps?.killFn ?? ((pid, signal) => process.kill(pid, signal));
		this.fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);
		this.sigkillTimeoutMs = deps?.sigkillTimeoutMs ?? 3_000;
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const env = buildEnv(config);
		const args = buildArgs(config);

		const child = this.spawnFn("codex", args, {
			cwd: config.sandboxPath,
			env,
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
		});

		const sessionId = `codex-appserver-${nextSessionId++}`;
		const returnGate: ReturnGate | undefined = config.returnHook
			? {
					bridgeToken: config.returnHook.bridgeToken,
					mcpUrl: config.returnHook.mcpUrl,
					forceBudget: config.returnHook.forceBudget,
					fetchFn: this.fetchFn,
				}
			: undefined;

		const session: AppServerSession = {
			child,
			threadId: undefined,
			activeTurnId: undefined,
			done: false,
			notificationLines: [],
			notifyStream: null,
			resolveStop: null,
			exitCode: null,
			exitSignal: null,
			pendingRequests: new Map(),
			nextReqId: 1,
			modelTier: config.modelTier,
			configSessionId: config.sessionId,
			returnGate,
			gateForceCount: 0,
		};

		this.sessions.set(sessionId, session);
		this.wireStdout(session);
		// @lore: stderr drain — prevents pipe buffer blocking the child process; discards all stderr (same as stderrIgnorePatterns:[/.*/] on exec path)
		child.stderr?.resume();

		child.on("exit", (code, signal) => {
			// Reject all pending requests so awaiting code doesn't hang
			for (const handler of session.pendingRequests.values()) {
				handler.reject(new Error(`codex app-server exited (code: ${String(code)})`));
			}
			session.pendingRequests.clear();
			session.exitCode = code;
			session.exitSignal = signal;
			session.done = true;
			session.notifyStream?.();
			const result = this.buildResult(session);
			session.resolveStop?.(result);
		});

		// JSON-RPC handshake
		await this.sendRequest(session, "initialize", {
			clientInfo: { name: "hyperidle", version: "1.0" },
			capabilities: null,
		});

		const threadResult = (await this.sendRequest(session, "thread/start", {
			cwd: config.sandboxPath,
			...(config.selectedModel ? { model: config.selectedModel } : {}),
			// @lore: workspace-write — codex app-server defaults read-only; same flag as codex exec path
			sandbox: "workspace-write",
			// @lore: approvalPolicy never — prevents server-initiated approval requests during tests and production sessions
			approvalPolicy: "never",
			// @lore: ephemeral false is safe — CODEX_HOME is the sandbox's .codex-home, so history never lands in the user's ~/.codex
			ephemeral: false,
		})) as {
			thread: { id: string };
			model?: string;
		};

		session.threadId = threadResult.thread.id;

		const instruction = config.instruction?.trim() || "proceed";
		const turnResult = (await this.sendRequest(session, "turn/start", {
			threadId: threadResult.thread.id,
			input: [{ type: "text", text: instruction }],
			approvalPolicy: "never",
		})) as { turn: { id: string } };

		// Pre-set activeTurnId from response; notification may arrive after streamEvents starts
		if (turnResult.turn?.id) {
			session.activeTurnId = turnResult.turn.id;
		}

		return { sessionId };
	}

	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent> {
		const sessions = this.sessions;
		const checkGate = this.checkReturnGate.bind(this);
		const sendReq = this.sendRequest.bind(this);
		return (async function* generator(): AsyncGenerator<HarnessEvent> {
			const session = sessions.get(handle.sessionId);
			if (!session) return;

			let cursor = 0;

			while (true) {
				while (cursor < session.notificationLines.length) {
					const line = session.notificationLines[cursor++];
					if (!line) continue;
					const event = parseNotificationToEvent(line);
					if (event) yield event;
				}

				if (session.done) {
					// In-process return gate: check bridge before allowing session to end.
					if (session.returnGate) {
						const forceMessage = await checkGate(session);
						if (forceMessage !== null) {
							// Bridge blocked — start a follow-up turn with the force message.
							session.done = false;
							const turnResult = (await sendReq(session, "turn/start", {
								threadId: session.threadId,
								input: [{ type: "text", text: forceMessage }],
								approvalPolicy: "never",
							})) as { turn: { id: string } };
							if (turnResult.turn?.id) {
								session.activeTurnId = turnResult.turn.id;
							}
							continue;
						}
					}
					break;
				}

				await new Promise<void>((resolve) => {
					if (cursor < session.notificationLines.length || session.done) {
						resolve();
						return;
					}
					session.notifyStream = () => {
						session.notifyStream = null;
						resolve();
					};
				});
			}
		})();
	}

	stopSession(handle: SessionHandle): Promise<SessionResult> {
		const session = this.sessions.get(handle.sessionId);
		if (!session) return Promise.resolve({ outcome: "crashed", tokenUsage: { byTier: {} } });

		if (session.done && session.exitCode !== null) {
			// Fast path: turn completed AND the process has already exited.
			const result = this.buildResult(session);
			this.forceReturnCounts.set(session.configSessionId, session.gateForceCount);
			this.sessions.delete(handle.sessionId);
			return Promise.resolve(result);
		}

		// Signal the process group to stop (detached: true spawns in its own group).
		if (session.child.pid !== undefined) {
			try {
				this.killFn(-session.child.pid, "SIGTERM");
			} catch {
				// Process may have already exited
			}
		}

		// @lore: wait for real exit — codex keeps writing .codex-home after turn/completed; resolving early races sandbox cleanup
		return new Promise<SessionResult>((resolve) => {
			// Escalate to SIGKILL if SIGTERM is ignored (unref so the timer does not keep Node alive).
			const sigkillTimer = setTimeout(() => {
				if (session.child.pid !== undefined) {
					try {
						this.killFn(-session.child.pid, "SIGKILL");
					} catch {
						// Already gone
					}
				}
			}, this.sigkillTimeoutMs).unref();

			session.resolveStop = (result) => {
				clearTimeout(sigkillTimer);
				this.forceReturnCounts.set(session.configSessionId, session.gateForceCount);
				this.sessions.delete(handle.sessionId);
				resolve(result);
			};
		});
	}

	async deliver(handle: SessionHandle, text: string): Promise<"delivered" | "unsupported"> {
		const session = this.sessions.get(handle.sessionId);
		if (!(session?.threadId && session.activeTurnId) || session.done) {
			return "unsupported";
		}

		try {
			await this.sendRequest(session, "turn/steer", {
				threadId: session.threadId,
				expectedTurnId: session.activeTurnId,
				input: [{ type: "text", text }],
			});
			return "delivered";
		} catch {
			return "unsupported";
		}
	}

	getNativeSessionId(handle: SessionHandle): string | undefined {
		return this.sessions.get(handle.sessionId)?.threadId;
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: true,
			// @lore: settings-codex — in-process gate; adapter POSTs to bridge after turn/completed; hooks.json Stop requires opaque pre-computed hash (not feasible)
			returnEnforcement: "settings-codex",
			// @lore: codex-toml — MCP server appended to .codex-home/config.toml; token via HYPERIDLE_MCP_TOKEN
			cliMcpDialect: "codex-toml",
		};
	}

	/**
	 * Count of enforcement-gate forced follow-up turns for the given external session id.
	 * Returns 0 when no gate was configured or the session is unknown.
	 */
	getForceReturnCount(sessionId: string): number {
		// Active session
		for (const session of this.sessions.values()) {
			if (session.configSessionId === sessionId) {
				return session.gateForceCount;
			}
		}
		// Completed session: count was saved in forceReturnCounts at stopSession time
		return this.forceReturnCounts.get(sessionId) ?? 0;
	}

	// ── Private helpers ────────────────────────────────────────────────────────

	/**
	 * Check the bridge return-status endpoint. Returns the force message when the
	 * bridge blocks (non-empty body), null when it approves (empty body) or is
	 * unreachable, or when the forceBudget is exhausted.
	 */
	private async checkReturnGate(session: AppServerSession): Promise<string | null> {
		const gate = session.returnGate;
		if (!gate) return null;

		// Exhaust budget → approve; avoids infinite forced loops.
		if (session.gateForceCount >= gate.forceBudget) {
			return null;
		}

		try {
			const response = await gate.fetchFn(`${gate.mcpUrl}/return-status`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${gate.bridgeToken}`,
					"Content-Type": "application/json",
				},
				body: "{}",
			});
			const text = (await response.text()).trim();
			if (text) {
				session.gateForceCount++;
				this.forceReturnCounts.set(session.configSessionId, session.gateForceCount);
				return text;
			}
		} catch {
			// Bridge unreachable — approve (drain-gate floor backstops)
		}
		return null;
	}

	private sendRequest(
		session: AppServerSession,
		method: string,
		params: unknown,
	): Promise<unknown> {
		const id = session.nextReqId++;
		const line = `${JSON.stringify({ method, id, params })}\n`;
		return new Promise<unknown>((resolve, reject) => {
			session.pendingRequests.set(id, { resolve, reject });
			session.child.stdin?.write(line);
		});
	}

	private wireStdout(session: AppServerSession): void {
		let buffer = "";
		session.child.stdout?.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.trim()) this.processLine(line, session);
			}
		});
	}

	private processLine(line: string, session: AppServerSession): void {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(line) as Record<string, unknown>;
		} catch {
			return;
		}

		// Response to a client request: { id, result }
		if ("result" in parsed && "id" in parsed) {
			const id = parsed.id as number;
			const handler = session.pendingRequests.get(id);
			if (handler) {
				session.pendingRequests.delete(id);
				handler.resolve(parsed.result);
			}
			return;
		}

		// Error response: { id, error }
		if ("error" in parsed && "id" in parsed) {
			const id = parsed.id as number;
			const handler = session.pendingRequests.get(id);
			if (handler) {
				session.pendingRequests.delete(id);
				const err = (parsed.error ?? {}) as Record<string, unknown>;
				handler.reject(new Error(String(err.message ?? "JSON-RPC error")));
			}
			return;
		}

		// Server notification or server-initiated request: { method, params }
		if ("method" in parsed) {
			const method = parsed.method as string;

			// Server-initiated request (has id) — auto-approve
			if ("id" in parsed) {
				const reqId = parsed.id as number;
				session.child.stdin?.write(
					`${JSON.stringify({ id: reqId, result: { outcome: "approve" } })}\n`,
				);
				return;
			}

			// Update activeTurnId from turn/started notification
			if (method === "turn/started") {
				const params = (parsed.params ?? {}) as Record<string, unknown>;
				const turn = (params.turn ?? {}) as Record<string, unknown>;
				if (typeof turn.id === "string") {
					session.activeTurnId = turn.id;
				}
			} else if (method === "turn/completed") {
				session.done = true;
			}

			// Buffer all notifications for streamEvents
			session.notificationLines.push(line);
			session.notifyStream?.();
		}
	}

	private buildResult(session: AppServerSession): SessionResult {
		// A zero exit code or a clean turn/completed means the session completed.
		// Non-zero exit with no signal: crashed. A signal means stopped externally.
		let outcome: SessionResult["outcome"] = "completed";
		if (session.exitSignal) {
			outcome = "stopped";
		} else if (session.exitCode !== null && session.exitCode !== 0) {
			outcome = "crashed";
		}
		return { outcome, tokenUsage: { byTier: {} } };
	}
}
