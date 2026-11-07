/**
 * Network test world for the agents' runner integration tests.
 *
 * Boots a real `@hyperidle/remote-server` on a free port and starts the runner
 * talking to it via real HTTP and WebSocket. Scripted execution is injected via
 * `agentExecutionBoot` — the same seam the desktop uses, with a fake adapter pool
 * whose `select()` returns a scripted harness program.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentExecutionBoot } from "@hyperidle/agent-execution";
import { type CoreDoor, createCoreDoor } from "@hyperidle/agent-orchestration";
import { applyMigrations, type HyperIdleDb } from "@hyperidle/db";
import { createServer } from "@hyperidle/remote-server/create-server";
import { createAndMigrateRunnerDb, type RunnerDb, type RunnerDbHandle } from "@hyperidle/runner-db";
import { vi } from "vitest";
import { type RunnerHandle, startRunner } from "../index.js";

// ---- Script types ----

/** One run of the stand-in program: which session, the tools, and a prompt. */
export interface ScriptedRun {
	readonly sessionId: string;
	/** 0 for the first run, then 1, 2… */
	readonly index: number;
	/** The assembled prompt text the harness was given. */
	readonly prompt: string;
	/** Call a tool by name as this agent session. */
	call(tool: string, args: unknown): Promise<unknown>;
}

export type RunScript = (run: ScriptedRun) => Promise<void>;

/** The simplest script: send one "pong" message. */
export const answersPong: RunScript = async (run) => {
	await run.call("send_message", { text: "pong" });
};

// ---- Network world ----

export interface RunnerWorldOptions {
	/** Intercept door requests. Return a Response to override, null to pass through. */
	fetchInterceptor?: (req: Request) => Promise<Response | null>;
}

export interface RunnerWorld {
	/** Start the runner. Some tests delay start to test "runner off" behavior. */
	readonly runner: Pick<RunnerHandle, "start" | "stop">;
	/** Door for the test to act as the person — calls the server directly. */
	readonly door: CoreDoor;
	/**
	 * Trigger a fake inbox nudge for the given agent. In the network world
	 * the runner's sweep timer handles retries, so this is a no-op; the method
	 * exists so test code ported from the in-process world compiles unchanged.
	 */
	nudge(topic: string, envelope: unknown): void;
	/** Every sessionId the scripted program was run for, in order. */
	readonly runs: readonly string[];
	/** The runner's own DB — exposed for test assertions about sessions/requests. */
	readonly runnerDb: RunnerDb;
	stop(): Promise<void>;
}

// ---- Scripted execution boot ----

interface ToolRegistryLike {
	invoke(name: string, rawArgs: unknown): Promise<unknown>;
}

function makeScriptedBoot(script: RunScript, runs: string[]): AgentExecutionBoot {
	const registries = new Map<string, ToolRegistryLike>();
	const enforcementRegistry = {
		register: vi.fn(),
		get: vi.fn(),
		incrementForce: vi.fn(),
		unregister: vi.fn(),
	};

	const program = {
		startSession: async (config: {
			sessionId: string;
			assembledPrompt?: string;
			instruction?: string;
		}) => {
			const index = runs.push(config.sessionId) - 1;
			const registry = registries.get(config.sessionId);
			if (!registry) throw new Error(`no tool registry for session ${config.sessionId}`);
			await script({
				sessionId: config.sessionId,
				index,
				prompt: [config.assembledPrompt, config.instruction].filter(Boolean).join("\n"),
				call: (tool, args) => registry.invoke(tool, args),
			});
			return { sessionId: config.sessionId };
		},
		streamEvents: () => ({
			[Symbol.asyncIterator]: () => ({
				next: () => Promise.resolve({ done: true as const, value: undefined }),
			}),
		}),
		stopSession: () =>
			Promise.resolve({ outcome: "completed" as const, tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: true,
			returnEnforcement: "none" as const,
		}),
	};

	return {
		mountMcpRouter: () => undefined,
		dispose: () => undefined,
		probeAgentLoginStatus: async () => ({ state: "unavailable" as const }),
		adapters: {
			pool: {
				select: () => ({
					id: "stand-in",
					adapter: program,
					meta: { name: "Stand-in", modelProviders: [], maxConcurrent: 5 },
				}),
				release: vi.fn(),
				describeSelectFailure: () => "nothing selected",
			} as never,
			harnessRuntime: {
				enforcementRegistry,
				createReturnGate: () => ({ observe: vi.fn(), returned: false }),
				evaluateReturn: () => "returned" as const,
				provisionReturnHook: vi.fn(async () => undefined),
				writeCliMcpConfig: vi.fn(async () => ({})),
				writePluginStdioMcpEntries: vi.fn(() => []),
				openMcpBridge: (options: { sessionId: string; toolRegistry: ToolRegistryLike }) => {
					registries.set(options.sessionId, options.toolRegistry);
					return Promise.resolve({
						token: `token-${options.sessionId}`,
						url: "http://bridge.local",
					});
				},
				closeMcpBridge: vi.fn(async () => undefined),
			} as never,
			returnStatusTool: { forRegistry: () => ({ name: "return_status" }) as never },
		},
	};
}

