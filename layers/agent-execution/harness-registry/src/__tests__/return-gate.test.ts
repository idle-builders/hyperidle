/**
 * Unit tests for ReturnGate + force-budget helper.
 *
 * Covers:
 *   Closed return set — every RETURN_ACTION_NAMES member maps to a real tool.
 *   Detection — not_returned when no return seen; returned when return seen.
 *   Mid-turn non-terminal tool use is unaffected by the gate.
 *   Forcing (unit): shouldForceReturn helper is bounded at MAX_FORCE_RETURNS.
 *   Capability shape: returnEnforcement channel declared per adapter (non-optional
 *   — the type system forces this, `npm run check` fails any omission).
 */

import {
	FORCE_RETURN_MESSAGE,
	type HarnessEvent,
	MAX_FORCE_RETURNS,
	shouldForceReturn,
} from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { createReturnEnforcement } from "../return-enforcement.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";

const enforcement = createReturnEnforcement({ isolated: true });
const createReturnGate = () => enforcement.createGate();
const evaluateReturn = (
	gate: ReturnType<typeof createReturnGate>,
	reason: "completed" | "crashed" | "stopped",
) => enforcement.evaluate(gate, reason);
type ReturnVerdict = ReturnType<typeof evaluateReturn>;

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

// ── AC3: exemptions (crashed / stopped are never not_returned) ─

describe("ReturnGate — AC3: exemptions (non-completion end-reasons never flagged)", () => {
	it("'crashed' end-reason is exempt — never flagged not_returned", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("read_inbox"));

		expect(evaluateReturn(gate, "crashed")).toBe("returned");
	});

	it("'stopped' (aborted) end-reason is exempt", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("write_memory", {}));

		expect(evaluateReturn(gate, "stopped")).toBe("returned");
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
		];
		for (const name of midTurnTools) {
			gate.observe(toolCallEvent(name, {}));
		}
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

	it("non-tool events (completion, token_usage) do not affect returned flag", () => {
		const gate = createReturnGate();
		gate.observe({ type: "completion", text: "done" });
		gate.observe({ type: "token_usage", inputTokens: 100, outputTokens: 50 });

		expect(gate.returned).toBe(false);
		expect(evaluateReturn(gate, "completed")).toBe("not_returned");
	});

	it("gate.observe() never throws for any event type", () => {
		const gate = createReturnGate();
		const events: HarnessEvent[] = [
			{ type: "tool_call", toolName: "read_inbox", args: {} },
			{ type: "completion", text: "done" },
			{ type: "token_usage", inputTokens: 1, outputTokens: 1 },
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
		expect(gate.returned).toBe(false);
	});
});

// ── AC5: gate is observation-only (no interception / no throwing) ────────────

describe("ReturnGate — AC5: gate is observation-only", () => {
	it("observe() on a return tool_call does not throw or intercept", () => {
		const gate = createReturnGate();
		expect(() => gate.observe(toolCallEvent("submit_review", {}))).not.toThrow();
	});

	it("multiple gates are independent (no shared state)", () => {
		const gateA = createReturnGate();
		const gateB = createReturnGate();

		gateA.observe(toolCallEvent("submit_review", {}));

		expect(gateA.returned).toBe(true);
		expect(gateB.returned).toBe(false);
	});
});

// ── Shared constants ───────────────────────────────────────────────────────

describe("shared forcing constants", () => {
	it("FORCE_RETURN_MESSAGE is a non-empty string naming the three return tools", () => {
		expect(typeof FORCE_RETURN_MESSAGE).toBe("string");
		expect(FORCE_RETURN_MESSAGE.length).toBeGreaterThan(0);
		expect(FORCE_RETURN_MESSAGE).toContain("submit_review");
		expect(FORCE_RETURN_MESSAGE).toContain("handoff_to");
		expect(FORCE_RETURN_MESSAGE).toContain("send_message");
	});

	it("MAX_FORCE_RETURNS is 2 (architecture-specified budget)", () => {
		expect(typeof MAX_FORCE_RETURNS).toBe("number");
		expect(Number.isInteger(MAX_FORCE_RETURNS)).toBe(true);
		expect(MAX_FORCE_RETURNS).toBe(2);
	});
});

// ── Force-budget helper (shouldForceReturn) ───────────────────────────────────

