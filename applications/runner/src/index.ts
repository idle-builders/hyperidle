/**
 * The agents' runner as its own program. Talks to the HyperIdle server over
 * real HTTP (actions) and WebSocket (inbox nudges). Owns its own runner-db
 * and an HTTP server for the MCP tool bridge.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type ServerType, serve } from "@hono/node-server";
import { type AgentExecutionBoot, bootAgentExecution } from "@hyperidle/agent-execution";
import {
	type ActionToolDeclaration,
	type AgentRunner,
	actionToolsThroughDoor,
	buildRunOrchestrationComposition,
	createAgentRunner,
	createCoreDoor,
} from "@hyperidle/agent-orchestration";
import { createLogger } from "@hyperidle/diagnostics";
import type { ActionResult, DocumentRow, DocumentView } from "@hyperidle/domain-model";
import {
	DOCUMENT_ACTIONS,
	PLATFORM_ACTIONS,
	SESSION_ACTIONS,
	TASK_ACTIONS,
	THREAD_ACTIONS,
	USER_ACTIONS,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { applyRunnerMigrations, createPgliteRunnerDb, type RunnerDb } from "@hyperidle/runner-db";
import { Hono } from "hono";
import { WebSocket } from "ws";

export interface StartRunnerDeps {
	/** The server this runner talks to. */
	readonly serverUrl: string;
	/** The API key this person uses to identify themselves to the server. */
	readonly personKey: string;
	/** Directory where the runner stores its PGlite database and logs. */
	readonly dataDir: string;
	/** Spaces directory for agent sandboxes. When omitted, HYPERIDLE_SPACES_DIR is used. */
	readonly spacesDir?: string;
	/** Injected agent-execution boot — for tests only. When omitted, the real one is booted. */
	readonly agentExecutionBoot?: AgentExecutionBoot;
	/** How often to sweep for new agents / missed inbox rows. Default 30 s. */
	readonly sweepMs?: number;
}

export interface RunnerHandle {
	/** Explicitly take a specific agent (clears moved-away). */
	takeAgent(agentId: string): Promise<void>;
	/** All agent ids currently held by this runner. */
	heldAgentIds(): readonly string[];
	/** Agent ids that were 401'd — moved away. */
	movedAwayAgentIds(): readonly string[];
	/** Start the runner (take agents, begin sweeping). No-op if already started. */
	start(): Promise<void>;
	/** Stop the runner and clean up. */
	stop(): Promise<void>;
	/** The runner's own DB — for test assertions about session requests. */
	runnerDb: RunnerDb;
}

const logger = createLogger({ pkg: "runner" });

/** Resolve a free loopback port for the runner's own MCP bridge server. */
function resolveFreePort(): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			const port = typeof addr === "object" && addr !== null ? addr.port : 0;
			probe.close((err) => (err ? reject(err) : resolve(port)));
		});
	});
}

// @lore: runner migrations path — HYPERIDLE_RUNNER_DRIZZLE_DIR set by main.ts; in packaged app → Resources/runner-drizzle; in Node.js walks up __dirname.
function resolveMigrationsFolder(): string {
	const envDir = process.env.HYPERIDLE_RUNNER_DRIZZLE_DIR;
	if (envDir) return envDir;
	const Dirname =
		typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
	// From dist/ or src/ up to the package root (applications/runner), then to the repo root.
	return path.resolve(Dirname, "..", "..", "..", "framework", "runner-db", "drizzle");
}

/** Build the full action catalog from domain-model declarations. */
function buildActionCatalog(): readonly ActionToolDeclaration[] {
	return Object.values({
		...DOCUMENT_ACTIONS,
		...TASK_ACTIONS,
		...THREAD_ACTIONS,
		...USER_ACTIONS,
		...SESSION_ACTIONS,
		...PLATFORM_ACTIONS,
	}).map((decl) => ({
		name: decl.name,
		description: decl.sentence,
		inputSchema: decl.input,
	}));
}

