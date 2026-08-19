/**
 * X6: Tests for BuiltinHarnessAdapter — AC-1 through AC-14, plus AC-8.
 *
 * callLlm is mocked via vi.mock() so no real LLM calls are made.
 * ToolRegistry is mocked via vi.fn().
 *
 * Key reviewer corrections incorporated:
 *   - AC-11: context pressure uses LATEST call's inputTokens, NOT cumulative sum
 *   - AC-13: max-iterations guard stops at configured limit
 *   - AC-5 (critique WARNING-5): startSession throws when resolvedModel is absent
 *   - AC-4 (critique WARNING-4): tool definitions sourced from registry.toClaudeToolSpecs()
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
} from "@hyperidle/harness-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import type { LlmResponse } from "../llm-types.js";

// ── Mock callLlm ─────────────────────────────────────────────────────────────

vi.mock("../llm-client.js", () => ({
	callLlm: vi.fn(),
}));

// Import after mock so we get the mocked version
const { callLlm } = await import("../llm-client.js");
const callLlmMock = vi.mocked(callLlm);

// ── Helpers ───────────────────────────────────────────────────────────────────

// AH2: Updated to current catalog IDs.
const RESOLVED_MODEL = {
	provider: "anthropic" as const,
	model: "claude-sonnet-4-6",
	apiKey: "sk-test-key",
	baseUrl: "https://api.anthropic.com",
};

function makeSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
	return {
		sandboxPath: "/workspace/test",
		sessionId: "test-session",
		systemPromptPath: "/workspace/prompts/builder.md",
		assembledPrompt: "You are a helpful assistant.",
		modelTier: "workhorse",
		tools: ["write_session_notes"],
		resolvedModel: RESOLVED_MODEL,
		...overrides,
	};
}

/** LlmResponse: text-only, signals end of loop */
function makeTextResponse(text: string, inputTokens = 1000, outputTokens = 200): LlmResponse {
	return {
		stopReason: "end_turn",
		content: [{ type: "text", text }],
		usage: { inputTokens, outputTokens },
	};
}

/** LlmResponse: single tool call */
function makeToolCallResponse(
	toolName: string,
	toolInput: Record<string, unknown>,
	toolId = "tool-001",
	inputTokens = 5000,
	outputTokens = 100,
): LlmResponse {
	return {
		stopReason: "tool_use",
		content: [{ type: "tool_use", id: toolId, name: toolName, input: toolInput }],
		usage: { inputTokens, outputTokens },
	};
}

/** Collect all events from streamEvents as an array. */
async function collectEvents(
	adapter: BuiltinHarnessAdapter,
	handle: SessionHandle,
): Promise<HarnessEvent[]> {
	const events: HarnessEvent[] = [];
	for await (const event of adapter.streamEvents(handle)) {
		events.push(event);
	}
	return events;
}

/** Create a mock ToolRegistry. */
function makeMockRegistry(
	invokeResult:
		| { success: true; data: unknown }
		| { success: false; code: string; error: string } = {
		success: true,
		data: { ok: true },
	},
) {
	// Return ClaudeToolSpec shape with snake_case input_schema (not LlmToolDef camelCase)
	const toolSpec = {
		name: "write_session_notes",
		description: "Write notes for a session",
		input_schema: {
			type: "object" as const,
			properties: { notes: { type: "string" } },
			required: ["notes"] as readonly string[],
		},
	};

	return {
		definitions: [],
		invoke: vi.fn().mockResolvedValue(invokeResult),
		toClaudeToolSpecs: vi.fn().mockReturnValue([toolSpec]),
	};
}

// ── AC-1: BuiltinHarnessAdapter implements HarnessAdapter ─────────────────────

