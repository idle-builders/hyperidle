import { describe, expect, it } from "vitest";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "../harness/index.js";
import { MockHarnessAdapter } from "../harness/index.js";

const TEST_CONFIG: SessionConfig = {
	workspacePath: "/workspace/test",
	soulPromptPath: "/workspace/prompts/builder.md",
	composedPrompt: "",
	modelTier: "workhorse",
	tools: ["read_file", "write_file", "run_command"],
};

describe("HarnessAdapter interface (D1)", () => {
	describe("SessionConfig", () => {
		it("includes workspace path, soul prompt path, composed prompt, model tier, and tools list", () => {
			const config: SessionConfig = TEST_CONFIG;
			expect(config.workspacePath).toBe("/workspace/test");
			expect(config.soulPromptPath).toBe("/workspace/prompts/builder.md");
			expect(config.composedPrompt).toBe("");
			expect(config.modelTier).toBe("workhorse");
			expect(config.tools).toEqual(["read_file", "write_file", "run_command"]);
		});
	});

	describe("MockHarnessAdapter", () => {
		it("implements HarnessAdapter interface", () => {
			const adapter: HarnessAdapter = new MockHarnessAdapter();
			expect(adapter).toBeDefined();
			expect(typeof adapter.startSession).toBe("function");
			expect(typeof adapter.streamEvents).toBe("function");
			expect(typeof adapter.stopSession).toBe("function");
			expect(typeof adapter.getCapabilities).toBe("function");
		});

		it("startSession returns a handle with sessionId", async () => {
			const adapter = new MockHarnessAdapter();
			const handle: SessionHandle = await adapter.startSession(TEST_CONFIG);
			expect(handle.sessionId).toBeDefined();
			expect(typeof handle.sessionId).toBe("string");
			expect(handle.sessionId.length).toBeGreaterThan(0);
		});

		it("streamEvents yields exactly 3 events in order", async () => {
			const adapter = new MockHarnessAdapter();
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			expect(events).toHaveLength(3);
			expect(events[0]!.type).toBe("token_usage");
			expect(events[1]!.type).toBe("tool_call");
			expect(events[2]!.type).toBe("completion");
		});

		it("events contain correct payload fields", async () => {
			const adapter = new MockHarnessAdapter();
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const tokenEvent = events[0]!;
			if (tokenEvent.type === "token_usage") {
				expect(tokenEvent.inputTokens).toBeGreaterThan(0);
				expect(tokenEvent.outputTokens).toBeGreaterThan(0);
			}

			const toolEvent = events[1]!;
			if (toolEvent.type === "tool_call") {
				expect(toolEvent.toolName).toBe("read_file");
				expect(toolEvent.args).toBeDefined();
			}

			const completionEvent = events[2]!;
			if (completionEvent.type === "completion") {
				expect(completionEvent.text.length).toBeGreaterThan(0);
			}
		});

		it("stopSession returns a completed result", async () => {
			const adapter = new MockHarnessAdapter();
			const handle = await adapter.startSession(TEST_CONFIG);
			const result: SessionResult = await adapter.stopSession(handle);

			expect(result.outcome).toBe("completed");
			// L17: cost is now WireMoney, tokens is TokenUsage
			expect(typeof result.cost.minor).toBe("number");
			expect(result.cost.minor).toBeGreaterThanOrEqual(0);
			expect(typeof result.cost.currency).toBe("string");
			expect(result.tokenUsage.byTier).toBeDefined();
		});

		it("getCapabilities returns expected shape", () => {
			const adapter = new MockHarnessAdapter();
			const caps: HarnessCapabilities = adapter.getCapabilities();

			expect(caps).toEqual({
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
			});
		});

		it("streamEvents throws for unknown session", async () => {
			const adapter = new MockHarnessAdapter();
			const fakeHandle: SessionHandle = { sessionId: "nonexistent" };

			const collectEvents = async (): Promise<HarnessEvent[]> => {
				const events: HarnessEvent[] = [];
				for await (const event of adapter.streamEvents(fakeHandle)) {
					events.push(event);
				}
				return events;
			};

			await expect(collectEvents()).rejects.toThrow("Unknown session");
		});

		it("stopSession throws for unknown session", async () => {
			const adapter = new MockHarnessAdapter();
			const fakeHandle: SessionHandle = { sessionId: "nonexistent" };

			await expect(adapter.stopSession(fakeHandle)).rejects.toThrow("Unknown session");
		});

		it("full lifecycle: start → stream → stop", async () => {
			const adapter = new MockHarnessAdapter();

			// Start
			const handle = await adapter.startSession(TEST_CONFIG);
			expect(handle.sessionId).toBeDefined();

			// Stream all events
			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
			expect(events).toHaveLength(3);

			// Stop
			const result = await adapter.stopSession(handle);
			expect(result.outcome).toBe("completed");
		});
	});

	describe("HarnessEvent discriminated union", () => {
		it("covers all six event types", () => {
			const events: HarnessEvent[] = [
				{ type: "token_usage", inputTokens: 10, outputTokens: 5 },
				{ type: "tool_call", toolName: "test", args: {} },
				{ type: "completion", text: "done" },
				{ type: "error", message: "fail", code: "ERR" },
				{ type: "cost_update", totalCost: 1.0, deltaCost: 0.5 },
				{ type: "pre_compaction", contextTokens: 90000, maxTokens: 100000 },
			];

			expect(events).toHaveLength(6);
			const types = events.map((e) => e.type);
			expect(types).toEqual([
				"token_usage",
				"tool_call",
				"completion",
				"error",
				"cost_update",
				"pre_compaction",
			]);
		});
	});
});
