/**
 * OpenCodeServeAdapter — drives `opencode serve --port 0` (HTTP serve mode).
 *
 * The serve protocol keeps a long-lived HTTP server and supports delivering
 * messages into a running session via POST /api/session/{id}/prompt with
 * delivery "steer" — the feature `opencode run` cannot provide.
 *
 * API: OpenCode v2 HTTP API.
 *   Session create:  POST /api/session
 *   Send prompt:     POST /api/session/{id}/prompt
 *   Event stream:    GET  /api/session/{id}/event  (SSE, text/event-stream)
 *   Interrupt:       POST /api/session/{id}/interrupt
 *
 * Done detection: idle timer — resets on each SSE event, fires when quiet.
 * Return gate:    in-process (same pattern as CodexAppServerAdapter).
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";

export type { OpenCodeServeAdapterDeps };

/** Return gate config — present when SessionConfig.returnHook is set. */
interface ReturnGate {
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	readonly forceBudget: number;
	readonly fetchFn: typeof globalThis.fetch;
}

interface ServeSession {
	readonly opcodeSessionId: string;
	done: boolean;
	readonly events: HarnessEvent[];
	notifyStream: (() => void) | null;
	resolveStop: ((result: SessionResult) => void) | null;
	readonly returnGate?: ReturnGate;
	gateForceCount: number;
	readonly configSessionId: string;
	readonly modelTier: SessionConfig["modelTier"];
	readonly sseAbort: AbortController;
	idleTimer: ReturnType<typeof setTimeout> | null;
	/** True while session.next.step.started seen without matching step.ended. */
	stepActive: boolean;
}

/** Injectable dependencies (for unit tests). */
interface OpenCodeServeAdapterDeps {
	readonly spawnFn?: typeof spawn;
	readonly killFn?: (pid: number, signal: NodeJS.Signals) => void;
	readonly fetchFn?: typeof globalThis.fetch;
	/** Override the per-adapter XDG data dir (for tests). */
	readonly xdgDataHome?: string;
	/** Override the per-adapter XDG config dir (for tests). */
	readonly xdgConfigHome?: string;
}

/** Idle timeout when no step has started yet (handles LLM 401 / fast errors). */
const IDLE_TIMEOUT_INITIAL_MS = 5_000;
/** Idle timeout after a step started and completed (short quiet period = done). */
const IDLE_TIMEOUT_ACTIVE_MS = 3_000;
/** Idle timeout while a step is actively running (long computation guard). */
const IDLE_TIMEOUT_STEP_MS = 120_000;

let nextSessionSeq = 1;

/** Parse "openrouter/z-ai/glm-4.7-flash" → {providerID: "openrouter", id: "z-ai/glm-4.7-flash"}. */
function parseModel(selectedModel?: string): { id: string; providerID: string } | undefined {
	if (!selectedModel) return undefined;
	const slashIdx = selectedModel.indexOf("/");
	if (slashIdx <= 0) return undefined;
	return {
		providerID: selectedModel.slice(0, slashIdx),
		id: selectedModel.slice(slashIdx + 1),
	};
}

/**
 * Map a raw SSE event from the v2 serve API to a canonical HarnessEvent.
 * Returns null for lifecycle events that carry no content.
 *
 * @lore: serve SSE types differ from CLI JSONL; text uses text.delta|ended; tools use tool.called; without this mapping all serve events are silently dropped
 */
function parseServeEvent(raw: { type: string; data?: unknown }): HarnessEvent | null {
	const data = (raw.data ?? {}) as Record<string, unknown>;

	switch (raw.type) {
		case "session.next.text.delta": {
			const text = typeof data.text === "string" ? data.text : "";
			return { type: "completion", text };
		}
		case "session.next.text.ended": {
			// text.ended carries the full chunk text; delta already streamed partials.
			// Emit as a benign empty to avoid double-counting completed text.
			return { type: "completion", text: "" };
		}
		case "session.next.tool.called": {
			const toolName = typeof data.tool === "string" ? data.tool : "unknown";
			const args =
				data.input !== null && typeof data.input === "object"
					? (data.input as Record<string, unknown>)
					: {};
			return { type: "tool_call", toolName, args };
		}
		// Lifecycle events — benign completions to keep event stream clean
		case "session.next.prompt.admitted":
		case "session.next.prompted":
		case "session.next.step.started":
		case "session.next.step.ended":
			return { type: "completion", text: "" };
		default:
			return null;
	}
}