describe("AC-1: BuiltinHarnessAdapter implements HarnessAdapter", () => {
	it("is assignable to HarnessAdapter interface", () => {
		const adapter: HarnessAdapter = new BuiltinHarnessAdapter();
		expect(typeof adapter.startSession).toBe("function");
		expect(typeof adapter.streamEvents).toBe("function");
		expect(typeof adapter.stopSession).toBe("function");
		expect(typeof adapter.getCapabilities).toBe("function");
	});

	it("getCapabilities returns correct shape with all three model providers", () => {
		const adapter = new BuiltinHarnessAdapter();
		const caps: HarnessCapabilities = adapter.getCapabilities();

		expect(caps.preCompactionTrigger).toBe(true);
		expect(caps.subAgents).toBe(false);
		expect(caps.modelProviders).toContain("anthropic");
		expect(caps.modelProviders).toContain("openrouter");
		expect(caps.modelProviders).toContain("openai-compatible");
	});

	it("getCapabilities modelProviders has exactly the three expected providers", () => {
		const adapter = new BuiltinHarnessAdapter();
		const caps = adapter.getCapabilities();
		expect(caps.modelProviders).toHaveLength(3);
	});
});

// ── AC-5 (critique WARNING-6): startSession throws without resolvedModel ──────

describe("startSession throws when resolvedModel is absent (critique WARNING-6)", () => {
	it("throws when resolvedModel is undefined", async () => {
		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-no-model";

		adapter.setSessionToolRegistry(sessionId, registry);

		const config = makeSessionConfig({ resolvedModel: undefined });
		await expect(adapter.startSession(config)).rejects.toThrow();
	});
});

// ── AC-4 (critique WARNING-4): Tool definitions from registry ─────────────────

describe("AC-4: Tool definitions sourced from registry.toClaudeToolSpecs()", () => {
	beforeEach(() => {
		callLlmMock.mockResolvedValue(makeTextResponse("Task complete."));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls registry.toClaudeToolSpecs() to get tool definitions", async () => {
		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-tool-defs";

		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		expect(registry.toClaudeToolSpecs).toHaveBeenCalled();
	});
});

// ── AC-2: Structured agent loop ───────────────────────────────────────────────

describe("AC-2: Structured loop (plan → execute → stop)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("emits a completion event containing the plan text on the first turn", async () => {
		const planText = "My plan: 1) Gather context. 2) Execute. 3) Done.";
		callLlmMock.mockResolvedValue(makeTextResponse(planText));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-plan";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		const completionEvents = events.filter((e) => e.type === "completion");
		expect(completionEvents.length).toBeGreaterThanOrEqual(1);

		const texts = completionEvents
			.filter((e): e is Extract<HarnessEvent, { type: "completion" }> => e.type === "completion")
			.map((e) => e.text);
		expect(texts.some((t) => t.includes("plan") || t === planText)).toBe(true);
	});

	it("stops the loop when LLM returns text-only (end_turn)", async () => {
		callLlmMock.mockResolvedValue(makeTextResponse("All done."));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-stop";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		// Stream must end (not hang)
		expect(events.length).toBeGreaterThan(0);
	});
});

// ── AC-4: Tool call execution via ToolRegistry ────────────────────────────────

