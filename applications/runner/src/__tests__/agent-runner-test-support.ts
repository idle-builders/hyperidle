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
import { vi } from "vitest";
import { type RunnerHandle, resolveFreePort, startRunner } from "../index.js";

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

/** Boot where every session admission fails (pool returns nothing). */
export function makeFailingBoot(): AgentExecutionBoot {
	const enforcementRegistry = {
		register: vi.fn(),
		get: vi.fn(),
		incrementForce: vi.fn(),
		unregister: vi.fn(),
	};
	return {
		mountMcpRouter: () => undefined,
		dispose: () => undefined,
		probeAgentLoginStatus: async () => ({ state: "unavailable" as const }),
		adapters: {
			pool: {
				select: () => null,
				release: vi.fn(),
				describeSelectFailure: () => "no program available",
			} as never,
			harnessRuntime: {
				enforcementRegistry,
				createReturnGate: () => ({ observe: vi.fn(), returned: false }),
				evaluateReturn: () => "not_returned" as const,
				provisionReturnHook: vi.fn(async () => undefined),
				writeCliMcpConfig: vi.fn(async () => ({})),
				writePluginStdioMcpEntries: vi.fn(() => []),
				openMcpBridge: vi.fn(async () => ({ token: "stub-token", url: "http://stub" })),
				closeMcpBridge: vi.fn(async () => undefined),
			} as never,
			returnStatusTool: { forRegistry: () => ({ name: "return_status" }) as never },
		},
	};
}

// ---- Network world ----

export interface RunnerWorld {
	/** Start the runner. Some tests delay start to test "runner off" behavior. */
	readonly runner: Pick<RunnerHandle, "start" | "stop">;
	/** Door for the test to act as the person — calls the server directly. */
	readonly door: CoreDoor;
	/** Every sessionId the scripted program was run for, in order. */
	readonly runs: readonly string[];
	stop(): Promise<void>;
	/**
	 * Stop the current runner and start a fresh one against the same server and DB.
	 * The new runner loads persisted keys — simulates a process restart.
	 * Pass a boot override to inject a different program (e.g. `makeFailingBoot()`).
	 */
	restartRunner(agentExecutionOverride?: AgentExecutionBoot): Promise<void>;
}

// ---- Scripted execution boot ----

interface ToolRegistryLike {
	invoke(name: string, rawArgs: unknown): Promise<unknown>;
}

export function makeScriptedBoot(script: RunScript, runs: string[]): AgentExecutionBoot {
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

// ---- World boot ----

const SERVER_KEY = "runner-inbox-test-server-key";

/**
 * Boot a network runner world: a real server + a runner that talks to it via HTTP.
 * The runner is NOT started yet — call `world.runner.start()` from the test.
 * Pass `agentExecution` to override the scripted boot (e.g. for admission-failure tests).
 */
export async function bootRunnerWorld(
	db: HyperIdleDb,
	personKey: string,
	script: RunScript,
	dataDir: string,
	agentExecutionOverride?: AgentExecutionBoot,
): Promise<RunnerWorld> {
	vi.stubEnv("HYPERIDLE_API_KEY", SERVER_KEY);
	const tempSpacesDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-world-spaces-"));
	vi.stubEnv("HYPERIDLE_SPACES_DIR", tempSpacesDir);

	const runs: string[] = [];
	const agentExecution = agentExecutionOverride ?? makeScriptedBoot(script, runs);

	// Boot the server.
	const serverHandle = await createServer(0, { db });
	const address = serverHandle.httpServer.address();
	if (!address || typeof address === "string") throw new Error("server did not bind TCP address");
	const serverUrl = `http://127.0.0.1:${address.port}`;

	// Boot the runner (not started — caller must call world.runner.start()).
	const mcpPort = await resolveFreePort();
	let currentRunnerHandle = await startRunner({
		serverUrl,
		personKey,
		dataDir,
		agentExecution,
		mcpPort,
	});

	// Door for the test to act as the person — calls the server directly.
	const door = createCoreDoor(fetch, `${serverUrl}/api`);

	let stopped = false;

	const world: RunnerWorld = {
		get runner() {
			return currentRunnerHandle;
		},
		door,
		runs,
		async stop() {
			if (stopped) return;
			stopped = true;
			await currentRunnerHandle.stop();
			await serverHandle.dispose();
			try {
				fs.rmSync(tempSpacesDir, { recursive: true, force: true });
			} catch {
				// best-effort cleanup
			}
		},
		async restartRunner(agentExecutionOverride?: AgentExecutionBoot) {
			await currentRunnerHandle.stop();
			const newBoot = agentExecutionOverride ?? makeScriptedBoot(script, runs);
			const newMcpPort = await resolveFreePort();
			currentRunnerHandle = await startRunner({
				serverUrl,
				personKey,
				dataDir,
				agentExecution: newBoot,
				mcpPort: newMcpPort,
			});
			await currentRunnerHandle.start();
		},
	};
	return world;
}