export class OpenCodeServeAdapter implements HarnessAdapter {
	private readonly spawnFn: typeof spawn;
	private readonly killFn: (pid: number, signal: NodeJS.Signals) => void;
	private readonly fetchFn: typeof globalThis.fetch;
	private readonly sessions = new Map<string, ServeSession>();
	/** Persists gateForceCount after a session is removed from this.sessions. */
	private readonly forceReturnCounts = new Map<string, number>();

	// Shared serve process for this adapter instance
	private serverProcess?: ChildProcess;
	private serverUrl?: string;
	private serverReadyPromise?: Promise<string>;
	private readonly xdgDataHome: string;
	private readonly xdgConfigHome: string;

	constructor(deps?: OpenCodeServeAdapterDeps) {
		this.spawnFn = deps?.spawnFn ?? spawn;
		this.killFn = deps?.killFn ?? ((pid, signal) => process.kill(pid, signal));
		this.fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);

		// @lore: XDG_DATA_HOME isolates SQLite db — concurrent instances hang on write-lock without it; auth.json copied so login is still found
		this.xdgDataHome =
			deps?.xdgDataHome ?? fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-opencode-xdg-data-"));

		// @lore: XDG_CONFIG_HOME isolates opencode config — prevents user's global ~/.config/opencode plugins from loading into sessions; same isolation as the CLI path
		this.xdgConfigHome =
			deps?.xdgConfigHome ?? fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-opencode-xdg-cfg-"));

		// Copy auth.json from the user's real opencode data home so sessions can authenticate.
		// Fails silently when no auth file exists (test environments, or first-run).
		const realDataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
		const authSrc = path.join(realDataHome, "opencode", "auth.json");
		const authDstDir = path.join(this.xdgDataHome, "opencode");
		try {
			fs.mkdirSync(authDstDir, { recursive: true });
			fs.copyFileSync(authSrc, path.join(authDstDir, "auth.json"));
		} catch {
			// auth.json absent or unreadable — opencode will fall back to env-based keys.
		}
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const serverUrl = await this.ensureServer();

		const model = parseModel(config.selectedModel);