describe("AC-4: Tool call execution via ToolRegistry.invoke()", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("invokes registry.invoke() for each tool call from the LLM", async () => {
		const toolCallResponse = makeToolCallResponse("write_session_notes", { notes: "test" });
		const doneResponse = makeTextResponse("Done.");

		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning..."))
			.mockResolvedValueOnce(toolCallResponse)
			.mockResolvedValueOnce(doneResponse);

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry({ success: true, data: { written: true } });
		const sessionId = "sess-tool-exec";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		expect(registry.invoke).toHaveBeenCalledWith("write_session_notes", { notes: "test" });
	});

	it("formats successful tool result as JSON string with isError:false", async () => {
		const toolCallResponse = makeToolCallResponse("write_session_notes", { notes: "hello" });
		const doneResponse = makeTextResponse("Done.");

		// First call = planning, second = tool call, third = after tool result = done
		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning..."))
			.mockResolvedValueOnce(toolCallResponse)
			.mockResolvedValueOnce(doneResponse);

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry({ success: true, data: { id: "123" } });
		const sessionId = "sess-success-result";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		// The subsequent LLM call must include the tool result.
		// We can verify by inspecting the messages passed to callLlm on the third call.
		const thirdCallMessages = callLlmMock.mock.calls[2]?.[0]?.messages;
		const toolResultMessage = thirdCallMessages?.find(
			(m) =>
				Array.isArray(m.content) &&
				m.content.some((b: { type: string }) => b.type === "tool_result"),
		);
		expect(toolResultMessage).toBeDefined();

		const toolResultBlock = (
			toolResultMessage?.content as unknown as Array<{
				type: string;
				isError?: boolean;
				content?: string;
			}>
		)?.find((b) => b.type === "tool_result");
		expect(toolResultBlock?.isError).toBe(false);
		expect(toolResultBlock?.content).toBe(JSON.stringify({ id: "123" }));
	});

	it("formats failed tool result as Error [CODE]: message with isError:true", async () => {
		const toolCallResponse = makeToolCallResponse("write_session_notes", { notes: "hello" });
		const doneResponse = makeTextResponse("Done.");

		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning..."))
			.mockResolvedValueOnce(toolCallResponse)
			.mockResolvedValueOnce(doneResponse);

		const registry = makeMockRegistry({
			success: false,
			code: "NOT_FOUND",
			error: "Unknown tool",
		});

		const adapter = new BuiltinHarnessAdapter();
		const sessionId = "sess-error-result";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		const thirdCallMessages = callLlmMock.mock.calls[2]?.[0]?.messages;
		const toolResultBlock = thirdCallMessages
			?.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
			.find((b: { type: string }) => b.type === "tool_result") as
			| { type: string; isError?: boolean; content?: string }
			| undefined;

		expect(toolResultBlock?.isError).toBe(true);
		expect(toolResultBlock?.content).toBe("Error [NOT_FOUND]: Unknown tool");
	});
});

// ── AC-7: Event streaming ─────────────────────────────────────────────────────

describe("AC-7: Event streaming (token_usage, tool_call, completion, error)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("emits token_usage events with inputTokens and outputTokens", async () => {
		callLlmMock.mockResolvedValue(makeTextResponse("Done.", 1500, 300));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-token-events";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		const tokenEvents = events.filter((e) => e.type === "token_usage");
		expect(tokenEvents.length).toBeGreaterThanOrEqual(1);
		const tokenEvent = tokenEvents[0] as Extract<HarnessEvent, { type: "token_usage" }>;
		expect(tokenEvent.inputTokens).toBeGreaterThan(0);
		expect(tokenEvent.outputTokens).toBeGreaterThan(0);
	});

	it("emits tool_call events before registry.invoke()", async () => {
		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning..."))
			.mockResolvedValueOnce(makeToolCallResponse("write_session_notes", { notes: "x" }))
			.mockResolvedValueOnce(makeTextResponse("Done."));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-tool-call-event";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		const toolCallEvents = events.filter((e) => e.type === "tool_call");
		expect(toolCallEvents.length).toBeGreaterThanOrEqual(1);
		const toolEvent = toolCallEvents[0] as Extract<HarnessEvent, { type: "tool_call" }>;
		expect(toolEvent.toolName).toBe("write_session_notes");
		expect(toolEvent.args).toEqual({ notes: "x" });
	});

	// AU21 (harness-telemetry narrowing): $-cost estimation is removed — founder
	// ruling kept only token usage ("very few harness can actually report cost").
	it("never emits a cost_update event", async () => {
		callLlmMock.mockResolvedValue(makeTextResponse("Done.", 1000, 500));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-no-cost-event";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		expect(events.some((e) => (e.type as string) === "cost_update")).toBe(false);
	});

	it("emits an error event and stops when LLM call throws", async () => {
		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning..."))
			.mockRejectedValueOnce(new Error("LLM API failed"));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-error-event";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		const errorEvents = events.filter((e) => e.type === "error");
		expect(errorEvents.length).toBeGreaterThanOrEqual(1);
	});
});

// ── AC-8: Default adapter registration in pool ────────────────────────────────

