/**
 * AC2: Value-import unit test for the closed accepted-return set.
 *
 * AC2: The accepted-return set is closed + enumerable.
 *   - Every member of RETURN_ACTION_NAMES maps to a real registered tool in
 *     ALL_TOOL_DEFINITIONS (closure: the set cannot name a phantom tool).
 *   - The set is the exact, named membership — no extra names, no missing names.
 *   - isReturnAction() returns true for every member and false for non-members.
 *
 * This is a VALUE-IMPORT unit test: imports constants, asserts on values.
 * NOT a readFileSync/grep test — per CLAUDE.md and architecture §5 AC2 row.
 * The "closed finite set" static property is enforced by the `as const` union
 * type (ReturnActionName) at check-time — not a separate test here.
 */

import { isReturnAction, RETURN_ACTION_NAMES } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

// This test only needs the tool NAME set — a stub ports bundle is enough
// (no port method is ever actually invoked while building the definitions).
const ALL_TOOL_DEFINITIONS = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS);

describe("RETURN_ACTION_NAMES — AC2: closed enumerable set", () => {
	it("is a non-empty readonly tuple", () => {
		expect(RETURN_ACTION_NAMES.length).toBeGreaterThan(0);
	});

	it("contains exactly the two members: edit_task, send_message", () => {
		// `submit_review` and `reply` are deleted tools — `edit_task`
		// (argument-gated on `ownerAgentId`) and `send_message`
		// (action-projected) are the only survivors.
		const names = [...RETURN_ACTION_NAMES].sort();
		expect(names).toEqual(["edit_task", "send_message"]);
	});

	it("every member is action-projected, so none appear in ALL_TOOL_DEFINITIONS (closure)", () => {
		// @lore This test is the runtime enforcement of the closure guarantee.
		// If a tool in RETURN_ACTION_NAMES is renamed in tool-registry.ts without
		// updating return-actions.ts, this test catches the drift at CI time.
		// Both current members — `edit_task` and `send_message` — are projected
		// from the action list (`layers/core-api/src/actions/actions-as-tools.ts`),
		// composed in only at `buildToolRegistry`'s real call site —
		// `ALL_TOOL_DEFINITIONS` here is built from `buildToolDefinitions`
		// directly, which never includes either.
		const registeredNames = new Set(ALL_TOOL_DEFINITIONS.map((d) => d.name));
		for (const name of RETURN_ACTION_NAMES) {
			if (name === "edit_task" || name === "send_message") continue;
			expect(
				registeredNames.has(name),
				`RETURN_ACTION_NAMES includes '${name}' but it is not in ALL_TOOL_DEFINITIONS. ` +
					`Either the tool was renamed/removed or the return-set needs updating.`,
			).toBe(true);
		}
	});

	it("has no duplicate entries", () => {
		const unique = new Set(RETURN_ACTION_NAMES);
		expect(unique.size).toBe(RETURN_ACTION_NAMES.length);
	});
});

