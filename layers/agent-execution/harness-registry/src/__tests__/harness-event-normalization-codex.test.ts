/**
 * preMapCodexEvent coverage via normalizeHarnessEvent public path.
 *
 * Locks every branch of preMapCodexEvent in CI (test:all). The pre-map is
 * required for codex JSONL events to survive normalizeHarnessEvent without
 * becoming UnknownHarnessEvent errors.
 *
 * All assertions use the REAL field paths read from preMapCodexEvent's
 * implementation (item.text, usage.input_tokens / usage.output_tokens).
 *
 * The critical regression guard: turn.completed → token_usage was the
 * previously-erroring case (Fix B) that turned UnknownHarnessEvent into a
 * proper token_usage event. It must be locked here.
 *
 * @lore harness-event-normalization codex-coverage: preMapCodexEvent is
 * applied globally inside normalizeHarnessEvent (before the main switch)
 * because codex's dot-namespaced type strings are disjoint from all other
 * harness vocabularies. These unit tests lock all four codex branches so a
 * regression in any branch fails immediately in CI without a real binary.
 */

import { describe, expect, it } from "vitest";
import { normalizeHarnessEvent } from "../harness-event-normalization.js";

describe("normalizeHarnessEvent — codex pre-map (preMapCodexEvent branches)", () => {
	// ── item.completed → completion ────────────────────────────────────────────

	it("item.completed with item.text → completion(text)", () => {
		// Real codex JSONL shape: { type: "item.completed", item: { text: "..." } }
		const input = { type: "item.completed", item: { text: "hello" } };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("hello");
		}
	});

	it("item.completed with empty item.text → completion('')", () => {
		const input = { type: "item.completed", item: { text: "" } };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("");
		}
	});

	it("item.completed with non-string item.text → completion('')", () => {
		// item.text absent or wrong type → falls back to ""
		const input = { type: "item.completed", item: { role: "assistant" } };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("");
		}
	});

	it("item.completed with no item field → completion('')", () => {
		// Missing item entirely → empty text
		const input = { type: "item.completed" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("");
		}
	});

	// ── turn.completed → token_usage ──────────────────────────────────────────
	// CRITICAL: this is the Fix B regression guard — previously returned UnknownHarnessEvent.

	it("turn.completed with usage.input_tokens + usage.output_tokens → token_usage (Fix B regression lock)", () => {
		// Real codex JSONL shape: { type: "turn.completed", usage: { input_tokens: N, output_tokens: M } }
		const input = {
			type: "turn.completed",
			usage: {
				input_tokens: 10,
				cached_input_tokens: 7,
				output_tokens: 5,
				reasoning_output_tokens: 2,
			},
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(10);
			expect(result.outputTokens).toBe(5);
			expect(result.cachedInputTokens).toBe(7);
			expect(result.reasoningOutputTokens).toBe(2);
		}
	});

	it("turn.completed with zero usage → token_usage(0, 0)", () => {
		const input = { type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(0);
			expect(result.outputTokens).toBe(0);
		}
	});

	it("turn.completed with missing usage → token_usage(0, 0) (graceful fallback)", () => {
		// usage absent → preMapCodexEvent falls back to 0 for both fields
		const input = { type: "turn.completed" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(0);
			expect(result.outputTokens).toBe(0);
		}
	});

	it("turn.completed with non-finite token values → token_usage(0, 0)", () => {
		// Non-finite numbers → preMapCodexEvent substitutes 0
		const input = {
			type: "turn.completed",
			usage: { input_tokens: Number.NaN, output_tokens: Number.POSITIVE_INFINITY },
		};
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(0);
			expect(result.outputTokens).toBe(0);
		}
	});

	// ── Lifecycle events → benign completion ───────────────────────────────────

	it("thread.started → completion('') (lifecycle event, no content)", () => {
		const input = { type: "thread.started", thread_id: "t1" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("");
		}
	});

	it("turn.started → completion('') (lifecycle event, no content)", () => {
		const input = { type: "turn.started", turn_id: "turn-1" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("");
		}
	});

	// ── Unknown codex type → UnknownHarnessEvent error (does not crash) ────────

	it("unknown codex type → error(UnknownHarnessEvent) — does not crash", () => {
		// item.updated is not handled by preMapCodexEvent → falls through to default
		// (returns input unchanged) → normalizeHarnessEvent sees an unrecognized type
		const input = { type: "item.updated", item_id: "i1" };
		const result = normalizeHarnessEvent(input);
		// Unrecognized type → error event (UnknownHarnessEvent)
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.code).toBe("UnknownHarnessEvent");
		}
	});

	// ── Regression guards: canonical and claude-shaped events are NOT mis-transformed ──

	it("canonical completion event is NOT mis-transformed by codex pre-map", () => {
		// A canonical completion event must pass through unchanged
		const input = { type: "completion", text: "x" };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("completion");
		if (result.type === "completion") {
			expect(result.text).toBe("x");
		}
	});

	it("canonical token_usage event is NOT mis-transformed by codex pre-map", () => {
		const input = { type: "token_usage", inputTokens: 7, outputTokens: 3 };
		const result = normalizeHarnessEvent(input);
		expect(result.type).toBe("token_usage");
		if (result.type === "token_usage") {
			expect(result.inputTokens).toBe(7);
			expect(result.outputTokens).toBe(3);
		}
	});

	it("claude-shaped assistant event is NOT mis-transformed by codex pre-map", () => {
		// claude stream-json `assistant` type is not in the canonical set nor in
		// codex's dot-namespaced set → falls through to UnknownHarnessEvent.
		// This guards against the codex pre-map accidentally matching claude types.
		const input = {
			type: "assistant",
			message: { content: [{ type: "text", text: "hello" }] },
		};
		const result = normalizeHarnessEvent(input);
		// "assistant" is not a canonical type and not handled by preMapCodexEvent default
		// → falls to unknownEvent
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.code).toBe("UnknownHarnessEvent");
		}
	});
});
