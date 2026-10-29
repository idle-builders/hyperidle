/**
 * The return-gate's required-subset narrowing: plain membership in the closed return set both
 * under-binds a session with a specific required action (it could satisfy the gate with either of
 * two names, not the one it actually needs) and over-permits one (the assistant has both
 * `send_message` and `edit_task` in its ordinary registry too). `isRequiredReturnAction`/
 * `buildForceReturnMessage`/`shouldForceReturn`'s `required` param close that gap — the requirement
 * is a SET, never a lone string.
 */
import { describe, expect, it } from "vitest";
import {
	buildForceReturnMessage,
	FORCE_RETURN_MESSAGE,
	isRequiredReturnAction,
	isReturnAction,
	shouldForceReturn,
} from "../return-actions.js";

/**
 * `edit_task` gate: terminal only when edit targets own task AND moves it away from the agent.
 * Terminal only when the edit is the session's OWN task AND moves it away from the calling agent.
 */
describe("isReturnAction — edit_task is gated on the session's own task moving away from the agent", () => {
	it("own task + owner change ⇒ terminal (the handoff case)", () => {
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "agent-7" }, "task-1")).toBe(
			true,
		);
	});

	it("own task + state moves to review ⇒ NOT terminal (review requires a card, not edit_task)", () => {
		expect(isReturnAction("edit_task", { id: "task-1", state: "review" }, "task-1")).toBe(false);
	});

	it("own task + state moves to done ⇒ terminal", () => {
		expect(isReturnAction("edit_task", { id: "task-1", state: "done" }, "task-1")).toBe(true);
	});

	it("subtask create with an owner ⇒ NOT terminal (no id — not the session's own task)", () => {
		expect(isReturnAction("edit_task", { ownerAgentId: "agent-7" }, "task-1")).toBe(false);
	});

	it("editing another task with an owner ⇒ NOT terminal", () => {
		expect(isReturnAction("edit_task", { id: "task-2", ownerAgentId: "agent-7" }, "task-1")).toBe(
			false,
		);
	});

	it("own task, ordinary field edit (title, no owner/state-away change) ⇒ NOT terminal", () => {
		expect(isReturnAction("edit_task", { id: "task-1", title: "New title" }, "task-1")).toBe(false);
	});

	it("own task, state stays put (e.g. accepted) ⇒ NOT terminal", () => {
		expect(isReturnAction("edit_task", { id: "task-1", state: "accepted" }, "task-1")).toBe(false);
	});

	it("no taskId in context ⇒ NOT terminal, even with matching-looking args", () => {
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "agent-7" })).toBe(false);
	});

	/**
	 */
	it("edit_task with no id and no session task is not terminal", () => {
		expect(isReturnAction("edit_task", { ownerAgentId: "agent-7" }, undefined)).toBe(false);
	});
});