/** Subscribe to `user:<agentId>` nudges over a real WebSocket connection. */
function createWsSubscribeInbox(
	serverUrl: string,
): (agentId: string, agentKey: string, onNudge: () => void) => () => void {
	return (agentId: string, agentKey: string, onNudge: () => void): (() => void) => {
		const wsBase = serverUrl.replace(/^http/, "ws");
		let ws: WebSocket | null = null;
		let disposed = false;
		let pingTimer: ReturnType<typeof setInterval> | undefined;

		function connect(): void {
			if (disposed) return;
			// Get a WS upgrade token using the agent's key.
			fetch(`${serverUrl}/api/auth/ws-token`, {
				method: "POST",
				headers: { "X-API-Key": agentKey },
			})
				.then((res) => {
					if (!res.ok) {
						logger.warn("ws-token request failed; will retry on next sweep", {
							agentId,
							status: res.status,
						});
						return null;
					}
					return res.json() as Promise<{ token?: string }>;
				})
				.then((json) => {
					if (disposed || !json?.token) return;
					const sock = new WebSocket(`${wsBase}/api/ws?token=${encodeURIComponent(json.token)}`);
					ws = sock;
					sock.on("open", () => {
						sock.send(JSON.stringify({ type: "subscribe", topic: `user:${agentId}` }));
						// Keep-alive ping every 30 s.
						pingTimer = setInterval(() => {
							if (sock.readyState === WebSocket.OPEN) sock.ping();
						}, 30_000);
						if (pingTimer.unref) pingTimer.unref();
					});
					sock.on("message", (data) => {
						try {
							const msg = JSON.parse(String(data)) as {
								type?: string;
								topic?: string;
							};
							if (msg.type === "update" && msg.topic === `user:${agentId}`) {
								onNudge();
							}
						} catch {
							// ignore non-JSON
						}
					});
					sock.on("close", () => {
						clearInterval(pingTimer);
						ws = null;
						// Reconnect after a short delay unless disposed.
						if (!disposed) setTimeout(connect, 2_000);
					});
					sock.on("error", () => {
						// close event follows; nothing to do here.
					});
				})
				.catch((err: unknown) => {
					logger.warn("ws-token fetch failed; will retry", {
						agentId,
						error: err instanceof Error ? err.message : String(err),
					});
				});
		}

		connect();

		return (): void => {
			disposed = true;
			clearInterval(pingTimer);
			ws?.terminate();
			ws = null;
		};
	};
}

