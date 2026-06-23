import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { HarnessAdapter, HarnessEvent, SessionConfig } from "@hyperidle/shared";
import {
	AL6_FORCE_RETURN_MESSAGE,
	AL6_MAX_FORCE_RETURNS,
	MissingCredentialError,
} from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialResolver } from "../../services/credential-resolver.js";
import { BUILT_IN_GATEWAY_CONFIG } from "../../services/model-gateway.js";
import { ClaudeAgentSdkAdapter } from "../claude-agent-sdk-adapter.js";

// X4: model-tier-map.ts deleted. Gateway model IDs are tested in X4-model-gateway.test.ts.
// KNOWN_MODELS derived from BUILT_IN_GATEWAY_CONFIG — single source of truth.
const KNOWN_MODELS = {
	reasoning: BUILT_IN_GATEWAY_CONFIG.reasoning.model,
	workhorse: BUILT_IN_GATEWAY_CONFIG.workhorse.model,
	fast: BUILT_IN_GATEWAY_CONFIG.fast.model,
} as const;

const TEST_CONFIG: SessionConfig = {
	sandboxPath: "/workspace/test",
	sessionId: "test-session",
	systemPromptPath: "/workspace/prompts/builder.md",
	assembledPrompt: "",
	modelTier: "workhorse",
	tools: ["Read", "Write", "Bash"],
};

/** Create a mock Query from a sequence of SDK messages. */
function createMockQuery(messages: SDKMessage[]): Query {
	let aborted = false;

	async function* generate(): AsyncGenerator<SDKMessage, void> {
		for (const msg of messages) {
			if (aborted) return;
			yield msg;
		}
	}

	const gen = generate();
	const query = gen as unknown as Query;

	// Add control methods
	query.interrupt = vi.fn(async () => {
		aborted = true;
	});
	query.close = vi.fn(() => {
		aborted = true;
	});
	// Scaffolding — the return value is not asserted; match the file's
	// `({}) as ReturnType<...>` mock idiom (the SDK response carries more fields
	// than the test populates).
	query.getContextUsage = vi.fn(async () => ({}) as Awaited<ReturnType<Query["getContextUsage"]>>);
	// Stub other Query methods
	query.setPermissionMode = vi.fn(async () => {});
	query.setModel = vi.fn(async () => {});
	query.setMaxThinkingTokens = vi.fn(async () => {});
	query.applyFlagSettings = vi.fn(async () => {});
	query.initializationResult = vi.fn(async () => ({}) as ReturnType<Query["initializationResult"]>);
	query.supportedCommands = vi.fn(async () => []);
	query.supportedModels = vi.fn(async () => []);
	query.supportedAgents = vi.fn(async () => []);
	query.mcpServerStatus = vi.fn(async () => []);
	query.reloadPlugins = vi.fn(async () => ({}) as ReturnType<Query["reloadPlugins"]>);
	query.accountInfo = vi.fn(async () => ({}) as ReturnType<Query["accountInfo"]>);
	query.rewindFiles = vi.fn(async () => ({}) as ReturnType<Query["rewindFiles"]>);
	query.reconnectMcpServer = vi.fn(async () => {});
	query.toggleMcpServer = vi.fn(async () => {});
	query.setMcpServers = vi.fn(async () => ({}) as ReturnType<Query["setMcpServers"]>);
	query.streamInput = vi.fn(async () => {});
	query.stopTask = vi.fn(async () => {});

	return query;
}

function mockAssistantMessage(
	inputTokens: number,
	outputTokens: number,
	textContent?: string,
	toolUse?: { name: string; input: Record<string, unknown> },
): SDKMessage {
	const content: Array<{
		type: string;
		text?: string;
		name?: string;
		input?: Record<string, unknown>;
		id?: string;
	}> = [];
	if (textContent) {
		content.push({ type: "text", text: textContent });
	}
	if (toolUse) {
		content.push({ type: "tool_use", name: toolUse.name, input: toolUse.input, id: "tool-1" });
	}

	return {
		type: "assistant",
		message: {
			usage: {
				input_tokens: inputTokens,
				output_tokens: outputTokens,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			},
			content,
		},
		parent_tool_use_id: null,
		uuid: "msg-1",
		session_id: "sess-1",
	} as unknown as SDKMessage;
}