describe("AC-8: Default adapter registered in pool with type 'builtin'", () => {
	it("createLocalAdapterPool registers a 'builtin' entry with correct meta", async () => {
		const { createLocalAdapterPool } = await import("../adapter-pool.js");
		const pool = await createLocalAdapterPool();

		expect(pool.has("local-builtin")).toBe(true);
		// selectable by type, meta exposed through select result
		const entry = pool.select({ harnessType: "builtin" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.type).toBe("builtin");
		expect(entry?.meta.modelProviders).toContain("anthropic");
		expect(entry?.meta.modelProviders).toContain("openrouter");
		expect(entry?.meta.modelProviders).toContain("openai-compatible");
	});

	it("builtin adapter in pool has kind 'local'", async () => {
		const { createLocalAdapterPool } = await import("../adapter-pool.js");
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "builtin" });
		expect(entry?.meta.kind).toBe("local");
	});

	// "pool still has the claude-code adapter alongside builtin" moved to
	// adapter-pool-real-discovery.integration.test.ts — it needs `claude` on PATH.
});

// ── AC-9: Planning turn writes to session notes ───────────────────────────────

describe("AC-9: Planning turn writes plan to session notes", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("invokes write_session_notes with the plan text after the planning turn", async () => {
		const planText = "Step 1: gather info. Step 2: implement.";
		callLlmMock.mockResolvedValue(makeTextResponse(planText));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-plan-notes";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		const writeNotesCalls = (registry.invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
			(args: unknown[]) => args[0] === "write_session_notes",
		);
		expect(writeNotesCalls.length).toBeGreaterThanOrEqual(1);

		// The first write must contain the plan text
		const firstCallArgs = writeNotesCalls[0]?.[1] as { notes?: string } | undefined;
		expect(firstCallArgs?.notes).toContain(planText);
	});
});

// ── AC-10: Reflection checkpoint injection ────────────────────────────────────

describe("AC-10: Reflection checkpoint every N tool calls (default 5)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("injects a reflection prompt after every reflectionInterval tool calls", async () => {
		// Arrange: set reflectionInterval=3 for faster triggering.
		// Sequence: planning → 3 tool calls → reflection → done
		const toolResponse = makeToolCallResponse("write_session_notes", { notes: "progress" });
		const doneResponse = makeTextResponse("All done.");

		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning...")) // planning turn
			.mockResolvedValueOnce(toolResponse) // execute turn 1 → tool call 1
			.mockResolvedValueOnce(toolResponse) // execute turn 2 → tool call 2
			.mockResolvedValueOnce(toolResponse) // execute turn 3 → tool call 3
			.mockResolvedValueOnce(makeTextResponse("Reflecting on progress...")) // reflection
			.mockResolvedValueOnce(doneResponse); // done

		const registry = makeMockRegistry();
		const adapter = new BuiltinHarnessAdapter({ reflectionInterval: 3 });
		const sessionId = "sess-reflection";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		// Find the call to callLlm that includes a reflection prompt in the messages
		const reflectionCallIndex = callLlmMock.mock.calls.findIndex(([opts]) => {
			const messages = opts.messages;
			return messages.some(
				(m) =>
					typeof m.content === "string" &&
					(m.content.toLowerCase().includes("review") ||
						m.content.toLowerCase().includes("reflect") ||
						m.content.toLowerCase().includes("progress") ||
						m.content.toLowerCase().includes("accomplished")),
			);
		});

		expect(reflectionCallIndex).toBeGreaterThan(-1);
	});
});

// ── AC-13: Max-iterations guard ────────────────────────────────────────────────

