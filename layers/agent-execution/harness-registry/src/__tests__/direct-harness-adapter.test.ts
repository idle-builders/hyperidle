import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HarnessAdapter, HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarnessAdapter } from "../harness-adapter-factory.js";
import { callLlm } from "../llm-client.js";

vi.mock("../llm-client.js", () => ({ callLlm: vi.fn() }));

const callLlmMock = vi.mocked(callLlm);
const model = {
	provider: "anthropic" as const,
	model: "claude-sonnet-4-6",
	apiKey: "test",
	baseUrl: "https://api.anthropic.com",
};

function config(sandboxPath: string, sessionId: string, assembledPrompt: string): SessionConfig {
	return {
		sandboxPath,
		sessionId,
		systemPromptPath: path.join(sandboxPath, "prompt.md"),
		assembledPrompt,
		modelTier: "workhorse",
		tools: [],
		resolvedModel: model,
	};
}

async function collect(adapter: HarnessAdapter, sessionId: string) {
	const events: HarnessEvent[] = [];
	for await (const event of adapter.streamEvents({ sessionId })) events.push(event);
	return events;
}

describe("direct harness product operation", () => {
	const roots: string[] = [];
	afterEach(() => {
		vi.clearAllMocks();
		for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
	});

	it("rereads AGENTS.md on every start and emits canonical one-call events", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "direct-harness-"));
		roots.push(root);
		const adapter = createHarnessAdapter({
			kind: "direct",
			model,
			returnEnforcement: "none",
			tools: [
				{
					name: "submit_review",
					description: "return",
					inputSchema: { type: "object", properties: {} },
				},
			],
			maxTokens: 321,
		});
		callLlmMock.mockResolvedValue({
			stopReason: "tool_use",
			content: [
				{ type: "tool_use", id: "t1", name: "submit_review", input: { message: "done" } },
				{ type: "text", text: "finished" },
			],
			usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
		});

		fs.writeFileSync(path.join(root, "AGENTS.md"), "first carrier");
		await adapter.startSession(config(root, "one", "fallback-one"));
		const first = await collect(adapter, "one");
		fs.writeFileSync(path.join(root, "AGENTS.md"), "forced carrier");
		await adapter.startSession(config(root, "two", "fallback-two"));
		await collect(adapter, "two");

		expect(callLlmMock).toHaveBeenCalledTimes(2);
		expect(callLlmMock.mock.calls[0]?.[0]).toMatchObject({
			system: "first carrier",
			maxTokens: 321,
		});
		expect(callLlmMock.mock.calls[1]?.[0]).toMatchObject({ system: "forced carrier" });
		expect(first).toContainEqual({
			type: "tool_call",
			toolName: "submit_review",
			args: { message: "done" },
		});
		expect(first).toContainEqual({ type: "completion", text: "finished" });
		expect(first).toContainEqual({
			type: "token_usage",
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
		});
		// AU21 (harness-telemetry narrowing): no cost_update event of any kind —
		// $-cost estimation is removed, token usage is the only signal emitted.
		expect(first.some((event) => (event.type as string) === "cost_update")).toBe(false);
		expect(adapter.getCapabilities()).toMatchObject({
			returnEnforcement: "none",
			mcpSupport: false,
		});
	});

	it("uses assembled prompt when carrier is absent and clears failed/stopped sessions", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "direct-harness-"));
		roots.push(root);
		const adapter = createHarnessAdapter({ kind: "direct", model, returnEnforcement: "none" });
		callLlmMock.mockRejectedValueOnce(new Error("offline"));
		await adapter.startSession(config(root, "failed", "assembled fallback"));
		expect(await collect(adapter, "failed")).toEqual([
			expect.objectContaining({ type: "error", code: "LLM_CALL_FAILED" }),
		]);
		expect(callLlmMock.mock.calls[0]?.[0]).toMatchObject({ system: "assembled fallback" });
		expect(await collect(adapter, "failed")).toEqual([
			expect.objectContaining({ type: "error", code: "SESSION_NOT_FOUND" }),
		]);

		await adapter.startSession(config(root, "stopped", "stop"));
		expect((await adapter.stopSession({ sessionId: "stopped" })).outcome).toBe("stopped");
		expect((await adapter.stopSession({ sessionId: "stopped" })).outcome).toBe("completed");
		expect(await collect(adapter, "stopped")).toEqual([
			expect.objectContaining({ type: "error", code: "SESSION_NOT_FOUND" }),
		]);
	});

	it.each(["direct", "builtin"] as const)(
		"aborts an active %s LLM call without emitting post-stop events",
		async (kind) => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "stopped-harness-"));
			roots.push(root);
			callLlmMock.mockImplementationOnce(
				(options) =>
					new Promise((_, reject) => {
						options.signal?.addEventListener(
							"abort",
							() => reject(new DOMException("aborted", "AbortError")),
							{ once: true },
						);
					}),
			);
			const adapter =
				kind === "direct"
					? createHarnessAdapter({ kind, model, returnEnforcement: "none" })
					: createHarnessAdapter({ kind, options: { maxIterations: 1 } });
			const sessionId = `active-${kind}`;
			await adapter.startSession(config(root, sessionId, "active"));
			const stream = adapter.streamEvents({ sessionId })[Symbol.asyncIterator]();
			const nextEvent = stream.next();
			await vi.waitFor(() => expect(callLlmMock).toHaveBeenCalledOnce());

			const stopped = await adapter.stopSession({ sessionId });
			expect(stopped.outcome).toBe("stopped");
			expect(await nextEvent).toEqual({ done: true, value: undefined });
		},
	);
});
