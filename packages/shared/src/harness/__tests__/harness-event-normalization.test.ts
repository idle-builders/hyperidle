/**
 * AC6 — real-fixture normalization: THREE-way structural equivalence.
 *
 * The two "real line → UnknownHarnessEvent" assertions are intentionally deleted.
 * Those proved the normalizer does NOT understand real harness output, which is the
 * INVERSE of AC6. This rewrite proves it DOES understand them.
 *
 * Three-way equivalence: Codex, Claude, and builtin token_usage events are structurally
 * identical on the compared fields (type, inputTokens, outputTokens) so a downstream
 * consumer cannot tell which harness produced which.
 *
 * @lore AM2: The builtin path (BuiltinHarnessAdapter.trackUsage) already emits
 * token_usage events in the HyperIdle union shape. The Codex/Claude paths need a
 * per-family pre-normalizer (normalizeNativeHarnessEvent) to map their native shapes.
 * Both paths converge on the same downstream shape — that's AC6.
 */

import { describe, expect, it } from "vitest";
import { normalizeHarnessEvent } from "../harness-event-normalization.js";
import { normalizeNativeHarnessEvent } from "../harness-native-normalization.js";

// Real captured native output shapes from live session probes (AC5 fixtures).
// Values are non-secret: event type + numeric usage only.
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

// The builtin token_usage event as emitted by BuiltinHarnessAdapter.trackUsage.
// This is the THIRD leg of the three-way equivalence (different code path than
// normalizeNativeHarnessEvent — already in the HyperIdle union shape).
const BUILTIN_TOKEN_USAGE_EVENT = {
	type: "token_usage" as const,
	inputTokens: 120,
	outputTokens: 18,
	tier: "primary" as const,
};

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

	it("coerces GENUINELY-UNKNOWN native events into a normalized error event (UnknownHarnessEvent fallback preserved)", () => {
		// provider_specific_delta is genuinely unsupported — this path stays.
		// Note: Codex turn.completed and Claude result are now RECOGNIZED by
		// normalizeNativeHarnessEvent (see tests below) — they no longer reach this fallback.
		expect(
			normalizeHarnessEvent({ type: "provider_specific_delta", payload: { text: "x" } }),
		).toEqual({
			type: "error",
			code: "UnknownHarnessEvent",
			message: "Unknown harness event: provider_specific_delta",
		});
	});

	// ── AC6: THREE-WAY STRUCTURAL EQUIVALENCE ─────────────────────────────────

	it("AC6: Codex turn.completed normalizes to token_usage via per-family pre-normalizer", () => {
		const codexLine: unknown = JSON.parse(CODEX_EXEC_TURN_COMPLETED_LINE);
		const result = normalizeNativeHarnessEvent("codex", codexLine);

		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(14845);
			expect(result.outputTokens).toBe(5);
		}
	});

	it("AC6: Claude result normalizes to token_usage (+ cost_update separately) via per-family pre-normalizer", () => {
		const claudeLine: unknown = JSON.parse(CLAUDE_STREAM_RESULT_LINE);
		const result = normalizeNativeHarnessEvent("claude-code", claudeLine);

		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(6471);
			expect(result.outputTokens).toBe(4);
		}
	});

	it("AC6: builtin token_usage event is already in the downstream union shape (type + inputTokens + outputTokens)", () => {
		// The builtin event reaches the union via BuiltinHarnessAdapter.trackUsage,
		// not via normalizeNativeHarnessEvent. Verify it has the same shape.
		const result = normalizeHarnessEvent(BUILTIN_TOKEN_USAGE_EVENT);

		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(120);
			expect(result.outputTokens).toBe(18);
		}
	});

	it("AC6: THREE-WAY field-by-field equivalence — Codex, Claude, and builtin produce structurally identical token_usage events", () => {
		const codexLine: unknown = JSON.parse(CODEX_EXEC_TURN_COMPLETED_LINE);
		const claudeLine: unknown = JSON.parse(CLAUDE_STREAM_RESULT_LINE);

		const codexResult = normalizeNativeHarnessEvent("codex", codexLine);
		const claudeResult = normalizeNativeHarnessEvent("claude-code", claudeLine);
		const builtinResult = normalizeHarnessEvent(BUILTIN_TOKEN_USAGE_EVENT);

		// All three: same type
		expect(codexResult.type).toBe("token_usage");
		expect(claudeResult.type).toBe("token_usage");
		expect(builtinResult.type).toBe("token_usage");

		// All three: same field names (inputTokens, outputTokens) — not input_tokens
		// This is the convergence proof: native snake_case → camelCase union shape
		if (
			codexResult.type === "token_usage" &&
			claudeResult.type === "token_usage" &&
			builtinResult.type === "token_usage"
		) {
			// Field names must be identical (camelCase)
			expect(typeof codexResult.inputTokens).toBe("number");
			expect(typeof codexResult.outputTokens).toBe("number");
			expect(typeof claudeResult.inputTokens).toBe("number");
			expect(typeof claudeResult.outputTokens).toBe("number");
			expect(typeof builtinResult.inputTokens).toBe("number");
			expect(typeof builtinResult.outputTokens).toBe("number");

			// Downstream consumer cannot distinguish the three by shape:
			// all three have exactly type + inputTokens + outputTokens (+ optional tier)
			// and none has native-only fields (input_tokens, total_cost_usd, etc.)
			expect("input_tokens" in codexResult).toBe(false);
			expect("input_tokens" in claudeResult).toBe(false);
			expect("input_tokens" in builtinResult).toBe(false);
		}
	});

	it("AC6: Claude cost_update is emitted as a separate normalized event (cost_update with totalCost/deltaCost)", () => {
		// Claude's result line carries total_cost_usd — the pre-normalizer should
		// also be able to produce a cost_update event from the same line.
		// This tests that the pre-normalizer surfaces the cost information.
		const claudeLine: unknown = JSON.parse(CLAUDE_STREAM_RESULT_LINE);
		const costResult = normalizeNativeHarnessEvent("claude-code", claudeLine, {
			extractCost: true,
		});

		expect(costResult.type).toBe("cost_update");
		if (costResult.type === "cost_update") {
			expect(typeof costResult.totalCost).toBe("number");
			expect(costResult.totalCost).toBeGreaterThan(0);
			expect(typeof costResult.deltaCost).toBe("number");
		}
	});

	it("AC6: genuinely-unrecognized native types fall through to UnknownHarnessEvent via normalizeNativeHarnessEvent", () => {
		// Confirmed-unsupported type — still becomes UnknownHarnessEvent (graceful degradation)
		const unknownLine = { type: "provider_specific_streaming_delta", data: "x" };
		const result = normalizeNativeHarnessEvent("codex", unknownLine);

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.code).toBe("UnknownHarnessEvent");
		}
	});
});