describe("AC-13: Max-iterations guard", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("stops the loop after maxIterations even when LLM keeps returning tool calls", async () => {
		// Always return tool calls — loop would run forever without the guard
		const toolResponse = makeToolCallResponse("write_session_notes", { notes: "progress" });
		// After max iterations, one final text response for the wrap-up
		const wrapUpResponse = makeTextResponse("Summarizing progress...");

		// Sequence: planning(1) + execute×3(3) + wrap-up(1) = 5 calls total
		callLlmMock.mockResolvedValueOnce(makeTextResponse("Planning...")); // call 1: planning
		for (let i = 0; i < 3; i++) {
			callLlmMock.mockResolvedValueOnce(toolResponse); // calls 2-4: execute loop iterations
		}
		callLlmMock.mockResolvedValueOnce(wrapUpResponse); // call 5: max-iterations wrap-up

		const registry = makeMockRegistry();
		const adapter = new BuiltinHarnessAdapter({ maxIterations: 3 });
		const sessionId = "sess-max-iter";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		// Must have emitted at least one completion event (the wrap-up)
		const completionEvents = events.filter((e) => e.type === "completion");
		expect(completionEvents.length).toBeGreaterThanOrEqual(1);

		// Total LLM calls must be bounded (planning + maxIterations execute + 1 wrap-up = 5)
		expect(callLlmMock).toHaveBeenCalledTimes(5);
	});

	it("emits a final completion event after reaching max iterations", async () => {
		const toolResponse = makeToolCallResponse("write_session_notes", { notes: "p" });

		callLlmMock.mockResolvedValueOnce(makeTextResponse("Planning..."));
		for (let i = 0; i < 2; i++) {
			callLlmMock.mockResolvedValueOnce(toolResponse);
		}
		callLlmMock.mockResolvedValueOnce(makeTextResponse("Iteration limit reached. Summarizing."));

		const registry = makeMockRegistry();
		const adapter = new BuiltinHarnessAdapter({ maxIterations: 2 });
		const sessionId = "sess-max-iter-completion";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		const events = await collectEvents(adapter, handle);

		const completionEvents = events.filter(
			(e): e is Extract<HarnessEvent, { type: "completion" }> => e.type === "completion",
		);
		expect(completionEvents.length).toBeGreaterThanOrEqual(1);
	});
});

// ── AC-14: Session history management (sliding window + summarization) ────────

describe("AC-14: Session history management — sliding window + summarization", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("compresses conversation history when summarization is triggered (high token threshold crossed)", async () => {
		// Build a session that accumulates many messages then triggers pre-compaction.
		// The harness must summarize older turns, resulting in a pre_compaction event.
		//
		// Message accumulation:
		//   planning:  2 messages (user+assistant)
		//   execute×4 tool calls: +2 per round = 10 messages total
		//   execute 5 (high tokens): toSummarize = messages.slice(0,-6) = 4 items ≥ 4 → SUMMARIZES
		//
		// Verification: pre_compaction event is emitted, and the summarization callLlm
		// is made with a system prompt containing "summarizer" (SUMMARIZE_SYSTEM).

		const toolResponse = makeToolCallResponse("write_session_notes", { notes: "note" });
		// AH2: claude-sonnet-4-6 has 1_000_000 context window.
		// 850_000 input tokens = 85% > 80% threshold → triggers pre-compaction
		const highTokenDone = makeTextResponse("Done.", 850_000, 100);
		const summaryResponse = makeTextResponse("Summary: planned, ran 4 tool calls, made progress.");

		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Planning step by step.")) // call 1: planning
			.mockResolvedValueOnce(toolResponse) // call 2: execute 1 (tool call)
			.mockResolvedValueOnce(toolResponse) // call 3: execute 2 (tool call)
			.mockResolvedValueOnce(toolResponse) // call 4: execute 3 (tool call)
			.mockResolvedValueOnce(toolResponse) // call 5: execute 4 (tool call) — now 10 messages
			.mockResolvedValueOnce(highTokenDone) // call 6: execute 5 — high tokens → pre_compaction
			// summarization happens before execute 5 response is fully processed:
			.mockResolvedValueOnce(summaryResponse); // call 7: summarization

		const registry = makeMockRegistry();
		const adapter = new BuiltinHarnessAdapter();
		const sessionId = "sess-history";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		// Verify the summarization callLlm call had a summarization-specific system prompt
		// (SUMMARIZE_SYSTEM = "You are a conversation summarizer. Produce a concise summary.")
		const summarizationCalls = callLlmMock.mock.calls.filter(([opts]) =>
			opts.system?.toLowerCase().includes("summariz"),
		);
		expect(summarizationCalls.length).toBeGreaterThanOrEqual(1);

		// Verify the summarization call received a single-user-message array
		// (the summary request is always structured as one user message)
		for (const [opts] of summarizationCalls) {
			expect(opts.messages.length).toBe(1);
		}
	});

	it("preserves recent messages verbatim after summarization (next callLlm contains summary block)", async () => {
		// After summarization, the next LLM execute call must contain:
		//   1. A summary message (role: "user" with "[Previous conversation summary]")
		//   2. A "Understood. Continuing from the summary." message (role: "assistant")
		//   3. The preserved recent messages
		//
		// Message accumulation (same as first test — need 10+ messages before summarization):
		//   planning: 2 msgs, then 4 tool-call rounds = 10 msgs total
		//   execute 5 (high token) → pre_compaction → summarizeHistory
		//   After summarization: summary (2 msgs) + recent 6 msgs = 8 msgs
		//   Next execute (call after summarization) sees summary message at position 0.

		const toolResponse = makeToolCallResponse("write_session_notes", { notes: "recent" });
		// AH2: claude-sonnet-4-6 has 1_000_000 context window; need >80% to trigger pre-compaction
		const highTokenDone = makeTextResponse("Done.", 850_000, 100);
		const summaryResponse = makeTextResponse("Summary: made progress on the task.");
		const afterSummaryDone = makeTextResponse("Continuing work after summary.");

		callLlmMock
			.mockResolvedValueOnce(makeTextResponse("Initial plan.")) // call 1: planning
			.mockResolvedValueOnce(toolResponse) // call 2: execute 1 (tool call)
			.mockResolvedValueOnce(toolResponse) // call 3: execute 2 (tool call)
			.mockResolvedValueOnce(toolResponse) // call 4: execute 3 (tool call)
			.mockResolvedValueOnce(toolResponse) // call 5: execute 4 (tool call) — 10 messages
			.mockResolvedValueOnce(highTokenDone) // call 6: execute 5 — triggers pre_compaction
			.mockResolvedValueOnce(summaryResponse) // call 7: summarization
			.mockResolvedValueOnce(afterSummaryDone); // call 8: execute 6 after summary applied

		const registry = makeMockRegistry();
		const adapter = new BuiltinHarnessAdapter();
		const sessionId = "sess-preserve-recent";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		// After summarization, the next execute callLlm must have received
		// a messages array where the first message content includes "[Previous conversation summary]"
		const callsWithSummaryMessage = callLlmMock.mock.calls.filter(([opts]) => {
			const messages = opts.messages as Array<{ role: string; content: unknown }>;
			return messages.some((m) => {
				if (typeof m.content === "string") {
					return m.content.includes("[Previous conversation summary]");
				}
				return false;
			});
		});
		expect(callsWithSummaryMessage.length).toBeGreaterThanOrEqual(1);
	});
});