// ---- DB helpers ----

const CORE_MIGRATIONS_FOLDER = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../framework/db/drizzle",
);

/** Create a migrated PGlite core DB in `<dataDir>/core-pg`. */
export async function makeCorePgDb(
	dataDir: string,
): Promise<{ db: HyperIdleDb; close(): Promise<void> }> {
	const corePgDir = path.join(dataDir, "core-pg");
	await applyMigrations(corePgDir, CORE_MIGRATIONS_FOLDER);
	const { createPgliteDb } = await import("@hyperidle/db");
	return createPgliteDb(corePgDir);
}

/** Create a migrated PGlite runner DB in `<dataDir>/runner-pg`. */
export function makeRunnerPgDb(dataDir: string): Promise<RunnerDbHandle> {
	const runnerPgDir = path.join(dataDir, "runner-pg");
	return createAndMigrateRunnerDb(runnerPgDir);
}

// ---- World boot ----

const SERVER_KEY = "runner-inbox-test-server-key";

/**
 * Boot a network runner world: a real server + a runner that talks to it via HTTP.
 * The runner is NOT started yet — call `world.runner.start()` from the test.
 */
export async function bootRunnerWorld(
	db: HyperIdleDb,
	runnerDbHandle: RunnerDbHandle,
	personKey: string,
	script: RunScript,
	options?: RunnerWorldOptions,
): Promise<RunnerWorld> {
	vi.stubEnv("HYPERIDLE_API_KEY", SERVER_KEY);
	const tempSpacesDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-world-spaces-"));
	vi.stubEnv("HYPERIDLE_SPACES_DIR", tempSpacesDir);

	const runs: string[] = [];
	const agentExecutionBoot = makeScriptedBoot(script, runs);

	// Boot the server.
	const serverHandle = await createServer(0, { db });
	const address = serverHandle.httpServer.address();
	if (!address || typeof address === "string") throw new Error("server did not bind TCP address");
	const serverUrl = `http://127.0.0.1:${address.port}`;

	// Boot the runner (not started — noAutoStart: true).
	const runnerHandle = await startRunner({
		serverUrl,
		personKey,
		dataDir: os.tmpdir(), // runner-db is externally managed via runnerDbHandle
		agentExecutionBoot,
		sweepMs: 100,
		noAutoStart: true,
		runnerDbHandle,
		...(options?.fetchInterceptor ? { fetchInterceptor: options.fetchInterceptor } : {}),
	});

	// Door for the test to act as the person — calls the server directly.
	const door = createCoreDoor(fetch, `${serverUrl}/api`);

	let stopped = false;

	return {
		runner: runnerHandle,
		door,
		nudge() {
			// No-op: the runner polls every 100ms, so inbox rows are drained automatically.
			// This method exists for ported test code that called world.nudge(...).
		},
		runs,
		runnerDb: runnerDbHandle.db,
		async stop() {
			if (stopped) return;
			stopped = true;
			await runnerHandle.stop();
			await serverHandle.dispose();
			try {
				fs.rmSync(tempSpacesDir, { recursive: true, force: true });
			} catch {
				// best-effort cleanup
			}
		},
	};
}
