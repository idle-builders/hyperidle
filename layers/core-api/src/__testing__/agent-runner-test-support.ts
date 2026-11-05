/**
 * The desktop's composition — core, agent orchestration and the agents' runner — over one test
 * database, with a stand-in agent program: each run calls the agent's real tools through the
 * runner's door, as the script says. Everything else is the production path.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type AgentRunner,
	type CoreDoor,
	actionToolsThroughDoor,
	bootAgentOrchestration,
	createAgentRunner,
	createCoreDoor,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import { agentSessionRequests, type HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { inArray } from "drizzle-orm";
import { vi } from "vitest";
import { disposeApp } from "../app.js";
import { bootCoreApi } from "../boot.js";
import { composeApiApplication } from "../compose-api-application.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../service-bootstrap.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";

/** One run of the stand-in program: which session, and its tools. */
export interface ScriptedRun {
	readonly sessionId: string;
	/** 0 for the first run the program is started for, then 1, 2… */
	readonly index: number;
	call(tool: string, args: unknown): Promise<unknown>;
}

export type RunScript = (run: ScriptedRun) => Promise<void>;

/** The program answers every run with one message where it was called from. */
export const answersPong: RunScript = async (run) => {
	await run.call("send_message", { text: "pong" });
};

export interface RunnerWorld {
	readonly runner: AgentRunner;
	/** The door a window uses, for the test to act as the person. */
	readonly door: CoreDoor;
	/** The server's live nudge, for wiring a clock the test drives. */
	readonly nudge: (topic: string, envelope: unknown) => void;
	/** Every run the stand-in program was started for, in order. */
	readonly runs: readonly string[];
	stop(): Promise<void>;
}

const TEAM_KEY = "agent-runner-test-team-key";

interface ToolRegistryLike {
	invoke(name: string, args: unknown): Promise<unknown>;
}

/**
 * Boots the world; the runner is built but not started, so a test decides when the computer
 * comes on. `personKey` is the key of the person whose computer this is.
 */
export async function bootRunnerWorld(
	db: HyperIdleDb,
	eventBus: EventBus,
	personKey: string,
	script: RunScript,
): Promise<RunnerWorld> {
	// The server's own seam calls carry the deployment key, read from the environment.
	vi.stubEnv("HYPERIDLE_API_KEY", TEAM_KEY);
	const sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "agent-runner-world-"));
	const registries = new Map<string, ToolRegistryLike>();
	const runs: string[] = [];

	let transport: AgentOrchestrationTransport | undefined;
	const agentOrchestration = buildAgentOrchestrationPort((req) => {
		if (!transport) throw new Error("called before the app was built");
		return transport(req);
	});
	const coreApi = await bootCoreApi({
		db,
		eventBus,
		agentOrchestration,
		serviceBootstrap: (ctx) => [
			...registerCoreDomainServices({ ...ctx, canProvision: true }),
			...registerAgentLayerServices({ ...ctx, canProvision: true }),
		],
	});

	let appFetch: ((req: Request) => Promise<Response>) | undefined;
	const door = createCoreDoor((req) => {
		if (!appFetch) throw new Error("called before the app was built");
		return appFetch(req);
	}, "http://hyperidle.local/api");
	const runner = createAgentRunner({
		db,
		eventBus,
		door,
		personKey: () => personKey,
		subscribeInbox: (agentId, onNudge) => {
			const client = { send: () => onNudge() };
			coreApi.wsHub.addClient(client, agentId);
			void coreApi.wsHub.subscribe(client, `user:${agentId}`);
			return () => coreApi.wsHub.removeClient(client);
		},
		sweepMs: 60_000,
	});
	const coreTools = actionToolsThroughDoor(coreApi.actionCatalog, door, runner.keyFor);

	const program = {
		startSession: async (config: { sessionId: string }) => {
			const index = runs.push(config.sessionId) - 1;
			const registry = registries.get(config.sessionId);
			if (!registry) throw new Error(`no tools for session ${config.sessionId}`);
			await script({
				sessionId: config.sessionId,
				index,
				call: (tool, args) => registry.invoke(tool, args),
			});
			return { sessionId: config.sessionId };
		},
		streamEvents: () => ({ async *[Symbol.asyncIterator]() {} }),
		stopSession: async () => ({ outcome: "completed", tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: true,
			returnEnforcement: "none",
		}),
	};

	const orchestration = await bootAgentOrchestration({
		db,
		eventBus,
		runtime: {
			harnessRuntime: {
				enforcementRegistry: {
					register: vi.fn(),
					get: vi.fn(),
					incrementForce: vi.fn(),
					unregister: vi.fn(),
				},
				createReturnGate: () => ({ observe: () => {}, returned: false }),
				evaluateReturn: () => "returned",
				provisionReturnHook: async () => {},
				writeCliMcpConfig: () => {},
				writePluginStdioMcpEntries: () => {},
				openMcpBridge: async (options: { sessionId: string; toolRegistry: ToolRegistryLike }) => {
					registries.set(options.sessionId, options.toolRegistry);
					return { token: `token-${options.sessionId}`, url: "http://bridge.local" };
				},
				closeMcpBridge: async () => {},
			} as never,
			returnStatusTool: { forRegistry: () => ({ name: "return_status" }) } as never,
			actionTools: () => [...coreTools, ...orchestration.actionTools],
			editDocument: coreApi.editDocument,
			searchDocuments: coreApi.searchDocuments,
			session: {
				db,
				eventBus,
				adapterPool: {
					select: () => ({
						id: "stand-in",
						adapter: program,
						meta: { name: "Stand-in", modelProviders: [], maxConcurrent: 5 },
					}),
					release: () => {},
					describeSelectFailure: () => "nothing selected",
				},
				workspace: {
					spawn: async () => {
						const dir = fs.mkdtempSync(path.join(sandboxBasePath, "run-"));
						return { sandboxId: path.basename(dir), path: dir };
					},
					exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
					adopt: async (dir: string) => ({ sandboxId: path.basename(dir), path: dir }),
					destroy: async () => {},
				},
				pluginMcpContributions: coreApi.pluginMcpContributions,
			} as never,
			sandboxBasePath,
		},
	});

	const app = composeApiApplication({
		middleware: coreApi.middleware,
		preAuthRegistrars: [coreApi.registerPreAuthRoutes],
		apps: [coreApi.app, orchestration.app],
	});
	transport = createInProcessAgentOrchestrationTransport(app);
	appFetch = (req) => Promise.resolve(app.fetch(req));

	return {
		runner,
		door,
		nudge: (topic, envelope) => coreApi.wsHub.broadcast(topic, JSON.stringify(envelope)),
		runs,
		async stop() {
			await runner.stop();
			// A run goes on after the agent has answered; let every one finish before the world goes.
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				const open = await db
					.select({ id: agentSessionRequests.id })
					.from(agentSessionRequests)
					.where(inArray(agentSessionRequests.status, ["pending", "claimed", "running"]));
				if (open.length === 0) break;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			await orchestration.disposeRuntime?.();
			orchestration.dispose();
			await orchestration.joinLifecycleDrain();
			disposeApp(app);
			for (const dispose of coreApi.disposers) dispose();
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
			vi.unstubAllEnvs();
		},
	};
}
