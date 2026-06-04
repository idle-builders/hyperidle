/**
 * X7: Tests for EvalHarnessAdapter.
 *
 * Verifies that the mock harness correctly replays scripted tool calls,
 * cost updates, and completions as HarnessEvent sequences.
 */

import { describe, expect, it } from "vitest";
import { EvalHarnessAdapter } from "../eval-harness-adapter.js";
import type { HarnessScript } from "../types.js";

describe("EvalHarnessAdapter", () => {
	it("returns a session handle from startSession", async () => {
		const adapter = new EvalHarnessAdapter({ turns: [] });
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});
		expect(handle.sessionId).toBeDefined();
		expect(typeof handle.sessionId).toBe("string");
	});

	it("emits no events for an empty script", async () => {
		const adapter = new EvalHarnessAdapter({ turns: [] });
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});

		const events = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		expect(events).toHaveLength(0);
	});

	it("emits tool_call events in order for each scripted turn", async () => {
		const script: HarnessScript = {
			turns: [
				{
					toolCalls: [{ toolName: "write_session_notes", args: { notes: "test notes" } }],
				},
				{
					toolCalls: [
						{
							toolName: "write_memory",
							args: { layer: "L2", kind: "pattern", title: "T", body: "B" },
						},
					],
				},
			],
		};

		const adapter = new EvalHarnessAdapter(script);
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});

		const events = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ type: "tool_call", toolName: "write_session_notes" });
		expect(events[1]).toMatchObject({ type: "tool_call", toolName: "write_memory" });
	});

	it("emits cost_update event when costDelta is positive", async () => {
		const script: HarnessScript = {
			turns: [
				{
					toolCalls: [],
					costDelta: 0.5,
				},
			],
		};

		const adapter = new EvalHarnessAdapter(script);
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});

		const events = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: "cost_update", deltaCost: 0.5 });
	});

	it("does not emit cost_update when costDelta is zero or undefined", async () => {
		const script: HarnessScript = {
			turns: [
				{ toolCalls: [], costDelta: 0 },
				{ toolCalls: [], costDelta: undefined },
			],
		};

		const adapter = new EvalHarnessAdapter(script);
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});

		const events = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		expect(events).toHaveLength(0);
	});

	it("emits completion event when completion text is set", async () => {
		const script: HarnessScript = {
			turns: [
				{
					toolCalls: [],
					completion: "Done with task.",
				},
			],
		};

		const adapter = new EvalHarnessAdapter(script);
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});

		const events = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ type: "completion", text: "Done with task." });
	});

	it("emits tool_calls then cost_update then completion within a turn", async () => {
		const script: HarnessScript = {
			turns: [
				{
					toolCalls: [{ toolName: "write_session_notes", args: { notes: "N" } }],
					costDelta: 0.1,
					completion: "Done.",
				},
			],
		};

		const adapter = new EvalHarnessAdapter(script);
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});

		const events = [];
		for await (const event of adapter.streamEvents(handle)) {
			events.push(event);
		}

		expect(events).toHaveLength(3);
		expect(events[0]).toMatchObject({ type: "tool_call" });
		expect(events[1]).toMatchObject({ type: "cost_update" });
		expect(events[2]).toMatchObject({ type: "completion" });
	});

	it("stopSession returns completed outcome", async () => {
		const adapter = new EvalHarnessAdapter({ turns: [] });
		const handle = await adapter.startSession({
			workspacePath: "/tmp/test",
			soulPromptPath: "",
			composedPrompt: "test",
			modelTier: "workhorse",
			tools: [],
		});
		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("completed");
	});

	it("getCapabilities returns mcpSupport=false", () => {
		const adapter = new EvalHarnessAdapter({ turns: [] });
		const caps = adapter.getCapabilities();
		expect(caps.mcpSupport).toBe(false);
	});
});
