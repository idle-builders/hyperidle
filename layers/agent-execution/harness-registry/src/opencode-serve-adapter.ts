/**
 * OpenCodeServeAdapter — drives `opencode serve --port 0` (HTTP serve mode).
 *
 * The serve protocol keeps a long-lived HTTP server and supports delivering
 * messages into a running session via POST /session/{id}/prompt_async —
 * the feature `opencode run` cannot provide.
 *
 * API: OpenCode stable HTTP API.
 *   Session create:  POST /session?directory={path}
 *   Send prompt:     POST /session/{id}/prompt_async?directory={path}
 *   Event stream:    GET  /event?directory={path}  (global SSE, filter by sessionID)
 *   Abort:           POST /session/{id}/abort?directory={path}
 *
 * Done detection: session.idle event (per sessionID); session.error → done.
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
	/** The sandbox directory this session runs in (passed as ?directory= on every call). */
	readonly sandboxPath: string;
	done: boolean;
	/** True when the session ended abnormally (server crash, SSE abort, or model/API error). */
	crashed: boolean;
	readonly events: HarnessEvent[];
	notifyStream: (() => void) | null;
	resolveStop: ((result: SessionResult) => void) | null;
	readonly returnGate?: ReturnGate;
	gateForceCount: number;
	readonly configSessionId: string;
	readonly modelTier: SessionConfig["modelTier"];
	readonly sseAbort: AbortController;
	fallbackTimer: ReturnType<typeof setTimeout> | null;
	/** messageIDs confirmed to be from the assistant role. */
	readonly assistantMessageIds: Set<string>;
	/** Latest full text per text-part ID (text parts carry cumulative text). */
	readonly latestPartText: Map<string, string>;
	/** Part IDs for which a tool_call event has already been emitted. */
	readonly emittedToolPartIds: Set<string>;
}

/** Injectable dependencies (for unit tests). */
interface OpenCodeServeAdapterDeps {
	readonly spawnFn?: typeof spawn;
	readonly killFn?: (pid: number, signal: NodeJS.Signals) => void;
	readonly fetchFn?: typeof globalThis.fetch;
	/** Override the per-adapter XDG config dir (for tests). */
	readonly xdgConfigHome?: string;
}

/**
 * Fallback timeout: if session.idle never arrives (e.g. opencode hangs),
 * mark the session done after this interval.
 */
const FALLBACK_TIMEOUT_MS = 120_000;

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
 * Map a message.part.updated part to a HarnessEvent.
 * Returns null if the part should not emit an event (wrong role, no new content, duplicate tool).
 *
 * @lore: cumulative text parts — diff against last seen per part id to emit deltas; only assistant messages emit text to avoid echoing user prompts
 */