		// Create session
		const createRes = await this.fetchFn(`${serverUrl}/api/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				location: { directory: config.sandboxPath },
				...(model ? { model } : {}),
			}),
		});
		if (!createRes.ok) {
			throw new Error(`opencode /api/session create failed: ${createRes.status}`);
		}
		const createData = (await createRes.json()) as { data: { id: string } };
		const opcodeSessionId = createData.data.id;

		// Deliver the opening instruction
		const instruction = config.instruction?.trim() || "proceed";
		const promptRes = await this.fetchFn(`${serverUrl}/api/session/${opcodeSessionId}/prompt`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt: { text: instruction }, resume: true }),
		});
		if (!promptRes.ok) {
			throw new Error(
				`opencode /api/session/${opcodeSessionId}/prompt failed: ${promptRes.status}`,
			);
		}

		const sessionId = `opencode-serve-${nextSessionSeq++}`;
		const sseAbort = new AbortController();
		const returnGate: ReturnGate | undefined = config.returnHook
			? {
					bridgeToken: config.returnHook.bridgeToken,
					mcpUrl: config.returnHook.mcpUrl,
					forceBudget: config.returnHook.forceBudget,
					fetchFn: this.fetchFn,
				}
			: undefined;

		const session: ServeSession = {
			opcodeSessionId,
			done: false,
			events: [],
			notifyStream: null,
			resolveStop: null,
			returnGate,
			gateForceCount: 0,
			configSessionId: config.sessionId,
			modelTier: config.modelTier,
			sseAbort,
			idleTimer: null,
			stepActive: false,
		};

		this.sessions.set(sessionId, session);

		// Subscribe to SSE in background — runs until session is done or aborted.
		// Prompt was sent above, so at least 2 events exist; stream will stay open.
		void this.subscribeSse(session, serverUrl, opcodeSessionId);

		return { sessionId };
	}

	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent> {
		const sessions = this.sessions;
		const checkGate = this.checkReturnGate.bind(this);
		const sendFollowUp = this.sendFollowUpPrompt.bind(this);

		return (async function* generator(): AsyncGenerator<HarnessEvent> {
			const session = sessions.get(handle.sessionId);
			if (!session) return;

			let cursor = 0;

			while (true) {
				while (cursor < session.events.length) {
					const evt = session.events[cursor++];
					if (evt) yield evt;
				}

				if (session.done) {
					// In-process return gate: check bridge before allowing session to end.
					if (session.returnGate) {
						const forceMessage = await checkGate(session);
						if (forceMessage !== null) {
							// Bridge blocked — send follow-up and keep streaming.
							await sendFollowUp(session, forceMessage);
							continue;
						}
					}
					break;
				}

				await new Promise<void>((resolve) => {
					if (cursor < session.events.length || session.done) {
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

		if (session.done) {
			return Promise.resolve(this.finishSession(handle.sessionId, session));
		}

		// Interrupt the running session and abort SSE
		if (this.serverUrl) {
			void this.fetchFn(`${this.serverUrl}/api/session/${session.opcodeSessionId}/interrupt`, {
				method: "POST",
			});
		}
		session.sseAbort.abort();
		clearTimeout(session.idleTimer ?? undefined);
		session.done = true;
		session.notifyStream?.();

		return new Promise<SessionResult>((resolve) => {
			resolve(this.finishSession(handle.sessionId, session));
		});
	}

	async deliver(handle: SessionHandle, text: string): Promise<"delivered" | "unsupported"> {
		const session = this.sessions.get(handle.sessionId);
		if (!session || session.done || !this.serverUrl) return "unsupported";

		try {
			const res = await this.fetchFn(
				`${this.serverUrl}/api/session/${session.opcodeSessionId}/prompt`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					// delivery "steer" targets the running turn (not queue)
					body: JSON.stringify({ prompt: { text }, delivery: "steer" }),
				},
			);
			if (res.ok) {
				// Keep session alive: reset idle timer after delivery
				this.resetIdleTimer(
					session,
					session.stepActive ? IDLE_TIMEOUT_STEP_MS : IDLE_TIMEOUT_INITIAL_MS,
				);
				return "delivered";
			}
			return "unsupported";
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
			// @lore: sdk-inprocess channel — gate runs entirely in streamEvents(); no file hook written to sandbox; no codex home, no opencode plugin
			returnEnforcement: "sdk-inprocess",
			// @lore: opencode-json — MCP server written to opencode.json in sandbox cwd; token is inline in headers.Authorization
			cliMcpDialect: "opencode-json",
		};
	}

	/**
	 * Count of enforcement-gate forced follow-up turns for the given config session id.
	 * Returns 0 when no gate was configured or the session is unknown.
	 */
	getForceReturnCount(sessionId: string): number {
		for (const session of this.sessions.values()) {
			if (session.configSessionId === sessionId) {
				return session.gateForceCount;
			}
		}
		return this.forceReturnCounts.get(sessionId) ?? 0;
	}

	// ── Private helpers ────────────────────────────────────────────────────────

	/** Start the serve process or return the cached URL. */
	private ensureServer(): Promise<string> {
		if (this.serverUrl) return Promise.resolve(this.serverUrl);
		if (this.serverReadyPromise) return this.serverReadyPromise;

		this.serverReadyPromise = new Promise<string>((resolve, reject) => {
			const env = this.buildServerEnv();
			const child = this.spawnFn("opencode", ["serve", "--port", "0"], {
				env,
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			});

			this.serverProcess = child;

			let stdoutBuf = "";
			const onStdout = (chunk: Buffer): void => {
				stdoutBuf += chunk.toString();
				// @lore: opencode serve emits the port announcement on stdout, not stderr; reads child.stdout
				const m = /opencode server listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(stdoutBuf);
				if (m) {
					const port = m[1];
					this.serverUrl = `http://127.0.0.1:${port}`;
					child.stdout?.off("data", onStdout);
					resolve(this.serverUrl);
				}
			};
			child.stdout?.on("data", onStdout);

			child.on("exit", () => {
				this.serverProcess = undefined;
				this.serverUrl = undefined;
				this.serverReadyPromise = undefined;
			});

			// Reject if not ready within 10s
			const t = setTimeout(
				() => reject(new Error("opencode serve: timed out waiting for port")),
				10_000,
			);
			child.once("exit", () => clearTimeout(t));
		});

		return this.serverReadyPromise;
	}

	private buildServerEnv(): Record<string, string> {
		const allowlist = ["PATH", "HOME", "LANG", "OPENROUTER_API_KEY"];
		const env: Record<string, string> = {};
		for (const key of allowlist) {
			const val = process.env[key];
			if (val !== undefined) env[key] = val;
		}
		// Isolated data dir: db lives here; auth.json was copied in during construction.
		env.XDG_DATA_HOME = this.xdgDataHome;
		// Isolated config dir: prevents user's global ~/.config/opencode plugins from loading.
		env.XDG_CONFIG_HOME = this.xdgConfigHome;
		// @lore: OPENCODE_PERMISSION — without it opencode asks before each tool call; non-TTY auto-rejects; {"*":"allow"} grants headless approval (same as CLI path)
		env.OPENCODE_PERMISSION = '{"*":"allow"}';
		return env;
	}

	private subscribeSse(
		session: ServeSession,
		serverUrl: string,
		opcodeSessionId: string,
	): Promise<void> {
		// Start an initial idle timer — fires if no content events arrive at all
		this.resetIdleTimer(session, IDLE_TIMEOUT_INITIAL_MS);

		return (async () => {
			try {
				const res = await this.fetchFn(`${serverUrl}/api/session/${opcodeSessionId}/event`, {
					signal: session.sseAbort.signal,
				});
				const reader = res.body?.getReader();
				if (!reader) {
					this.markDone(session);
					return;
				}

				const decoder = new TextDecoder();
				let buf = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						// SSE stream closed — session is done
						this.markDone(session);
						break;
					}

					buf += decoder.decode(value, { stream: true });
					const lines = buf.split("\n");
					buf = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						try {
							const raw = JSON.parse(line.slice(6)) as { type: string; data?: unknown };
							this.handleSseEvent(session, raw);
						} catch {
							// Skip unparseable lines
						}
					}
				}
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					// Unexpected error — treat as done
					this.markDone(session);
				}
			}
		})();
	}

	private handleSseEvent(session: ServeSession, raw: { type: string; data?: unknown }): void {
		switch (raw.type) {
			case "session.next.step.started":
				session.stepActive = true;
				this.resetIdleTimer(session, IDLE_TIMEOUT_STEP_MS);
				break;
			case "session.next.step.ended":
				session.stepActive = false;
				this.resetIdleTimer(session, IDLE_TIMEOUT_ACTIVE_MS);
				break;
			case "session.next.prompt.admitted":
			case "session.next.prompted":
				// Initial admit/queue events — keep initial timer
				break;
			default:
				// Any other event resets to appropriate timeout
				this.resetIdleTimer(
					session,
					session.stepActive ? IDLE_TIMEOUT_STEP_MS : IDLE_TIMEOUT_INITIAL_MS,
				);
				break;
		}

		const event = parseServeEvent(raw);
		if (event) {
			session.events.push(event);
			session.notifyStream?.();
		}
	}

	private markDone(session: ServeSession): void {
		clearTimeout(session.idleTimer ?? undefined);
		session.idleTimer = null;
		if (!session.done) {
			session.done = true;
			session.notifyStream?.();
		}
	}

	private resetIdleTimer(session: ServeSession, delayMs: number): void {
		clearTimeout(session.idleTimer ?? undefined);
		session.idleTimer = setTimeout(() => {
			this.markDone(session);
		}, delayMs);
	}

	/**
	 * Send a follow-up prompt for the return gate (re-engage after block).
	 * Resets `session.done = false` and restarts the idle timer.
	 */
	private async sendFollowUpPrompt(session: ServeSession, forceMessage: string): Promise<void> {
		if (!this.serverUrl) return;
		session.done = false;
		// Restart idle timer for the new turn
		this.resetIdleTimer(session, IDLE_TIMEOUT_INITIAL_MS);
		try {
			await this.fetchFn(`${this.serverUrl}/api/session/${session.opcodeSessionId}/prompt`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: { text: forceMessage }, resume: true }),
			});
		} catch {
			// Prompt delivery failed — allow session to proceed to end
			this.markDone(session);
		}
	}

	private async checkReturnGate(session: ServeSession): Promise<string | null> {
		const gate = session.returnGate;
		if (!gate) return null;
		// Exhaust budget → approve; avoids infinite forced loops.
		if (session.gateForceCount >= gate.forceBudget) return null;

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

	private finishSession(sessionId: string, session: ServeSession): SessionResult {
		clearTimeout(session.idleTimer ?? undefined);
		this.forceReturnCounts.set(session.configSessionId, session.gateForceCount);
		this.sessions.delete(sessionId);
		return { outcome: "completed", tokenUsage: { byTier: {} } };
	}

	/** Kill the shared serve process (called when no sessions remain, or at disposal). */
	killServer(): void {
		if (this.serverProcess?.pid !== undefined) {
			try {
				this.killFn(this.serverProcess.pid, "SIGTERM");
			} catch {
				// Already exited
			}
		}
		this.serverProcess = undefined;
		this.serverUrl = undefined;
		this.serverReadyPromise = undefined;
	}
}
