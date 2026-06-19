import { describe, expect, it } from "vitest";
import { normalizeHarnessEvent } from "../harness-event-normalization.js";

describe("AM2 normalizeHarnessEvent", () => {
	it("normalizes equivalent completion events to the same downstream shape", () => {
		const builtinNative = { type: "completion", text: "done", ignored: "native-only" };
		const cliNative = JSON.parse('{"type":"completion","text":"done"}') as unknown;

		expect(normalizeHarnessEvent(builtinNative)).toEqual(normalizeHarnessEvent(cliNative));
		expect(normalizeHarnessEvent(builtinNative)).toEqual({ type: "completion", text: "done" });
	});

	it("preserves captured tool calls on completion events", () => {
		expect(
			normalizeHarnessEvent({
				type: "completion",
				text: "draft ready",
				toolCalls: [
					{
						name: "create_bet",
						input: { title: "AM2" },
						output: '{"betId":"bet-1"}',
						status: "ok",
					},
				],
			}),
		).toEqual({
			type: "completion",
			text: "draft ready",
			toolCalls: [
				{
					name: "create_bet",
					input: { title: "AM2" },
					output: '{"betId":"bet-1"}',
					status: "ok",
				},
			],
		});
	});

	it("normalizes equivalent tool calls to the same downstream shape", () => {
		const builtinNative = { type: "tool_call", toolName: "read_file", args: { path: "x" } };
		const cliNative = { type: "tool_call", toolName: "read_file", args: { path: "x" } };

		expect(normalizeHarnessEvent(builtinNative)).toEqual(normalizeHarnessEvent(cliNative));
	});

	it("coerces unknown native events into a normalized error event", () => {
		expect(
			normalizeHarnessEvent({ type: "provider_specific_delta", payload: { text: "x" } }),
		).toEqual({
			type: "error",
			code: "UnknownHarnessEvent",
			message: "Unknown harness event: provider_specific_delta",
		});
	});
});