function parsePartEvent(session: ServeSession, part: Record<string, unknown>): HarnessEvent | null {
	const partId = typeof part.id === "string" ? part.id : "";
	const messageId = typeof part.messageID === "string" ? part.messageID : "";

	if (part.type === "text") {
		// Only emit text from assistant messages — user prompts appear as text parts too.
		if (!(messageId && session.assistantMessageIds.has(messageId))) return null;
		const text = typeof part.text === "string" ? part.text : "";
		const prev = session.latestPartText.get(partId) ?? "";
		if (text.length <= prev.length) return null;
		const delta = text.slice(prev.length);
		session.latestPartText.set(partId, text);
		return { type: "completion", text: delta };
	}

	if (part.type === "tool") {
		// Emit once per tool part (state may update multiple times: pending → running → completed).
		if (session.emittedToolPartIds.has(partId)) return null;
		session.emittedToolPartIds.add(partId);
		const state = part.state as Record<string, unknown> | undefined;
		const toolName = typeof part.tool === "string" ? part.tool : "unknown";
		const args =
			state?.input !== null && typeof state?.input === "object"
				? (state.input as Record<string, unknown>)
				: {};
		return { type: "tool_call", toolName, args };
	}

	return null;
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
	private readonly xdgConfigHome: string;
	/** Counts sessions currently alive; auto-kills server when it drops to zero. */
	private activeSessionCount = 0;

	constructor(deps?: OpenCodeServeAdapterDeps) {
		this.spawnFn = deps?.spawnFn ?? spawn;
		this.killFn = deps?.killFn ?? ((pid, signal) => process.kill(pid, signal));
		this.fetchFn = deps?.fetchFn ?? globalThis.fetch.bind(globalThis);

		// @lore: XDG_CONFIG_HOME isolates opencode config — prevents user's global ~/.config/opencode plugins from loading into sessions
		this.xdgConfigHome =
			deps?.xdgConfigHome ?? fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-opencode-xdg-cfg-"));
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		const serverUrl = await this.ensureServer();
		const params = new URLSearchParams({ directory: config.sandboxPath });

		// Create session
		const createRes = await this.fetchFn(`${serverUrl}/session?${params}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		if (!createRes.ok) {
			throw new Error(`opencode /session create failed: ${createRes.status}`);
		}
		const createData = (await createRes.json()) as { id: string };
		const opcodeSessionId = createData.id;

		// Deliver the opening instruction
		const instruction = config.instruction?.trim() || "proceed";
		const model = parseModel(config.selectedModel);
		const promptBody: Record<string, unknown> = {
			parts: [{ type: "text", text: instruction }],
		};
		// @lore: prompt_async model uses modelID (not id); session create uses id
		if (model) {
			promptBody.model = { providerID: model.providerID, modelID: model.id };
		}
		const promptRes = await this.fetchFn(
			`${serverUrl}/session/${opcodeSessionId}/prompt_async?${params}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(promptBody),
			},
		);
		if (!promptRes.ok) {
			throw new Error(
				`opencode /session/${opcodeSessionId}/prompt_async failed: ${promptRes.status}`,
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
			sandboxPath: config.sandboxPath,
			done: false,
			crashed: false,
			events: [],
			notifyStream: null,
			resolveStop: null,
			returnGate,
			gateForceCount: 0,
			configSessionId: config.sessionId,
			modelTier: config.modelTier,
			sseAbort,
			fallbackTimer: null,
			assistantMessageIds: new Set(),
			latestPartText: new Map(),
			emittedToolPartIds: new Set(),
		};

		this.sessions.set(sessionId, session);
		this.activeSessionCount++;

		// Subscribe to the global SSE in background; session.idle signals done.
		void this.subscribeSse(session, serverUrl);

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

		// Abort the running session and SSE
		if (this.serverUrl) {
			const params = new URLSearchParams({ directory: session.sandboxPath });
			void this.fetchFn(`${this.serverUrl}/session/${session.opcodeSessionId}/abort?${params}`, {
				method: "POST",
			});
		}
		session.sseAbort.abort();
		clearTimeout(session.fallbackTimer ?? undefined);
		session.done = true;
		session.notifyStream?.();

		return new Promise<SessionResult>((resolve) => {
			resolve(this.finishSession(handle.sessionId, session));
		});
	}

	async deliver(handle: SessionHandle, text: string): Promise<"delivered" | "unsupported"> {
		const session = this.sessions.get(handle.sessionId);
		if (!session || session.done || !this.serverUrl) return "unsupported";

		const params = new URLSearchParams({ directory: session.sandboxPath });
		try {
			const res = await this.fetchFn(
				`${this.serverUrl}/session/${session.opcodeSessionId}/prompt_async?${params}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					// Sending prompt_async to a busy session steers the current run.
					body: JSON.stringify({ parts: [{ type: "text", text }] }),
				},
			);
			if (res.ok) return "delivered";
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
			// @lore: sdk-inprocess channel — gate runs entirely in streamEvents(); no file hook written to sandbox; no opencode plugin needed
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
				// @lore: opencode serve announces the port on stdout; broader regex matches the actual binary output format
				const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(stdoutBuf);
				if (m?.[1]) {
					this.serverUrl = m[1];
					child.stdout?.off("data", onStdout);
					resolve(this.serverUrl);
				}
			};
			child.stdout?.on("data", onStdout);

			child.on("exit", () => {
				this.serverProcess = undefined;
				this.serverUrl = undefined;
				this.serverReadyPromise = undefined;
				// Crash any sessions still running — they can no longer make progress.
				for (const session of this.sessions.values()) {
					if (!session.done) {
						session.crashed = true;
						session.sseAbort.abort();
						this.markDone(session);
					}
				}
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
		// @lore: XDG_DATA_HOME passed through so opencode finds the user's auth.json at its real path
		const allowlist = ["PATH", "HOME", "LANG", "OPENROUTER_API_KEY", "XDG_DATA_HOME"];
		const env: Record<string, string> = {};
		for (const key of allowlist) {
			const val = process.env[key];
			if (val !== undefined) env[key] = val;
		}
		// Isolated config dir: prevents user's global ~/.config/opencode plugins from loading.
		env.XDG_CONFIG_HOME = this.xdgConfigHome;
		// @lore: OPENCODE_PERMISSION — without it opencode asks before each tool call; non-TTY auto-rejects; {"*":"allow"} grants headless approval
		env.OPENCODE_PERMISSION = '{"*":"allow"}';
		return env;
	}

	private subscribeSse(session: ServeSession, serverUrl: string): Promise<void> {
		// Fallback timer: if session.idle never arrives, mark done after the deadline.
		// @lore: unref() prevents the safety timer from keeping Node alive when all real work is done
		if (!session.done) {
			session.fallbackTimer = setTimeout(() => {
				this.markDone(session);
			}, FALLBACK_TIMEOUT_MS);
			session.fallbackTimer.unref();
		}

		const params = new URLSearchParams({ directory: session.sandboxPath });

		return (async () => {
			try {
				const res = await this.fetchFn(`${serverUrl}/event?${params}`, {
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
						// SSE stream closed — treat as done (not crashed unless already flagged).
						this.markDone(session);
						break;
					}

					buf += decoder.decode(value, { stream: true });
					const lines = buf.split("\n");
					buf = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						try {
							const raw = JSON.parse(line.slice(6)) as {
								type: string;
								properties?: unknown;
							};
							this.handleSseEvent(session, raw);
						} catch {
							// Skip unparseable lines
						}
					}
				}
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					// SSE stream failed unexpectedly — session cannot continue.
					session.crashed = true;
					this.markDone(session);
				}
			}
		})();
	}

	private handleSseEvent(session: ServeSession, raw: { type: string; properties?: unknown }): void {
		const props = (raw.properties ?? {}) as Record<string, unknown>;

		// Filter: skip events from other sessions (global SSE carries all sessions).
		if (props.sessionID !== undefined && props.sessionID !== session.opcodeSessionId) return;

		switch (raw.type) {
			case "session.idle":
				// @lore: session.idle is the authoritative done signal in the stable opencode API
				this.markDone(session);
				break;
			case "session.error": {
				// Model/API failure (auth, context overflow, etc.) — session cannot continue.
				session.crashed = true;
				const errorObj = props.error as Record<string, unknown> | undefined;
				const errorData = errorObj?.data as Record<string, unknown> | undefined;
				const errorName =
					typeof errorObj?.name === "string" ? errorObj.name : "OpenCodeSessionError";
				const errorMsg = typeof errorData?.message === "string" ? errorData.message : errorName;
				session.events.push({ type: "error", message: errorMsg, code: errorName });
				this.markDone(session);
				break;
			}
			case "message.updated": {
				const info = props.info as Record<string, unknown> | undefined;
				if (info?.role === "assistant" && typeof info.id === "string") {
					session.assistantMessageIds.add(info.id);
				}
				break;
			}
			case "message.part.updated": {
				const part = props.part as Record<string, unknown> | undefined;
				if (!part) break;
				const event = parsePartEvent(session, part);
				if (event) {
					session.events.push(event);
					session.notifyStream?.();
				}
				break;
			}
			default:
				// All other event types ignored.
				break;
		}
	}

	private markDone(session: ServeSession): void {
		clearTimeout(session.fallbackTimer ?? undefined);
		session.fallbackTimer = null;
		if (!session.done) {
			session.done = true;
			session.notifyStream?.();
		}
	}

	/**
	 * Send a follow-up prompt for the return gate (re-engage after block).
	 * Resets `session.done = false` and restarts the fallback timer.
	 */
	private async sendFollowUpPrompt(session: ServeSession, forceMessage: string): Promise<void> {
		if (!this.serverUrl) return;
		session.done = false;
		// Restart fallback timer for the new turn.
		session.fallbackTimer = setTimeout(() => {
			this.markDone(session);
		}, FALLBACK_TIMEOUT_MS);
		session.fallbackTimer.unref();
		const params = new URLSearchParams({ directory: session.sandboxPath });
		try {
			await this.fetchFn(
				`${this.serverUrl}/session/${session.opcodeSessionId}/prompt_async?${params}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ parts: [{ type: "text", text: forceMessage }] }),
				},
			);
		} catch {
			// Prompt delivery failed — allow session to proceed to end.
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
		clearTimeout(session.fallbackTimer ?? undefined);
		this.forceReturnCounts.set(session.configSessionId, session.gateForceCount);
		this.sessions.delete(sessionId);
		// Decrement active count; auto-kill the shared server when no sessions remain.
		if (this.activeSessionCount > 0) this.activeSessionCount--;
		if (this.activeSessionCount === 0) this.killServer();
		return { outcome: session.crashed ? "crashed" : "completed", tokenUsage: { byTier: {} } };
	}

	/** Kill the shared serve process (called when no sessions remain, or at disposal). */
	killServer(): void {
		if (this.serverProcess?.pid !== undefined) {
			try {
				// @lore: SIGKILL not SIGTERM — opencode serve (Bun runtime) traps SIGTERM internally but never exits; SIGKILL is the only reliable kill.
				this.killFn(this.serverProcess.pid, "SIGKILL");
			} catch {
				// Already exited
			}
		}
		this.serverProcess = undefined;
		this.serverUrl = undefined;
		this.serverReadyPromise = undefined;
	}
}