function mockResultMessage(totalCostUsd: number): SDKMessage {
	return {
		type: "result",
		subtype: "success",
		duration_ms: 1000,
		duration_api_ms: 800,
		is_error: false,
		num_turns: 1,
		result: "Task completed.",
		stop_reason: "end_turn",
		total_cost_usd: totalCostUsd,
		usage: {
			input_tokens: 500,
			output_tokens: 200,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
		},
		modelUsage: {},
		permission_denials: [],
		uuid: "result-1",
		session_id: "sess-1",
	} as unknown as SDKMessage;
}

function mockCompactBoundaryMessage(preTokens: number): SDKMessage {
	return {
		type: "system",
		subtype: "compact_boundary",
		compact_metadata: {
			trigger: "auto",
			pre_tokens: preTokens,
		},
		uuid: "compact-1",
		session_id: "sess-1",
	} as unknown as SDKMessage;
}

describe("ClaudeAgentSdkAdapter (D2)", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.ANTHROPIC_API_KEY = "test-key-12345";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	describe("model tier mapping (X4: legacy tier map replaced by gateway)", () => {
		// X4: model-tier-map.ts deleted. The adapter now uses resolvedModel from
		// SessionConfig (set by the gateway) rather than calling resolveModel.
		// These tests validate the legacy fallback model strings used when no
		// resolvedModel is provided (e.g. direct adapter tests without gateway).
		// AH2: Re-keyed to current catalog IDs.
		it("maps Reasoning → opus (via legacy fallback)", () => {
			expect(KNOWN_MODELS.reasoning).toBe("claude-opus-4-8");
		});

		it("maps Workhorse → sonnet (via legacy fallback)", () => {
			expect(KNOWN_MODELS.workhorse).toBe("claude-sonnet-4-6");
		});

		it("maps Fast → haiku (via legacy fallback)", () => {
			expect(KNOWN_MODELS.fast).toBe("claude-haiku-4-5");
		});

		it("covers all ModelTier values", () => {
			expect(Object.keys(KNOWN_MODELS)).toEqual(["reasoning", "workhorse", "fast"]);
		});
	});

	describe("construction and credentials", () => {
		it("can be instantiated without API key", () => {
			process.env.ANTHROPIC_API_KEY = undefined;
			const adapter = new ClaudeAgentSdkAdapter();
			expect(adapter).toBeDefined();
		});

		it("throws MissingCredentialError on startSession without API key", async () => {
			process.env.ANTHROPIC_API_KEY = undefined;
			const adapter = new ClaudeAgentSdkAdapter();

			await expect(adapter.startSession(TEST_CONFIG)).rejects.toThrow(MissingCredentialError);
		});

		it("implements HarnessAdapter interface", () => {
			const adapter: HarnessAdapter = new ClaudeAgentSdkAdapter();
			expect(typeof adapter.startSession).toBe("function");
			expect(typeof adapter.streamEvents).toBe("function");
			expect(typeof adapter.stopSession).toBe("function");
			expect(typeof adapter.getCapabilities).toBe("function");
		});
	});

	describe("startSession", () => {
		it("returns a session handle with sessionId", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			expect(handle.sessionId).toBeDefined();
			expect(typeof handle.sessionId).toBe("string");
		});

		it("uses kickoff message as prompt (X1: full instructions in CLAUDE.md)", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession(TEST_CONFIG);

			expect(queryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: "Begin working on your assigned task.",
				}),
			);
		});

		it("passes correct model to SDK query", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession({
				...TEST_CONFIG,
				modelTier: "reasoning",
			});

			// AH2: Re-keyed to current catalog ID.
			expect(queryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						model: "claude-opus-4-8",
					}),
				}),
			);
		});

		it("passes tools and workspace to SDK query", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession(TEST_CONFIG);

			expect(queryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						cwd: "/workspace/test",
						tools: ["Read", "Write", "Bash"],
					}),
				}),
			);
		});
	});

	describe("streamEvents", () => {
		it("yields token_usage events from assistant messages", async () => {
			const messages: SDKMessage[] = [mockAssistantMessage(100, 50, "Hello")];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const tokenEvents = events.filter((e) => e.type === "token_usage");
			expect(tokenEvents.length).toBeGreaterThanOrEqual(1);
			const tokenEvent = tokenEvents[0]!;
			if (tokenEvent.type === "token_usage") {
				expect(tokenEvent.inputTokens).toBe(100);
				expect(tokenEvent.outputTokens).toBe(50);
			}
		});

		it("yields tool_call events from assistant tool_use blocks", async () => {
			const messages: SDKMessage[] = [
				mockAssistantMessage(50, 30, undefined, {
					name: "Read",
					input: { path: "/test.ts" },
				}),
			];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const toolEvents = events.filter((e) => e.type === "tool_call");
			expect(toolEvents).toHaveLength(1);
			if (toolEvents[0]!.type === "tool_call") {
				expect(toolEvents[0]!.toolName).toBe("Read");
				expect(toolEvents[0]!.args).toEqual({ path: "/test.ts" });
			}
		});

		it("yields completion events from text content", async () => {
			const messages: SDKMessage[] = [mockAssistantMessage(50, 30, "Analysis complete.")];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const completionEvents = events.filter((e) => e.type === "completion");
			expect(completionEvents.length).toBeGreaterThanOrEqual(1);
			if (completionEvents[0]!.type === "completion") {
				expect(completionEvents[0]!.text).toBe("Analysis complete.");
			}
		});

		it("yields cost_update events from result messages", async () => {
			const messages: SDKMessage[] = [
				mockAssistantMessage(100, 50, "Done"),
				mockResultMessage(0.0045),
			];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const costEvents = events.filter((e) => e.type === "cost_update");
			expect(costEvents.length).toBeGreaterThanOrEqual(1);
			const lastCostEvent = costEvents[costEvents.length - 1]!;
			if (lastCostEvent.type === "cost_update") {
				expect(lastCostEvent.totalCost).toBe(0.0045);
			}
		});

		it("yields pre_compaction events from compact_boundary messages", async () => {
			const messages: SDKMessage[] = [
				mockAssistantMessage(100, 50, "Working..."),
				mockCompactBoundaryMessage(150000),
				mockAssistantMessage(50, 25, "Continuing..."),
			];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const preCompactionEvents = events.filter((e) => e.type === "pre_compaction");
			expect(preCompactionEvents).toHaveLength(1);
			if (preCompactionEvents[0]!.type === "pre_compaction") {
				expect(preCompactionEvents[0]!.contextTokens).toBe(150000);
				expect(preCompactionEvents[0]!.maxTokens).toBeGreaterThan(0);
			}
		});

		it("handles full session lifecycle: start → stream → stop", async () => {
			const messages: SDKMessage[] = [
				mockAssistantMessage(100, 50, "Hello, I'll help you."),
				mockAssistantMessage(80, 40, undefined, {
					name: "Bash",
					input: { command: "ls" },
				}),
				mockResultMessage(0.003),
			];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			expect(events.length).toBeGreaterThan(0);

			const eventTypes = new Set(events.map((e) => e.type));
			expect(eventTypes.has("token_usage")).toBe(true);
			expect(eventTypes.has("completion")).toBe(true);
			expect(eventTypes.has("tool_call")).toBe(true);
			expect(eventTypes.has("cost_update")).toBe(true);

			const result = await adapter.stopSession(handle);
			expect(result.outcome).toBe("completed");
			// L17: totalCost replaced by cost: WireMoney
			expect(result.cost.minor).toBe(Math.round(0.003 * 100)); // $0.003 = 0 cents (rounds to 0)
			expect(result.cost.currency).toBe("USD");
			// L17: totalTokens replaced by tokenUsage: TokenUsage
			const totalOut = Object.values(result.tokenUsage.byTier).reduce(
				(acc, t) => acc + (t?.prompt ?? 0) + (t?.completion ?? 0),
				0,
			);
			expect(totalOut).toBeGreaterThan(0);
		});

		it("yields error event when stream throws", async () => {
			async function* errorStream(): AsyncGenerator<SDKMessage, void> {
				yield mockAssistantMessage(50, 25, "Starting...");
				throw new Error("Connection lost");
			}

			const gen = errorStream();
			const mockQuery = gen as unknown as Query;
			mockQuery.interrupt = vi.fn(async () => {});
			mockQuery.close = vi.fn();
			mockQuery.getContextUsage = vi.fn(
				async () => ({}) as Awaited<ReturnType<Query["getContextUsage"]>>,
			);
			mockQuery.setPermissionMode = vi.fn(async () => {});
			mockQuery.setModel = vi.fn(async () => {});
			mockQuery.setMaxThinkingTokens = vi.fn(async () => {});
			mockQuery.applyFlagSettings = vi.fn(async () => {});
			mockQuery.initializationResult = vi.fn(
				async () => ({}) as ReturnType<Query["initializationResult"]>,
			);
			mockQuery.supportedCommands = vi.fn(async () => []);
			mockQuery.supportedModels = vi.fn(async () => []);
			mockQuery.supportedAgents = vi.fn(async () => []);
			mockQuery.mcpServerStatus = vi.fn(async () => []);
			mockQuery.reloadPlugins = vi.fn(async () => ({}) as ReturnType<Query["reloadPlugins"]>);
			mockQuery.accountInfo = vi.fn(async () => ({}) as ReturnType<Query["accountInfo"]>);
			mockQuery.rewindFiles = vi.fn(async () => ({}) as ReturnType<Query["rewindFiles"]>);
			mockQuery.reconnectMcpServer = vi.fn(async () => {});
			mockQuery.toggleMcpServer = vi.fn(async () => {});
			mockQuery.setMcpServers = vi.fn(async () => ({}) as ReturnType<Query["setMcpServers"]>);
			mockQuery.streamInput = vi.fn(async () => {});
			mockQuery.stopTask = vi.fn(async () => {});

			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const errorEvents = events.filter((e) => e.type === "error");
			expect(errorEvents).toHaveLength(1);
			if (errorEvents[0]!.type === "error") {
				expect(errorEvents[0]!.message).toBe("Connection lost");
			}
		});

		it("throws for unknown session handle", async () => {
			const adapter = new ClaudeAgentSdkAdapter();
			const fakeHandle = { sessionId: "nonexistent" };

			const collectEvents = async (): Promise<HarnessEvent[]> => {
				const events: HarnessEvent[] = [];
				for await (const event of adapter.streamEvents(fakeHandle)) {
					events.push(event);
				}
				return events;
			};

			await expect(collectEvents()).rejects.toThrow("Unknown session");
		});
	});

	describe("stopSession", () => {
		it("returns session result with accumulated totals", async () => {
			const messages: SDKMessage[] = [
				mockAssistantMessage(100, 50, "Done"),
				mockResultMessage(0.005),
			];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			// Consume events to accumulate totals
			for await (const _event of adapter.streamEvents(handle)) {
				// consume
			}

			const result = await adapter.stopSession(handle);
			expect(result.outcome).toBe("completed");
			// L17: totalCost replaced by cost: WireMoney
			expect(result.cost.minor).toBe(Math.round(0.005 * 100)); // $0.005 = 1 cent (rounded)
			expect(result.cost.currency).toBe("USD");
			// L17: totalTokens replaced by tokenUsage: TokenUsage
			// 100 input + 50 output from assistant message
			const workhorseTier = result.tokenUsage.byTier.workhorse;
			expect(workhorseTier?.prompt).toBe(100);
			expect(workhorseTier?.completion).toBe(50);
		});

		it("throws for unknown session handle", async () => {
			const adapter = new ClaudeAgentSdkAdapter();
			const fakeHandle = { sessionId: "nonexistent" };

			await expect(adapter.stopSession(fakeHandle)).rejects.toThrow("Unknown session");
		});
	});

	describe("getCapabilities", () => {
		it("returns expected capabilities", () => {
			const adapter = new ClaudeAgentSdkAdapter();
			const caps = adapter.getCapabilities();

			expect(caps).toEqual({
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: true,
				// AL6 v2: SDK adapter is Tier-1 (has Stop hook → canForceReturn=true).
				hasNativeReturnHook: true,
				canReEngage: true,
			});
		});
	});

	describe("cost_update accuracy", () => {
		it("cost_update from result matches SDK reported cost", async () => {
			const sdkCost = 0.0123;
			const messages: SDKMessage[] = [
				mockAssistantMessage(500, 200, "Work done"),
				mockResultMessage(sdkCost),
			];
			const mockQuery = createMockQuery(messages);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			const events: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}

			const costEvents = events.filter((e) => e.type === "cost_update");
			expect(costEvents.length).toBeGreaterThanOrEqual(1);

			const lastCost = costEvents[costEvents.length - 1]!;
			if (lastCost.type === "cost_update") {
				// Within 10% of SDK reported cost
				expect(lastCost.totalCost).toBeCloseTo(sdkCost, 4);
				expect(Math.abs(lastCost.totalCost - sdkCost) / sdkCost).toBeLessThan(0.1);
			}
		});
	});

	describe("resolvedModel path (X4 primary production path)", () => {
		it("uses model and apiKey from resolvedModel when set", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession({
				...TEST_CONFIG,
				modelTier: "reasoning",
				resolvedModel: {
					provider: "openrouter",
					model: "anthropic/claude-opus-4",
					apiKey: "openrouter-key-xyz",
					baseUrl: "https://openrouter.ai/api",
				},
			});

			expect(handle.sessionId).toBeDefined();
			expect(queryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						model: "anthropic/claude-opus-4",
					}),
				}),
			);
		});

		it("uses resolvedModel over legacy env var when both are present", async () => {
			// Env var is set (from beforeEach), but resolvedModel should take precedence.
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession({
				...TEST_CONFIG,
				resolvedModel: {
					provider: "anthropic",
					model: "claude-haiku-3-5-20241022",
					apiKey: "gateway-resolved-key",
					baseUrl: "https://api.anthropic.com",
				},
			});

			expect(queryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						model: "claude-haiku-3-5-20241022",
					}),
				}),
			);
		});
	});

	// ── T7 (AL6 v2): SDK Stop hook behavioral tests ──────────────────────────────
	//
	// Verifies the in-process Stop hook closure honors `decision:block` semantics:
	//   (a) Hook blocks the stop and returns AL6_FORCE_RETURN_MESSAGE when no return seen.
	//   (b) Hook allows stop when a return action was observed (returnSeen=true).
	//   (c) Hook allows stop after budget is exhausted (AL6_MAX_FORCE_RETURNS invocations).
	//   (d) returnSeen is set by translateMessage when submit_review is seen in the stream.
	//
	// The hook is extracted from the options captured by the queryFn spy — it fires
	// in-process, not via subprocess. This is a pure behavioral unit test.

	describe("AL6 v2 T7 — SDK Stop hook (canForceReturn=true, decision:block)", () => {
		// Type alias for the Stop hook function extracted from captured options.
		type StopHookFn = (
			input: unknown,
			toolUseId: string | undefined,
			options: { signal: AbortSignal },
		) => Promise<{ decision?: string; reason?: string }>;

		// Type-safe wrapper around the mock call args for hook extraction.
		type HookCallArg = {
			options?: { hooks?: { Stop?: Array<{ hooks: StopHookFn[] }> } };
		};

		/** Extract the Stop hook from a queryFn spy after startSession is called. */
		function extractStopHook(queryFn: ReturnType<typeof vi.fn>): StopHookFn | undefined {
			const calls = queryFn.mock.calls as unknown as Array<[HookCallArg, ...unknown[]]>;
			const firstCall = calls[0];
			if (!firstCall) return undefined;
			return firstCall[0]?.options?.hooks?.Stop?.[0]?.hooks?.[0];
		}

		const dummySignal = new AbortController().signal;

		it("returns decision:'block' + AL6_FORCE_RETURN_MESSAGE when no return was seen (first call)", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession(TEST_CONFIG);

			const hook = extractStopHook(queryFn);
			expect(hook).toBeDefined();

			// No return action observed, forceCount=0 → should block
			const result = await hook!({}, undefined, { signal: dummySignal });
			expect(result.decision).toBe("block");
			expect(result.reason).toBe(AL6_FORCE_RETURN_MESSAGE);
		});

		it("blocks a second time when forceCount=1 and budget not exhausted", async () => {
			// AL6_MAX_FORCE_RETURNS = 2, so forceCount=1 < 2 → still block
			// Simulate by calling hook twice on same session's hook closure.
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession(TEST_CONFIG);

			const hook = extractStopHook(queryFn);
			expect(hook).toBeDefined();

			// First call: forceCount goes 0→1, budget=2 → still block
			const first = await hook!({}, undefined, { signal: dummySignal });
			expect(first.decision).toBe("block");

			// Second call: forceCount goes 1→2 (1 < 2) → still block
			const second = await hook!({}, undefined, { signal: dummySignal });
			expect(second.decision).toBe("block");
		});

		it("allows stop after AL6_MAX_FORCE_RETURNS budget is exhausted", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			await adapter.startSession(TEST_CONFIG);

			const hook = extractStopHook(queryFn);
			expect(hook).toBeDefined();

			// Exhaust the budget: call AL6_MAX_FORCE_RETURNS times
			for (let i = 0; i < AL6_MAX_FORCE_RETURNS; i++) {
				await hook!({}, undefined, { signal: dummySignal });
			}

			// Budget spent → allow stop
			const afterBudget = await hook!({}, undefined, { signal: dummySignal });
			expect(afterBudget.decision).toBe("approve");
		});

		it("allows stop immediately when a return action was observed in the stream", async () => {
			// Simulate: adapter processes a submit_review tool_use → returnSeen=true
			// Then hook fires and should approve the stop.
			const returnActionMessage: SDKMessage = {
				type: "assistant",
				message: {
					usage: { input_tokens: 10, output_tokens: 5 },
					content: [{ type: "tool_use", name: "submit_review", input: {}, id: "t1" }],
				},
				parent_tool_use_id: null,
				uuid: "msg-2",
				session_id: "sess-2",
			} as unknown as SDKMessage;

			const mockQuery = createMockQuery([returnActionMessage]);
			const queryFn = vi.fn(() => mockQuery);
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			// Drain the stream so translateMessage processes the submit_review block
			// biome-ignore lint/suspicious/noEmptyBlockStatements: draining stream intentionally to set returnSeen
			for await (const _ of adapter.streamEvents(handle)) {
			}

			// Extract the hook from the same session's closure
			const hook = extractStopHook(queryFn);
			expect(hook).toBeDefined();

			// submit_review was observed → returnSeen=true → approve immediately
			const result = await hook!({}, undefined, { signal: dummySignal });
			expect(result.decision).toBe("approve");
		});

		it("hasNativeReturnHook capability is true for ClaudeAgentSdkAdapter (Layer-A fast-path)", () => {
			const adapter = new ClaudeAgentSdkAdapter();
			expect(adapter.getCapabilities().hasNativeReturnHook).toBe(true);
			expect(adapter.getCapabilities().canReEngage).toBe(true);
		});
	});

	describe("credentialResolver integration (P3 AC-15)", () => {
		it("uses resolver.resolve() instead of env var when resolver is provided", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			// Remove env var to confirm it's not used
			process.env.ANTHROPIC_API_KEY = undefined;

			const mockResolver: CredentialResolver = {
				resolve: vi.fn().mockResolvedValue("resolver-provided-key-abc"),
			};

			const adapter = new ClaudeAgentSdkAdapter({ queryFn, credentialResolver: mockResolver });
			const handle = await adapter.startSession(TEST_CONFIG);

			expect(handle.sessionId).toBeDefined();
			expect(mockResolver.resolve).toHaveBeenCalledWith("anthropic_api_key");
		});

		it("throws MissingCredentialError when resolver returns null", async () => {
			const mockResolver: CredentialResolver = {
				resolve: vi.fn().mockResolvedValue(null),
			};

			const adapter = new ClaudeAgentSdkAdapter({ credentialResolver: mockResolver });

			await expect(adapter.startSession(TEST_CONFIG)).rejects.toThrow(MissingCredentialError);
			expect(mockResolver.resolve).toHaveBeenCalledWith("anthropic_api_key");
		});

		it("falls back to env var when no resolver is provided (backward compat)", async () => {
			const mockQuery = createMockQuery([]);
			const queryFn = vi.fn(() => mockQuery);

			// Env var is set (from beforeEach)
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });
			const handle = await adapter.startSession(TEST_CONFIG);

			expect(handle.sessionId).toBeDefined();
		});

		it("throws MissingCredentialError when no resolver and no env var", async () => {
			process.env.ANTHROPIC_API_KEY = undefined;

			const adapter = new ClaudeAgentSdkAdapter();
			await expect(adapter.startSession(TEST_CONFIG)).rejects.toThrow(MissingCredentialError);
		});
	});
});
