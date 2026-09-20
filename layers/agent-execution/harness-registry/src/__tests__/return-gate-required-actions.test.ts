/**
 * AU27 Increment 3 (Decision 3) — `createGate(requiredReturnActions?)`'s
 * predicate narrowing. A gate required to `["send_message"]` is not flipped
 * by `edit_task` — only by `send_message` itself. Absent
 * `requiredReturnActions` preserves the pre-Increment-3 default (any member
 * of the closed return set flips the gate) — proven against the SAME
 * `createReturnEnforcement()` singleton `return-gate.test.ts` exercises,
 * isolated per test so the two files never share mutable state.
 */
import type { HarnessEvent } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { createReturnEnforcement } from "../return-enforcement.js";

function toolCallEvent(toolName: string, args: Record<string, unknown> = {}): HarnessEvent {
	return { type: "tool_call", toolName, args };
}

describe("createGate(requiredReturnActions) narrows the return predicate", () => {
	it("required=['send_message'] — a handoff edit_task does NOT flip the gate", () => {
		const enforcement = createReturnEnforcement();
		const gate = enforcement.createGate(["send_message"], "task-1");
		gate.observe(toolCallEvent("edit_task", { id: "task-1", ownerAgentId: "agent-7" }));
		expect(gate.returned).toBe(false);
		expect(enforcement.evaluate(gate, "completed")).toBe("not_returned");
	});

	it("required=['send_message'] — send_message DOES flip the gate", () => {
		const enforcement = createReturnEnforcement();
		const gate = enforcement.createGate(["send_message"]);
		gate.observe(toolCallEvent("send_message"));
		expect(gate.returned).toBe(true);
		expect(enforcement.evaluate(gate, "completed")).toBe("returned");
	});

	it("required=['send_message'] — namespaced send_message (MCP/opencode) DOES flip the gate", () => {
		const enforcement = createReturnEnforcement();
		const gate = enforcement.createGate(["send_message"]);
		gate.observe(toolCallEvent("mcp__hyperidle__send_message"));
		expect(gate.returned).toBe(true);
	});

	it("required absent — any return action flips the gate (unchanged pre-Increment-3 default)", () => {
		const enforcement = createReturnEnforcement();
		const gate = enforcement.createGate(undefined, "task-1");
		gate.observe(toolCallEvent("edit_task", { id: "task-1", ownerAgentId: "agent-7" }));
		expect(gate.returned).toBe(true);

		const gate2 = enforcement.createGate();
		gate2.observe(toolCallEvent("send_message"));
		expect(gate2.returned).toBe(true);
	});

	it("required=['edit_task'] — send_message does NOT flip the gate (symmetric over-permission guard)", () => {
		const enforcement = createReturnEnforcement();
		const gate = enforcement.createGate(["edit_task"], "task-1");
		gate.observe(toolCallEvent("send_message"));
		expect(gate.returned).toBe(false);
		gate.observe(toolCallEvent("edit_task", { id: "task-1", ownerAgentId: "agent-7" }));
		expect(gate.returned).toBe(true);
	});
});