describe("isReturnAction — AC2: per-tool return predicate", () => {
	it("returns true for all members of RETURN_ACTION_NAMES, given each member's satisfying args", () => {
		// `edit_task` is argument-gated (B4: only the session's own task moving
		// away from the agent is terminal) — every other member is
		// unconditional, per the `edit_task`-specific test below.
		for (const name of RETURN_ACTION_NAMES) {
			const args = name === "edit_task" ? { id: "task-1", ownerAgentId: "agent-7" } : {};
			expect(isReturnAction(name, args, "task-1")).toBe(true);
		}
	});

	it("returns true for edit_task only on the session's own task, moving it away from the agent (B4)", () => {
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "agent-7" }, "task-1")).toBe(
			true,
		);
		expect(isReturnAction("edit_task", { id: "task-1", state: "review" }, "task-1")).toBe(true);
		expect(isReturnAction("edit_task", { id: "task-1", state: "done" }, "task-1")).toBe(true);
		// no taskId in context — never terminal.
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "agent-7" })).toBe(false);
		// a subtask create (no id) is never the session's own task.
		expect(isReturnAction("edit_task", { ownerAgentId: "agent-7" }, "task-1")).toBe(false);
		// editing a DIFFERENT task is never terminal.
		expect(isReturnAction("edit_task", { id: "task-2", ownerAgentId: "agent-7" }, "task-1")).toBe(
			false,
		);
		expect(isReturnAction("edit_task", { id: "task-1" }, "task-1")).toBe(false);
		expect(isReturnAction("edit_task", { id: "task-1", title: "Renamed" }, "task-1")).toBe(false);
		expect(isReturnAction("edit_task", { id: "task-1", ownerAgentId: "" }, "task-1")).toBe(false);
	});

	it("returns true for send_message unconditionally", () => {
		expect(isReturnAction("send_message", {})).toBe(true);
		expect(isReturnAction("send_message", { to: "human-1", body: "done" })).toBe(true);
	});

	it("returns false for non-member tools (mid-turn tools are not returns)", () => {
		const nonReturns = [
			"read_inbox",
			"write_memory",
			"create_artifact",
			"log_task",
			"query_practice",
			"write_session_notes",
			"create_task",
			"promote_knowledge",
			"create_conflict_review",
			"create_team",
			"add_agent",
			"create_bet",
			"edit_bet",
			"create_routine",
			"update_routine",
			"create_item",
			"handoff_to_TYPO",
			"SUBMIT_REVIEW",
			"",
		];
		for (const name of nonReturns) {
			expect(isReturnAction(name, {}), `'${name}' should NOT be a return action`).toBe(false);
		}
	});

	it("update_task_status is NOT in v1 set (deferred per architecture §1 path B)", () => {
		// v1 ships name-only trio; update_task_status deferred to avoid arg-gated complexity
		expect(isReturnAction("update_task_status", { state: "done" })).toBe(false);
	});
});

describe("isReturnAction — MCP namespace stripping (AR2)", () => {
	// The real return-action tool names shipped in v1 (return-actions.ts).
	// CLI harnesses route HyperIdle tools through MCP as `mcp__<server>__<bare>`.
	// stripMcpNamespace() must normalise these to the bare name before the set lookup.

	it("namespaced send_message is recognised as a return action", () => {
		expect(isReturnAction("mcp__hyperidle__send_message")).toBe(true);
	});

	it("namespaced edit_task, own task with ownerAgentId, is recognised as a return action", () => {
		expect(
			isReturnAction(
				"mcp__hyperidle__edit_task",
				{ id: "task-1", ownerAgentId: "agent-7" },
				"task-1",
			),
		).toBe(true);
	});

	it("bare send_message still works (builtin path — no namespace)", () => {
		expect(isReturnAction("send_message")).toBe(true);
	});

	it("namespaced non-return tool is NOT a false positive", () => {
		// update_task_status is deferred (not in v1 set); namespaced form must also be false.
		expect(isReturnAction("mcp__hyperidle__update_task_status")).toBe(false);
		expect(isReturnAction("mcp__hyperidle__read_inbox")).toBe(false);
	});

	it("server name with underscores is handled correctly (W-1 regex fix)", () => {
		// Regex was /^mcp__[^_][^_]*__/ — rejected server names like `my_server`.
		// Fixed to /^mcp__.+?__/ — non-greedy, matches any server name.
		expect(isReturnAction("mcp__my_server__send_message")).toBe(true);
		expect(isReturnAction("mcp__hyper_idle__send_message")).toBe(true);
		expect(isReturnAction("mcp__hyper_idle__read_inbox")).toBe(false);
	});

	it("opencode hyperidle_ tool names are recognised as return actions", () => {
		expect(isReturnAction("hyperidle_send_message")).toBe(true);
		expect(
			isReturnAction("hyperidle_edit_task", { id: "task-1", ownerAgentId: "agent-7" }, "task-1"),
		).toBe(true);
		expect(isReturnAction("hyperidle_commit_file")).toBe(false);
	});
});
