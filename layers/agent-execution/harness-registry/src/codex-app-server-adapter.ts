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

export type { CodexAppServerAdapterDeps };

// @lore: bundled path — ChatGPT bundles a codex binary that supports app-server --stdio; homebrew codex only has daemon/proxy (no stdio mode)
const CODEX_BUNDLED_BINARY =
	"/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";

/**
 * Resolve the binary for `codex app-server --stdio`.
 * Priority: CODEX_APP_SERVER_BINARY env var → bundled ChatGPT binary → PATH "codex".
 */
function resolveAppServerBinary(): string {
	const fromEnv = process.env.CODEX_APP_SERVER_BINARY;
	if (fromEnv) return fromEnv;
	if (fs.existsSync(CODEX_BUNDLED_BINARY)) return CODEX_BUNDLED_BINARY;
	return "codex";
}

interface PendingRequest {
	resolve(result: unknown): void;
	reject(err: Error): void;
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
}

/** Injectable dependencies (for unit tests). */
interface CodexAppServerAdapterDeps {
	readonly spawnFn?: typeof spawn;
	readonly killFn?: (pid: number, signal: NodeJS.Signals) => void;
	/** Override the binary path (unit tests inject a fake; defaults to resolveAppServerBinary()). */
	readonly binaryPath?: string;
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

function buildArgs(_config: SessionConfig): string[] {
	// @lore: no --dangerously-bypass-hook-trust — bundled binary rejects it; trust is via config.toml trust_level written by provisionCodexHome
	return ["app-server", "--stdio"];
}

function parseNotificationToEvent(line: string): HarnessEvent | null {
	try {
		const msg = JSON.parse(line) as { method?: string; params?: unknown };
		if (msg.method === "item/agentMessage/delta") {
			const params = (msg.params ?? {}) as Record<string, unknown>;
			if (typeof params.delta === "string") {
				return { type: "completion", text: params.delta };
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
	private readonly binaryPath: string;
	private readonly sessions = new Map<string, AppServerSession>();

	constructor(deps?: CodexAppServerAdapterDeps) {
		this.spawnFn = deps?.spawnFn ?? spawn;
		this.killFn = deps?.killFn ?? ((pid, signal) => process.kill(pid, signal));
		this.binaryPath = deps?.binaryPath ?? resolveAppServerBinary();
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const env = buildEnv(config);
		const args = buildArgs(config);

		const child = this.spawnFn(this.binaryPath, args, {
			cwd: config.sandboxPath,
			env,
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
		});

		const sessionId = `codex-appserver-${nextSessionId++}`;
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
		};

		this.sessions.set(sessionId, session);
		this.wireStdout(session);

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
			// @lore: ephemeral true — prevents thread persisting to codex history; each HyperIdle session is self-contained
			ephemeral: true,
		})) as { thread: { id: string } };

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

				if (session.done) break;

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
			const result = this.buildResult(session);
			this.sessions.delete(handle.sessionId);
			return Promise.resolve(result);
		}

		if (session.child.pid !== undefined) {
			try {
				// Kill the process group (detached: true spawns in its own group)
				this.killFn(-session.child.pid, "SIGTERM");
			} catch {
				// Process may have already exited
			}
		}

		return new Promise<SessionResult>((resolve) => {
			if (session.done) {
				const result = this.buildResult(session);
				this.sessions.delete(handle.sessionId);
				resolve(result);
				return;
			}
			session.resolveStop = (result) => {
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

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: true,
			// @lore: settings-codex — same return-enforcement as codex exec; hooks.json Stop hook written by provisionReturnHook
			returnEnforcement: "settings-codex",
			// @lore: codex-toml — MCP server appended to .codex-home/config.toml; token via HYPERIDLE_MCP_TOKEN
			cliMcpDialect: "codex-toml",
		};
	}

	// ── Private helpers ────────────────────────────────────────────────────────

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
