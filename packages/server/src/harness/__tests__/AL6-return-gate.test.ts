/**
 * AL6 — Unit tests for ReturnGate observer.
 *
 * Covers:
 *   AC3: A turn that ends without a return action is detected (not_returned); never silent.
 *   AC5: Mid-turn non-terminal tool use is unaffected by the gate.
 *
 * These tests FAIL until return-gate.ts is implemented.
 */

import { describe, expect, it } from "vitest";
import {
	createReturnGate,
	evaluateReturn,
	type ReturnVerdict,
} from "../return-gate.js";
import type { HarnessEvent } from "@hyperidle/shared";

// ── helpers ──────────────────────────────────────────────────────────────────

function toolCallEvent(toolName: string, args: Record<string, unknown> = {}): HarnessEvent {
	return { type: "tool_call", toolName, args };
}

function completionEvent(text = "done"): HarnessEvent {
	return { type: "completion", text };
}

// ── AC3: detection rule ───────────────────────────────────────────────────────

describe("ReturnGate — AC3: detection (not_returned when no return seen)", () => {
	it("verdicts 'not_returned' when stream exhausts with no return action", () => {
		const gate = createReturnGate();
		// Observe non-return tool calls + a completion, but NO return action
		gate.observe(toolCallEvent("read_inbox"));
		gate.observe(toolCallEvent("write_memory", { key: "foo", value: "bar" }));
		gate.observe(completionEvent());

		const verdict: ReturnVerdict = evaluateReturn(gate, "completed");
		expect(verdict).toBe("not_returned");
	});

	it("verdicts 'returned' when submit_review is observed before exhaustion", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("read_inbox"));
		gate.observe(toolCallEvent("submit_review", { message: "LGTM", verdict: "approved" }));
		gate.observe(completionEvent());

		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("verdicts 'returned' when handoff_to is observed", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("handoff_to", { role: "reviewer" }));

		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("verdicts 'returned' when send_message is observed", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("write_session_notes", {}));
		gate.observe(toolCallEvent("send_message", { to: "human-1", body: "Done." }));
		gate.observe(completionEvent());

		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("gate starts unreturned before any events", () => {
		const gate = createReturnGate();
		expect(gate.returned).toBe(false);
		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("returned flag becomes true immediately after a return tool_call", () => {
		const gate = createReturnGate();
		expect(gate.returned).toBe(false);
		gate.observe(toolCallEvent("submit_review", {}));
		expect(gate.returned).toBe(true);
	});
});

// ── AC3: exemptions (crashed / stopped / budget_exhausted are never not_returned) ─

describe("ReturnGate — AC3: exemptions (non-completion end-reasons never flagged)", () => {
	it("'crashed' end-reason is exempt — never flagged not_returned", () => {
		const gate = createReturnGate();
		// Stream had no return action (agent crashed before it could return)
		gate.observe(toolCallEvent("read_inbox"));

		expect(evaluateReturn(gate, "crashed")).toBe("returned");
	});

	it("'stopped' (aborted) end-reason is exempt", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("write_memory", {}));

		expect(evaluateReturn(gate, "stopped")).toBe("returned");
	});

	it("'budget_exhausted' end-reason is exempt", () => {
		const gate = createReturnGate();
		// No return action before budget cut
		expect(evaluateReturn(gate, "budget_exhausted")).toBe("returned");
	});
});

// ── AC5: mid-turn non-terminal tool use is unaffected ───────────────────────

describe("ReturnGate — AC5: mid-turn non-terminal tools do not block the gate", () => {
	it("ten non-return tool_calls followed by submit_review → 'returned'", () => {
		const gate = createReturnGate();
		const midTurnTools = [
			"read_inbox",
			"write_memory",
			"create_artifact",
			"log_task",
			"query_practice",
			"write_session_notes",
			"create_task",
			"score_attention",
			"promote_knowledge",
			"route_item",
		];
		for (const name of midTurnTools) {
			gate.observe(toolCallEvent(name, {}));
		}
		// Confirm still not-returned at this point
		expect(gate.returned).toBe(false);

		gate.observe(toolCallEvent("submit_review", { message: "Done" }));
		expect(gate.returned).toBe(true);
		expect(evaluateReturn(gate, "completed")).toBe("returned");
	});

	it("ten non-return tool_calls with NO return → 'not_returned'", () => {
		const gate = createReturnGate();
		for (let i = 0; i < 10; i++) {
			gate.observe(toolCallEvent("write_memory", { key: `k${i}` }));
		}
		gate.observe(completionEvent());

		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("non-tool events (completion, token_usage, cost_update) do not affect returned flag", () => {
		const gate = createReturnGate();
		gate.observe({ type: "completion", text: "done" });
		gate.observe({ type: "token_usage", inputTokens: 100, outputTokens: 50 });
		gate.observe({ type: "cost_update", totalCost: 1.0, deltaCost: 0.5 });

		// No tool_call emitted — gate must see no return
		expect(gate.returned).toBe(false);
		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("gate.observe() never throws for any event type", () => {
		const gate = createReturnGate();
		const events: HarnessEvent[] = [
			{ type: "tool_call", toolName: "read_inbox", args: {} },
			{ type: "completion", text: "done" },
			{ type: "token_usage", inputTokens: 1, outputTokens: 1 },
			{ type: "cost_update", totalCost: 0, deltaCost: 0 },
			{ type: "error", message: "oops", code: "E001" },
			{ type: "pre_compaction", contextTokens: 1000, maxTokens: 10000 },
		];
		for (const ev of events) {
			expect(() => gate.observe(ev)).not.toThrow();
		}
	});

	it("error event does not count as a return action", () => {
		const gate = createReturnGate();
		gate.observe({ type: "error", message: "tool failed", code: "ETOOLBROKE" });
		// A crashed event path would be exempt via evaluateReturn, but the gate
		// itself must not see the error event as a return.
		expect(gate.returned).toBe(false);
	});
});

// ── AC5: gate is observation-only (no interception / no throwing) ────────────

describe("ReturnGate — AC5: gate is observation-only", () => {
	it("observe() on a return tool_call does not throw or intercept", () => {
		const gate = createReturnGate();
		// The gate must be passive: it can't prevent the event from proceeding
		expect(() => gate.observe(toolCallEvent("submit_review", {}))).not.toThrow();
	});

	it("multiple gates are independent (no shared state)", () => {
		const gateA = createReturnGate();
		const gateB = createReturnGate();

		gateA.observe(toolCallEvent("submit_review", {}));

		// gateB must be unaffected by gateA's observation
		expect(gateA.returned).toBe(true);
		expect(gateB.returned).toBe(false);
	});
});
