/**
 * AU27 Increment 3 (Decision 3) — the return-gate's required-subset
 * narrowing. Plain membership in the closed return set both under-binds a
 * session with a specific required action (a session could satisfy the gate
 * with any of the four names, not the one it actually needs) and
 * over-permits one (the assistant has `send_message`/`edit_task`/
 * `submit_review` in its ordinary registry too). `isRequiredReturnAction`/
 * `buildForceReturnMessage`/`shouldForceReturn`'s `required` param close
 * that gap — the requirement is a SET, never a lone string.
 */
import { describe, expect, it } from "vitest";
import {
	buildForceReturnMessage,
	FORCE_RETURN_MESSAGE,
	isReturnAction,
	isRequiredReturnAction,
	shouldForceReturn,
} from "../return-actions.js";

/**
 * B4 — `edit_task`'s own-task-and-moves-away-from-the-agent gate
 * (`isReturnAction`'s `@lore`). Terminal only when the edit is the session's
 * OWN task AND moves it away from the calling agent.
 */
describe("isReturnAction — edit_task is gated on the session's own task moving away from the agent", () => {
	it("own task + owner change ⇒ terminal (the handoff case)", () => {
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "agent-7" }, "task-1")).toBe(
			true,
		);
	});

	it("own task + state moves to review ⇒ terminal", () => {
		expect(isReturnAction("edit_task", { id: "task-1", state: "review" }, "task-1")).toBe(true);
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
		expect(isReturnAction("edit_task", { id: "task-1", title: "New title" }, "task-1")).toBe(
			false,
		);
	});

	it("own task, state stays put (e.g. accepted) ⇒ NOT terminal", () => {
		expect(isReturnAction("edit_task", { id: "task-1", state: "accepted" }, "task-1")).toBe(false);
	});

	it("no taskId in context ⇒ NOT terminal, even with matching-looking args", () => {
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "agent-7" })).toBe(false);
	});
});

describe("isRequiredReturnAction — return predicate narrowed to a required subset", () => {
	it("required absent ⇒ falls back to plain membership (unchanged pre-Increment-3 behavior)", () => {
		expect(isRequiredReturnAction("send_message", undefined)).toBe(true);
		expect(isRequiredReturnAction("reply", undefined)).toBe(true);
		expect(isRequiredReturnAction("read_inbox", undefined)).toBe(false);
	});

	it("required empty array ⇒ also falls back to plain membership", () => {
		expect(isRequiredReturnAction("send_message", [])).toBe(true);
	});

	it("a gate required to ['reply'] is NOT satisfied by send_message", () => {
		expect(isRequiredReturnAction("send_message", ["reply"])).toBe(false);
		expect(isRequiredReturnAction("edit_task", ["reply"], { ownerAgentId: "agent-7" })).toBe(false);
		expect(isRequiredReturnAction("submit_review", ["reply"])).toBe(false);
	});

	it("a gate required to ['reply'] IS satisfied by reply", () => {
		expect(isRequiredReturnAction("reply", ["reply"])).toBe(true);
	});

	it("symmetrically, a gate required to the trio is NOT satisfied by reply", () => {
		const trio = ["submit_review", "edit_task", "send_message"];
		expect(isRequiredReturnAction("reply", trio)).toBe(false);
		expect(isRequiredReturnAction("submit_review", trio)).toBe(true);
	});

	it("a non-return-action tool name is never a required return action, regardless of the required set", () => {
		expect(isRequiredReturnAction("read_inbox", ["read_inbox"])).toBe(false);
	});

	it("honors MCP namespacing against the required set", () => {
		expect(isRequiredReturnAction("mcp__hyperidle__reply", ["reply"])).toBe(true);
		expect(isRequiredReturnAction("mcp__hyperidle__send_message", ["reply"])).toBe(false);
		expect(isRequiredReturnAction("hyperidle_reply", ["reply"])).toBe(true);
	});
});

describe("buildForceReturnMessage — tailored forcing message", () => {
	it("required absent or empty returns the byte-identical default message", () => {
		expect(buildForceReturnMessage()).toBe(FORCE_RETURN_MESSAGE);
		expect(buildForceReturnMessage([])).toBe(FORCE_RETURN_MESSAGE);
	});

	it("required ['reply'] names reply, not the trio", () => {
		const msg = buildForceReturnMessage(["reply"]);
		expect(msg).toContain("reply");
		expect(msg).not.toContain("submit_review");
		expect(msg).not.toContain("edit_task");
		expect(msg).not.toContain("send_message");
	});

	it("required with multiple members names all of them, joined", () => {
		const msg = buildForceReturnMessage(["submit_review", "reply"]);
		expect(msg).toContain("submit_review");
		expect(msg).toContain("reply");
	});
});

describe("shouldForceReturn — required param narrows the forcing message", () => {
	it("required=['reply'] — not-returned gate, budget available ⇒ names reply, not the trio", () => {
		const gate = { returned: false };
		const msg = shouldForceReturn(gate, 0, ["reply"]);
		expect(msg).not.toBeNull();
		expect(msg).toContain("reply");
		expect(msg).not.toContain("submit_review");
	});

	it("required=['reply'] — returned gate ⇒ null regardless of required", () => {
		const gate = { returned: true };
		expect(shouldForceReturn(gate, 0, ["reply"])).toBeNull();
	});

	it("required=['reply'] — budget spent ⇒ null regardless of required", () => {
		const gate = { returned: false };
		expect(shouldForceReturn(gate, 2, ["reply"])).toBeNull();
	});

	it("required absent ⇒ byte-identical to the pre-Increment-3 call shape", () => {
		const gate = { returned: false };
		expect(shouldForceReturn(gate, 0)).toBe(FORCE_RETURN_MESSAGE);
		expect(shouldForceReturn(gate, 0, undefined)).toBe(FORCE_RETURN_MESSAGE);
	});
});
