import type { HyperIdleDb, User } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { AdapterPool } from "@hyperidle/harness-registry";
import { describe, expect, it, vi } from "vitest";
import { runEvalSession } from "./provision-harness.js";

/**
 * @lore `runSession` lives on `buildRunOrchestrationComposition(...).runSession`
 * (`@hyperidle/agent-orchestration`) — mock the FACTORY to return an object whose
 * `runSession` is the spy; this test's concern is adapter-pool selection, not the
 * composition's own wiring.
 *
 * @lore artifacts-become-knowledge: `runEvalSession` now boots a real HTTP
 * server (`startEvalLiveServer`) before calling `runSession`. The new
 * dependencies (`bootAgentOrchestration`, `bootCoreApi`, `composeApiApplication`,
 * `serve`) are mocked here so the unit test stays a unit test — the concern
 * is still adapter-pool selection, not server boot.
 */
const runSession = vi.fn();
vi.mock("@hyperidle/agent-orchestration", () => ({
	buildRunOrchestrationComposition: () => ({ runSession }),
	bootAgentOrchestration: vi.fn(async () => ({
		app: {},
		registerPreAuthRoutes: vi.fn(),
		inheritedReach: { refresh: vi.fn() },
		dispose: vi.fn(),
		joinLifecycleDrain: vi.fn(async () => {}),
	})),
}));

/*
 * The agent's identity document, as the `search_documents` read every session
 * bake uses returns it.
 */
const searchDocuments = vi.fn(async () => ({ ok: true, data: [{ body: "You are Aria." }] }));
vi.mock("@hyperidle/core-api", () => ({
	createStandaloneSearchDocuments: () => searchDocuments,
	buildAgentOrchestrationPort: vi.fn(() => ({})),
	composeApiApplication: vi.fn(() => ({ fetch: vi.fn() })),
	createInProcessAgentOrchestrationTransport: vi.fn(() => vi.fn()),
}));

vi.mock("@hyperidle/core-api/boot", () => ({
	bootCoreApi: vi.fn(async () => ({
		app: {},
		registerPreAuthRoutes: vi.fn(),
		middleware: {
			cors: vi.fn((_c, next) => next()),
			auth: vi.fn((_c, next) => next()),
			errorHandler: vi.fn(),
		},
		disposers: [],
		disposeWebSocket: vi.fn(),
		wsHub: {},
		upgradeTokenStore: null,
		cipher: { encrypt: vi.fn(), decrypt: vi.fn() },
	})),
}));

vi.mock("@hono/node-server", () => ({
	serve: vi.fn((_opts, callback) => {
		callback({ port: 12345 });
		return { close: vi.fn((cb) => cb()) };
	}),
}));

/**
 * The pool identity is the whole point of this test, so it is a real sentinel
 * object rather than a shape: the assertion below is that the pool reaching
 * `runSession` IS the one `createLocalAdapterPool` produced, not one that
 * merely resembles it.
 */
const productionPool = { __brand: "createLocalAdapterPool" } as unknown as AdapterPool;
const createLocalAdapterPool = vi.fn(async () => productionPool);
vi.mock("@hyperidle/harness-registry", () => ({
	createLocalAdapterPool: () => createLocalAdapterPool(),
	createReturnEnforcement: () => ({
		createGate: vi.fn(),
		evaluate: vi.fn(),
	}),
	createSandboxAdapter: () => ({}),
	provisionHarnessEnvironment: vi.fn(),
	writePluginStdioMcpEntries: vi.fn(),
}));
vi.mock("@hyperidle/harness-registry/mcp", () => ({
	returnStatusTool: { forRegistry: vi.fn() },
	createMcpToolBridge: vi.fn(() => ({
		router: {},
		open: vi.fn(async () => ({
			token: "test-token",
			url: "http://127.0.0.1:12345/api/mcp/test-token",
		})),
		close: vi.fn(async () => {}),
	})),
}));