describe("shouldForceReturn helper", () => {
	it("returns null when return was already seen (gate.returned === true)", () => {
		const gate = createReturnGate();
		gate.observe(toolCallEvent("submit_review", {}));
		expect(shouldForceReturn(gate, 0)).toBeNull();
		expect(shouldForceReturn(gate, 1)).toBeNull();
		expect(shouldForceReturn(gate, 99)).toBeNull();
	});

	it("returns FORCE_RETURN_MESSAGE on first no-return stop attempt (forceCount=0)", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, 0)).toBe(FORCE_RETURN_MESSAGE);
	});

	it("returns FORCE_RETURN_MESSAGE on second no-return stop attempt (forceCount=1)", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, 1)).toBe(FORCE_RETURN_MESSAGE);
	});

	it("returns null (budget exhausted) when forceCount === MAX_FORCE_RETURNS", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, MAX_FORCE_RETURNS)).toBeNull();
	});

	it("returns null (budget exhausted) when forceCount > MAX_FORCE_RETURNS", () => {
		const gate = createReturnGate();
		expect(shouldForceReturn(gate, MAX_FORCE_RETURNS + 1)).toBeNull();
		expect(shouldForceReturn(gate, 100)).toBeNull();
	});

	it("force is bounded: exactly MAX_FORCE_RETURNS injections, then null", () => {
		const gate = createReturnGate();
		const injections: (string | null)[] = [];
		let forceCount = 0;
		for (let attempt = 0; attempt <= MAX_FORCE_RETURNS + 1; attempt++) {
			const msg = shouldForceReturn(gate, forceCount);
			injections.push(msg);
			if (msg !== null) forceCount++;
		}
		const forceMessages = injections.filter((m) => m !== null);
		const nullResponses = injections.filter((m) => m === null);

		expect(forceMessages).toHaveLength(MAX_FORCE_RETURNS);
		expect(nullResponses.length).toBeGreaterThan(0);
		expect(injections[MAX_FORCE_RETURNS]).toBeNull();
	});

	it("shouldForceReturn is pure: same inputs same output, no mutation of gate", () => {
		const gate = createReturnGate();
		const result1 = shouldForceReturn(gate, 0);
		const result2 = shouldForceReturn(gate, 0);
		expect(result1).toBe(result2);
		expect(gate.returned).toBe(false);
	});
});

// ── returnEnforcement channel declared per adapter ──────────────────────────
//
// returnEnforcement is non-optional — every adapter must declare its
// provisioning channel. The type system forces this (npm run check fails
// any omission).

describe("returnEnforcement channel declared per adapter", () => {
	// ── Hard-block adapters ────────────────────────────────────────────────

	it("BuiltinHarnessAdapter: returnEnforcement='builtin-loop'", () => {
		const adapter = new BuiltinHarnessAdapter();
		const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;
		// FAILS red until Task 6 adds returnEnforcement:"builtin-loop"
		expect(caps.returnEnforcement).toBe("builtin-loop");
	});

	it("claude CLI adapter (CliHarnessAdapter): returnEnforcement='settings-claude'", () => {
		const adapter = new CliHarnessAdapter(cliAdapterFixture("claude"));
		const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;
		expect(caps.returnEnforcement).toBe("settings-claude");
	});

	// ── v3 fields are GONE (v4 guard) ───────────────────────────────────

	it("HarnessCapabilities NO LONGER has hasNativeReturnHook (v3 removed in Task 1)", () => {
		const caps = new BuiltinHarnessAdapter().getCapabilities() as unknown as Record<
			string,
			unknown
		>;
		// FAILS red until Task 1/6 removes hasNativeReturnHook
		expect("hasNativeReturnHook" in caps).toBe(false);
	});

	it("HarnessCapabilities NO LONGER has canReEngage (v3 removed in Task 1)", () => {
		const caps = new BuiltinHarnessAdapter().getCapabilities() as unknown as Record<
			string,
			unknown
		>;
		// FAILS red until Task 1/6 removes canReEngage
		expect("canReEngage" in caps).toBe(false);
	});

	it("HarnessAdapter NO LONGER has continueSession? (v3 Mode-2 removed in Task 1)", () => {
		const adapter = new BuiltinHarnessAdapter() as unknown as Record<string, unknown>;
		// FAILS red until Task 1 removes continueSession? from the interface
		expect("continueSession" in adapter).toBe(false);
	});
});