/** Start the runner program. Returns a handle to manage it. */
export async function startRunner(deps: StartRunnerDeps): Promise<RunnerHandle> {
	if (deps.spacesDir) {
		process.env.HYPERIDLE_SPACES_DIR = deps.spacesDir;
	}

	// Boot runner-db — always create our own.
	const runnerDbDir = path.join(deps.dataDir, "runner-pg");
	fs.mkdirSync(runnerDbDir, { recursive: true });
	const migrationsFolder = resolveMigrationsFolder();
	await applyRunnerMigrations(runnerDbDir, migrationsFolder);
	const ownedRunnerDbHandle = await createPgliteRunnerDb(runnerDbDir);
	const runnerDb: RunnerDb = ownedRunnerDbHandle.db;

	// Boot agent-execution (harness discovery + MCP bridge on the runner's own server).
	const mcpPort = await resolveFreePort();
	const mcpBaseUrl = `http://127.0.0.1:${mcpPort}`;
	const agentExecution =
		deps.agentExecutionBoot ?? (await bootAgentExecution({ topology: "local", mcpBaseUrl }));

	// Runner's own MCP bridge HTTP server.
	// @lore: bridge /api prefix — mountMcpRouter places routes at /mcp/:token; config URLs use /api/mcp/:token; sub-router at /api aligns the paths.
	const bridgeApp = new Hono();
	const bridgeApi = new Hono();
	agentExecution.mountMcpRouter(bridgeApi);
	bridgeApp.route("/api", bridgeApi);

	const bridgeServer: ServerType = serve({
		fetch: bridgeApp.fetch,
		port: mcpPort,
		hostname: "127.0.0.1",
	});
	await new Promise<void>((resolve, reject) => {
		if (bridgeServer.listening) {
			resolve();
			return;
		}
		function settle(err?: Error): void {
			bridgeServer.removeListener("listening", onListen);
			bridgeServer.removeListener("error", onErr);
			err ? reject(err) : resolve();
		}
		function onListen(): void {
			settle();
		}
		function onErr(e: Error): void {
			settle(e);
		}
		bridgeServer.once("listening", onListen);
		bridgeServer.once("error", onErr);
	});

	// Real network door.
	const apiBase = `${deps.serverUrl.replace(/\/$/, "")}/api`;
	const door = createCoreDoor((req: Request) => fetch(req), apiBase);

	// WS-based subscribeInbox: one connection per agent, using the agent's key.
	const wsSubscribe = createWsSubscribeInbox(deps.serverUrl);
	const unsubscribers = new Map<string, () => void>();

	// Forward reference: keyFor is called inside tool handlers and subscribeInbox
	// only after runner is fully initialized (activateAgent sets the key first).
	let runner!: AgentRunner;

	// Build the action catalog from domain-model declarations; tools call the door as the agent.
	// @lore: runner action catalog — built from domain-model declarations; every action goes through the door to the server.
	const catalog = buildActionCatalog();
	const coreTools = actionToolsThroughDoor(catalog, door, (id) => runner.keyFor(id));

	// Document tools call the door as the session's agent, carrying the run context header.
	const editDocument = (
		caller: {
			readonly actor: string;
			readonly sessionId: string;
			readonly taskId: string | null;
			readonly threadId: string | null;
		},
		input: unknown,
	): Promise<ActionResult<DocumentView>> => {
		const key = runner.keyFor(caller.actor);
		if (!key)
			return Promise.resolve({
				ok: false as const,
				problems: [{ code: "no_key" as const, message: "This agent has no key on this runner." }],
			});
		return door.call<DocumentView>(key, "edit_document", input, {
			sessionId: caller.sessionId,
			taskId: caller.taskId,
			threadId: caller.threadId,
		});
	};

	const searchDocuments = (
		caller: { readonly actor: string },
		input: unknown,
	): Promise<ActionResult<readonly DocumentRow[]>> => {
		const key = runner.keyFor(caller.actor);
		if (!key)
			return Promise.resolve({
				ok: false as const,
				problems: [{ code: "no_key" as const, message: "This agent has no key on this runner." }],
			});
		return door.call<readonly DocumentRow[]>(key, "search_documents", input);
	};

	// Run orchestration runtime: the session-request poller that runs agent sessions.
	// Uses runner-db only — no core DB needed here.
	const eventBus = new EventBus();
	const composition = buildRunOrchestrationComposition({
		harnessRuntime: agentExecution.adapters.harnessRuntime,
		returnStatusTool: agentExecution.adapters.returnStatusTool,
		actionTools: () => coreTools,
		editDocument,
		searchDocuments,
	});
	const runRuntime = await composition.startRuntime(
		composition.runtimeDeps(runnerDb, eventBus, {
			runtime: {
				db: runnerDb,
				eventBus,
				adapterPool: agentExecution.adapters.pool,
			},
		}),
	);

	// Agent runner — forward reference: keyFor is called inside subscribeInbox which is
	// invoked only after runner is fully initialized (activateAgent sets the key first).
	runner = createAgentRunner({
		db: runnerDb,
		eventBus,
		door,
		personKey: () => deps.personKey,
		...(deps.sweepMs !== undefined ? { sweepMs: deps.sweepMs } : {}),
		subscribeInbox: (agentId, onNudge) => {
			const key = runner.keyFor(agentId);
			if (!key) {
				// Key not yet known — no WS subscription until next activation.
				return (): void => undefined;
			}
			const off = wsSubscribe(agentId, key, onNudge);
			unsubscribers.set(agentId, off);
			return () => {
				off();
				unsubscribers.delete(agentId);
			};
		},
	});

	let started = false;
	let stopping = false;

	async function doStart(): Promise<void> {
		if (started) return;
		started = true;
		await runner.start();
	}

	return {
		takeAgent: (agentId) => runner.takeAgent(agentId),
		heldAgentIds: () => runner.heldAgentIds(),
		movedAwayAgentIds: () => runner.movedAwayAgentIds(),
		start: doStart,
		runnerDb,
		async stop() {
			if (stopping) return;
			stopping = true;
			await runner.stop();
			await runRuntime.dispose();
			agentExecution.dispose();
			for (const off of unsubscribers.values()) off();
			unsubscribers.clear();
			await new Promise<void>((resolve, reject) => {
				bridgeServer.close((err) => (err ? reject(err) : resolve()));
			});
			await ownedRunnerDbHandle.close();
		},
	};
}
