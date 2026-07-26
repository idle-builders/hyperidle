import { runSession } from "@hyperidle/core-api/session";
import type { HyperIdleDb } from "@hyperidle/db";
import type { AdapterPool } from "@hyperidle/harness-registry";
import type { EventBus } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import { runEvalSession } from "./provision-harness.js";

vi.mock("@hyperidle/core-api/session", () => ({ runSession: vi.fn() }));

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
				totalCostCents: 0,
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
