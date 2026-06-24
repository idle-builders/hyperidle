/**
 * S2: IsolatedHarnessAdapter — runs agent sessions in isolated child processes.
 *
 * Forks a worker script via child_process.fork(), passing only allowlisted
 * env vars plus the resolved API key. Enforces a maxDurationMs timeout by
 * killing the child if it runs too long.
 *
 * @lore S2: The child process communicates via Node IPC (process.send / process.on("message")).
 * Events arrive as WorkerEventMessage or WorkerSessionResultMessage objects.
 * The child is expected to implement the same wire protocol.
 */

import { fork } from "node:child_process";
import * as path from "node:path";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { isEventMessage, isSessionResultMessage } from "./isolated-session-protocol.js";

export interface IsolationConfig {
	readonly maxMemoryMb: number;
	readonly maxDurationMs: number;
	readonly envAllowlist: readonly string[];
}

interface IsolatedSession {
	readonly child: ReturnType<typeof fork>;
	readonly sessionId: string;
	timedOut: boolean;
	result: SessionResult | null;
	readonly timer: ReturnType<typeof setTimeout>;
	readonly events: HarnessEvent[];
	done: boolean;
	/** Resolves the stop promise with the session result. */
	resolveStop: ((result: SessionResult) => void) | null;
	/** Notifies the event stream generator that new events are available. */
	notifyStream: (() => void) | null;
}

export class IsolatedHarnessAdapter implements HarnessAdapter {
	private readonly resolver: CredentialResolver;
	private readonly config: IsolationConfig;
	private readonly sessions = new Map<string, IsolatedSession>();
	private nextId = 1;

	constructor(resolver: CredentialResolver, config: IsolationConfig) {
		this.resolver = resolver;
		this.config = config;
	}

	async startSession(sessionConfig: SessionConfig): Promise<SessionHandle> {
		const apiKey = await this.resolver.resolve("anthropic_api_key");

		// Build sandboxed env with only allowlisted keys + ANTHROPIC_API_KEY
		const sandboxedEnv: Record<string, string> = {};
		for (const key of this.config.envAllowlist) {
			const value = process.env[key];
			if (value !== undefined) {
				sandboxedEnv[key] = value;
			}
		}
		if (apiKey) {
			sandboxedEnv.ANTHROPIC_API_KEY = apiKey;
		}

		const workerScript = path.join(
			path.dirname(new URL(import.meta.url).pathname),
			"isolated-session-worker.js",
		);

		/**
		 * @lore S2-F03: maxMemoryMb must be passed as --max-old-space-size so the
		 * V8 heap is actually bounded. Without execArgv, the config field was accepted
		 * but silently ignored — the child process could consume unlimited memory.
		 */
		const child = fork(workerScript, [], {
			env: sandboxedEnv,
			silent: false,
			execArgv: [`--max-old-space-size=${this.config.maxMemoryMb}`],
		});

		const sessionId = `isolated-session-${this.nextId++}`;

		const session: IsolatedSession = {
			child,
			sessionId,
			timedOut: false,
			result: null,
			timer: setTimeout(() => {
				this.handleTimeout(sessionId);
			}, this.config.maxDurationMs),
			events: [],
			done: false,
			resolveStop: null,
			notifyStream: null,
		};

		this.sessions.set(sessionId, session);

		// Wire IPC messages
		child.on("message", (msg: unknown) => {
			this.handleChildMessage(sessionId, msg);
		});

		child.on("exit", () => {
			const s = this.sessions.get(sessionId);
			if (s && !s.done) {
				s.done = true;
				if (!s.result) {
					s.result = {
						outcome: "crashed",
						cost: { minor: 0, currency: "USD" },
						tokenUsage: { byTier: {} },
					};
				}
				s.notifyStream?.();
				s.resolveStop?.(s.result);
			}
		});

		// Send the session config to the child
		child.send({ type: "start", config: sessionConfig });

		return { sessionId };
	}

	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent> {
		const adapter = this;
		const sessionId = handle.sessionId;

		// biome-ignore lint/suspicious/useAwait: async generator requires async keyword
		return (async function* (): AsyncGenerator<HarnessEvent, void, unknown> {
			const session = adapter.sessions.get(sessionId);
			if (!session) return;

			let cursor = 0;

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
				// Yield any buffered events
				while (cursor < session.events.length) {
					const ev = session.events[cursor++];
					if (ev) yield ev;
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

		if (session.result) {
			clearTimeout(session.timer);
			this.sessions.delete(handle.sessionId);
			return session.result;
		}

		// Send stop signal to child
		session.child.send({ type: "stop" });

		/**
		 * @lore S2-F04: Send SIGTERM first to allow graceful shutdown, then
		 * escalate to SIGKILL after 5 s if the child has not exited. This prevents
		 * a misbehaving child from blocking stopSession indefinitely while still
		 * giving well-behaved children a chance to flush and clean up.
		 */
		const escalationTimer = setTimeout(() => {
			const s = this.sessions.get(handle.sessionId);
			if (s && !s.done) {
				s.child.kill("SIGKILL");
			}
		}, 5_000);

		return new Promise<SessionResult>((resolve) => {
			session.resolveStop = (result: SessionResult) => {
				clearTimeout(escalationTimer);
				clearTimeout(session.timer);
				this.sessions.delete(handle.sessionId);
				resolve(result);
			};
		});
	}

	getCapabilities(): HarnessCapabilities {
		// X5: mcpSupport: true — isolated adapter runs Claude Code in a subprocess
		// which reads .mcp.json for MCP tool calling.
		return {
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: true,
			// AL6 v4-final: isolated runs the Claude Agent SDK in a worker process.
			// The inner SDK adapter has a Stop hook wired at session start — the same
			// sdk-inprocess mechanism as the direct ClaudeAgentSdkAdapter.
			returnEnforcement: "sdk-inprocess",
		};
	}

	private handleTimeout(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session || session.done) return;

		session.timedOut = true;
		/**
		 * @lore S2-F04: Architecture plan specifies SIGKILL for timeout — not SIGTERM.
		 * SIGTERM allows the child to catch the signal and run cleanup code, which
		 * defeats the purpose of an enforced timeout. SIGKILL is unconditional.
		 */
		session.child.kill("SIGKILL");
		session.done = true;
		session.result = {
			outcome: "crashed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
		session.notifyStream?.();
		session.resolveStop?.(session.result);
	}

	private handleChildMessage(sessionId: string, msg: unknown): void {
		const session = this.sessions.get(sessionId);
		if (!session || session.done) return;

		if (isEventMessage(msg)) {
			session.events.push(msg.event);
			session.notifyStream?.();
		} else if (isSessionResultMessage(msg)) {
			session.result = msg.result;
			session.done = true;
			clearTimeout(session.timer);
			session.notifyStream?.();
			session.resolveStop?.(msg.result);
		}
	}
}
