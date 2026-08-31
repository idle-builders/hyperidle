import type { HyperIdleDb, User } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { AdapterPool } from "@hyperidle/harness-registry";
import { describe, expect, it, vi } from "vitest";
import { runEvalSession } from "./provision-harness.js";

/**
 * @lore AU31 §2.3/§5: `runSession` moved off a free function
 * (`@hyperidle/core-api/session`) onto `buildRunOrchestrationComposition(...)
 * .runSession` (`@hyperidle/agent-orchestration`) — mock the FACTORY to
 * return an object whose `runSession` is the spy, same mocking intent as
 * before (this test's concern is adapter-pool selection, not the
 * composition's own wiring).
 */
const runSession = vi.fn();
vi.mock("@hyperidle/agent-orchestration", () => ({
	buildRunOrchestrationComposition: () => ({ runSession }),
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
}));

// AU21 §9 Increment 12 (Decision H3), Wave E: `runEvalSession` now performs a
// real `requireRunnableAgent`/`readServerConfig` bake before calling
// `runSession` (mocked above) — this test's concern is adapter-pool
// selection, not agent runnability, so those two reads are mocked here
// rather than pulled onto a real DB (this is a `.test.ts` unit test, no DB
// fixture).
vi.mock("@hyperidle/users", () => ({
	requireRunnableAgent: vi.fn(
		async () =>
			({
				id: "agent",
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			}) as unknown as User,
	),
}));
vi.mock("@hyperidle/settings", () => ({
	readServerConfig: vi.fn(async () => ({ harnessDisabled: [] })),
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
});