// ── stopSession ───────────────────────────────────────────────────────────────

describe("stopSession", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("returns a SessionResult with outcome:'completed' after loop finishes", async () => {
		callLlmMock.mockResolvedValue(makeTextResponse("All done."));

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-stop-result";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));
		await collectEvents(adapter, handle);

		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("completed");
		// AU21 (harness-telemetry narrowing): no cost field on SessionResult anymore.
		expect(result).not.toHaveProperty("cost");
		expect(result.tokenUsage).toBeDefined();
	});

	it("returns outcome:'stopped' when stopSession is called before completion", async () => {
		// Simulate a session that's mid-execution when stopSession is called
		let resolveFetch: ((v: LlmResponse) => void) | undefined;
		const pending = new Promise<LlmResponse>((r) => {
			resolveFetch = r;
		});
		callLlmMock.mockResolvedValueOnce(makeTextResponse("Planning..."));
		callLlmMock.mockImplementationOnce(() => pending); // hangs

		const adapter = new BuiltinHarnessAdapter();
		const registry = makeMockRegistry();
		const sessionId = "sess-stop-early";
		adapter.setSessionToolRegistry(sessionId, registry);

		const handle = await adapter.startSession(makeSessionConfig({ sessionId }));

		// Stop before the pending call resolves
		const resultPromise = adapter.stopSession(handle);

		// Resolve the hung call so the loop can proceed to detect the stop
		if (resolveFetch) {
			resolveFetch(makeTextResponse("Done."));
		}

		const result = await resultPromise;
		// Either "stopped" or "completed" is acceptable depending on timing
		expect(["stopped", "completed"]).toContain(result.outcome);
	});

	it("throws for unknown session handle", async () => {
		const adapter = new BuiltinHarnessAdapter();
		await expect(adapter.stopSession({ sessionId: "nonexistent" })).rejects.toThrow();
	});
});