// `runEvalSession` performs a real `requireRunnableAgent`/`readServerConfig` bake
// before calling `runSession` (mocked above) — this test's concern is adapter-pool
// selection, not agent runnability, so those two reads are mocked here rather than
// pulled onto a real DB (this is a `.test.ts` unit test, no DB fixture).
vi.mock("@hyperidle/user", () => ({
	requireRunnableAgent: vi.fn(
		async () =>
			({
				id: "agent",
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			}) as unknown as User,
	),
	getTeam: vi.fn(async () => ({ id: "team", name: "Team" })),
}));
/*
 * The context bake reads the real task and assembles the real document
 * bundle. This test's subject is which adapter pool the eval drives, so the
 * bake is mocked to a minimal task rather than handed a database — the bake
 * itself is covered by running the eval for real against a live harness.
 */
vi.mock("@hyperidle/task", () => ({
	get: vi.fn(async () => ({ id: "task", teamId: "team", title: "T", description: "d" })),
	bakeTaskContextBundle: vi.fn(async () => undefined),
}));
vi.mock("@hyperidle/document", () => ({
	assembleSessionDocuments: vi.fn(async () => []),
}));
vi.mock("@hyperidle/settings", () => ({
	readServerConfig: vi.fn(async () => ({ harnessDisabled: [] })),
	updateServerConfig: vi.fn(),
}));

describe("eval harness provisioning", () => {
	/**
	 * An eval exists to measure HyperIdle on a harness a user can actually run.
	 * It used to assemble a private pool holding a direct in-process LLM adapter,
	 * which meant the score said something about the model and nothing about the
	 * harness wiring. This asserts the replacement: eval drives the SAME pool
	 * production drives, so the adapter under measurement is a real one.
	 */
	it("drives the production local adapter pool, not a pool of its own", async () => {
		let poolSeenByRunSession: AdapterPool | undefined;
		vi.mocked(runSession).mockImplementationOnce(async (deps) => {
			poolSeenByRunSession = (deps as unknown as { adapterPool: AdapterPool }).adapterPool;
			const completed: Extract<Awaited<ReturnType<typeof runSession>>, { mode: "completed" }> = {
				mode: "completed",
				sessionId: "eval-session",
				outcome: "completed",
				taskId: "task",
				forceReturnCount: 0,
			};
			return completed;
		});

		const result = await runEvalSession(
			{
				db: {} as HyperIdleDb,
				eventBus: {} as EventBus,
				sandboxBasePath: "/tmp/eval",
			},
			{ taskId: "task", agentId: "agent", teamId: "team" },
		);

		expect(createLocalAdapterPool).toHaveBeenCalledOnce();
		expect(poolSeenByRunSession).toBe(productionPool);
		expect(result).toMatchObject({ sessionId: "eval-session", outcome: "completed" });
		expect(runSession).toHaveBeenCalledOnce();
	});

	/**
	 * The eval calls the session runner directly, so it must bake what the
	 * emit-time pipeline bakes — the agent's identity included. Without it a
	 * scenario that gives its agent a persona runs an agent without one.
	 */
	it("bakes the agent's identity document into the session's agent config", async () => {
		let personaSeenByRunSession: unknown;
		vi.mocked(runSession).mockImplementationOnce(async (_deps, request) => {
			personaSeenByRunSession = (
				request as unknown as { input: { agentConfig: { persona?: string } } }
			).input.agentConfig.persona;
			return {
				mode: "completed",
				sessionId: "eval-session",
				outcome: "completed",
				taskId: "task",
				forceReturnCount: 0,
			};
		});

		await runEvalSession(
			{ db: {} as HyperIdleDb, eventBus: {} as EventBus, sandboxBasePath: "/tmp/eval" },
			{ taskId: "task", agentId: "agent", teamId: "team" },
		);

		expect(searchDocuments).toHaveBeenCalledWith(expect.objectContaining({ actor: "agent" }), {
			parent: { kind: "agent", id: "agent" },
			slot: "agent_file",
			status: "active",
		});
		expect(personaSeenByRunSession).toBe("You are Aria.");
	});
});
