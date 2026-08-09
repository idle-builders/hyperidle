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
	it("uses the canonical direct adapter for non-Anthropic external fallback", async () => {
		vi.mocked(runSession).mockImplementationOnce(async (deps) => {
			const selected = (deps as unknown as { adapterPool: AdapterPool }).adapterPool.select();
			expect(selected?.adapter.getCapabilities()).toMatchObject({
				returnEnforcement: "none",
				mcpSupport: false,
				modelProviders: ["openrouter"],
			});
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
				resolvedModel: {
					provider: "openrouter",
					model: "anthropic/claude-haiku-4-5",
					apiKey: "test",
					baseUrl: "https://openrouter.ai/api/v1",
				},
				sandboxBasePath: "/tmp/eval",
			},
			{ taskId: "task", agentId: "agent", teamId: "team", harnessKind: "external" },
		);

		expect(result).toMatchObject({ sessionId: "eval-session", outcome: "completed" });
		expect(runSession).toHaveBeenCalledOnce();
	});
});
