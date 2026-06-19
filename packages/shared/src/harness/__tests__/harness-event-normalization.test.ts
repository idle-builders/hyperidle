import { describe, expect, it } from "vitest";
import { normalizeHarnessEvent } from "../harness-event-normalization.js";

// AM2: real captured native output shapes, PII redacted / values truncated.
// These prove that arbitrary backend-native event lines either already match the
// normalized union or are surfaced as UnknownHarnessEvent errors, never as silent
// corrupt data.
const CODEX_EXEC_TURN_COMPLETED_LINE = JSON.stringify({
	type: "turn.completed",
	usage: {
		input_tokens: 14845,
		cached_input_tokens: 9088,
		output_tokens: 5,
		reasoning_output_tokens: 0,
	},
});

const CLAUDE_STREAM_RESULT_LINE = JSON.stringify({
	type: "result",
	subtype: "success",
	result: "pong",
	total_cost_usd: 0.01,
	usage: { input_tokens: 6471, output_tokens: 4, cache_creation_input_tokens: 29123 },
});

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

	it("treats a captured Codex exec JSONL line as an unknown backend event", () => {
		const parsed: unknown = JSON.parse(CODEX_EXEC_TURN_COMPLETED_LINE);
		expect(normalizeHarnessEvent(parsed)).toEqual({
			type: "error",
			code: "UnknownHarnessEvent",
			message: "Unknown harness event: turn.completed",
		});
	});

	it("treats a captured Claude Code stream-json result line as an unknown backend event", () => {
		const parsed: unknown = JSON.parse(CLAUDE_STREAM_RESULT_LINE);
		expect(normalizeHarnessEvent(parsed)).toEqual({
			type: "error",
			code: "UnknownHarnessEvent",
			message: "Unknown harness event: result",
		});
	});
});