describe("isRequiredReturnAction — return predicate narrowed to a required subset", () => {
	it("required absent ⇒ falls back to plain membership (unchanged pre-Increment-3 behavior)", () => {
		expect(isRequiredReturnAction("send_message", undefined)).toBe(true);
		expect(
			isRequiredReturnAction(
				"edit_task",
				undefined,
				{ id: "task-1", ownerAgentId: "agent-7" },
				"task-1",
			),
		).toBe(true);
		expect(isRequiredReturnAction("read_inbox", undefined)).toBe(false);
	});

	it("required empty array ⇒ also falls back to plain membership", () => {
		expect(isRequiredReturnAction("send_message", [])).toBe(true);
	});

	it("a gate required to ['edit_task'] is NOT satisfied by send_message", () => {
		expect(isRequiredReturnAction("send_message", ["edit_task"])).toBe(false);
	});

	it("a gate required to ['edit_task'] IS satisfied by edit_task", () => {
		expect(
			isRequiredReturnAction(
				"edit_task",
				["edit_task"],
				{ id: "task-1", ownerAgentId: "agent-7" },
				"task-1",
			),
		).toBe(true);
	});

	it("symmetrically, a gate required to ['send_message'] is NOT satisfied by edit_task", () => {
		expect(
			isRequiredReturnAction(
				"edit_task",
				["send_message"],
				{ id: "task-1", ownerAgentId: "agent-7" },
				"task-1",
			),
		).toBe(false);
		expect(isRequiredReturnAction("send_message", ["send_message"])).toBe(true);
	});

	it("a non-return-action tool name is never a required return action, regardless of the required set", () => {
		expect(isRequiredReturnAction("read_inbox", ["read_inbox"])).toBe(false);
	});

	it("honors MCP namespacing against the required set", () => {
		expect(isRequiredReturnAction("mcp__hyperidle__send_message", ["send_message"])).toBe(true);
		expect(isRequiredReturnAction("mcp__hyperidle__edit_task", ["send_message"])).toBe(false);
		expect(isRequiredReturnAction("hyperidle_send_message", ["send_message"])).toBe(true);
	});

	/**
	 * `return_status` (the self-check bridge tool) is never a member of the
	 * base closed set — a subscription wake's `required` subset is the ONLY
	 * way it can satisfy the gate.
	 */
	it("required=['return_status'] IS satisfied by return_status", () => {
		expect(isRequiredReturnAction("return_status", ["return_status"])).toBe(true);
		expect(isRequiredReturnAction("mcp__hyperidle__return_status", ["return_status"])).toBe(true);
		expect(isRequiredReturnAction("hyperidle_return_status", ["return_status"])).toBe(true);
	});

	it("return_status is NOT a satisfying action with no required subset (an unfiltered task session cannot stop by merely checking its status)", () => {
		expect(isRequiredReturnAction("return_status", undefined)).toBe(false);
		expect(isRequiredReturnAction("return_status", [])).toBe(false);
	});

	it("required=['send_message'] is NOT satisfied by return_status", () => {
		expect(isRequiredReturnAction("return_status", ["send_message"])).toBe(false);
	});
});

describe("buildForceReturnMessage — tailored forcing message", () => {
	it("required absent or empty returns the byte-identical default message", () => {
		expect(buildForceReturnMessage()).toBe(FORCE_RETURN_MESSAGE);
		expect(buildForceReturnMessage([])).toBe(FORCE_RETURN_MESSAGE);
	});

	it("required ['send_message'] names send_message, not edit_task", () => {
		const msg = buildForceReturnMessage(["send_message"]);
		expect(msg).toContain("send_message");
		expect(msg).not.toContain("edit_task");
	});

	it("required with multiple members names all of them, joined", () => {
		const msg = buildForceReturnMessage(["edit_task", "send_message"]);
		expect(msg).toContain("edit_task");
		expect(msg).toContain("send_message");
	});
});

describe("shouldForceReturn — required param narrows the forcing message", () => {
	it("required=['send_message'] — not-returned gate, budget available ⇒ names send_message, not edit_task", () => {
		const gate = { returned: false };
		const msg = shouldForceReturn(gate, 0, ["send_message"]);
		expect(msg).not.toBeNull();
		expect(msg).toContain("send_message");
		expect(msg).not.toContain("edit_task");
	});

	it("required=['send_message'] — returned gate ⇒ null regardless of required", () => {
		const gate = { returned: true };
		expect(shouldForceReturn(gate, 0, ["send_message"])).toBeNull();
	});

	it("required=['send_message'] — budget spent ⇒ null regardless of required", () => {
		const gate = { returned: false };
		expect(shouldForceReturn(gate, 2, ["send_message"])).toBeNull();
	});

	it("required absent ⇒ byte-identical to the pre-Increment-3 call shape", () => {
		const gate = { returned: false };
		expect(shouldForceReturn(gate, 0)).toBe(FORCE_RETURN_MESSAGE);
		expect(shouldForceReturn(gate, 0, undefined)).toBe(FORCE_RETURN_MESSAGE);
	});
});
