/**
 * AU27 Increment 3 (Decision 3) — `createGate(requiredReturnActions?)`'s
 * predicate narrowing. A gate required to `["reply"]` is not flipped by
 * `send_message`/`handoff_to`/`submit_review` — only by `reply` itself.
 * Absent `requiredReturnActions` preserves the pre-Increment-3 default (any
 * member of the closed return set flips the gate) — proven against the SAME
 * `createReturnEnforcement()` singleton `return-gate.test.ts` exercises,
 * isolated per test so the two files never share mutable state.
 */
import type { HarnessEvent } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createReturnEnforcement } from "../return-enforcement.js";

function toolCallEvent(toolName: string): HarnessEvent {
	return { type: "tool_call", toolName, args: {} };
}

describe("createGate(requiredReturnActions) narrows the return predicate", () => {
	it("required=['reply'] — send_message does NOT flip the gate", () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const gate = enforcement.createGate(["reply"]);
		gate.observe(toolCallEvent("send_message"));
		expect(gate.returned).toBe(false);
		expect(enforcement.evaluate(gate, "completed")).toBe("not_returned");
	});

	it("required=['reply'] — reply DOES flip the gate", () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const gate = enforcement.createGate(["reply"]);
		gate.observe(toolCallEvent("reply"));
		expect(gate.returned).toBe(true);
		expect(enforcement.evaluate(gate, "completed")).toBe("returned");
	});

	it("required=['reply'] — namespaced reply (MCP/opencode) DOES flip the gate", () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const gate = enforcement.createGate(["reply"]);
		gate.observe(toolCallEvent("mcp__hyperidle__reply"));
		expect(gate.returned).toBe(true);
	});

	it("required absent — any return action flips the gate (unchanged pre-Increment-3 default)", () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const gate = enforcement.createGate();
		gate.observe(toolCallEvent("reply"));
		expect(gate.returned).toBe(true);

		const gate2 = enforcement.createGate();
		gate2.observe(toolCallEvent("send_message"));
		expect(gate2.returned).toBe(true);
	});

	it("required with the trio — reply does NOT flip a trio-required gate (symmetric over-permission guard)", () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const gate = enforcement.createGate(["submit_review", "handoff_to", "send_message"]);
		gate.observe(toolCallEvent("reply"));
		expect(gate.returned).toBe(false);
		gate.observe(toolCallEvent("submit_review"));
		expect(gate.returned).toBe(true);
	});
});
