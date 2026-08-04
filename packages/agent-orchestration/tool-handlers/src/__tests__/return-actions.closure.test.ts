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

import { isReturnAction, RETURN_ACTION_NAMES } from "@hyperidle/shared";
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

	it("contains exactly the four members: submit_review, handoff_to, send_message, reply", () => {
		// AU27 Increment 3 (Decision 3): `reply` (Increment 2's generic
		// session-scoped reply tool) joins the trio.
		const names = [...RETURN_ACTION_NAMES].sort();
		expect(names).toEqual(["handoff_to", "reply", "send_message", "submit_review"]);
	});

	it("every member maps to a real registered tool in ALL_TOOL_DEFINITIONS (closure)", () => {
		// @lore This test is the runtime enforcement of the closure guarantee.
		// If a tool in RETURN_ACTION_NAMES is renamed in tool-registry.ts without
		// updating return-actions.ts, this test catches the drift at CI time.
		const registeredNames = new Set(ALL_TOOL_DEFINITIONS.map((d) => d.name));
		for (const name of RETURN_ACTION_NAMES) {
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
	it("returns true for all members of RETURN_ACTION_NAMES", () => {
		for (const name of RETURN_ACTION_NAMES) {
			expect(isReturnAction(name, {})).toBe(true);
		}
	});

	it("returns true for submit_review unconditionally", () => {
		expect(isReturnAction("submit_review", {})).toBe(true);
		expect(isReturnAction("submit_review", { verdict: "approved" })).toBe(true);
	});

	it("returns true for handoff_to unconditionally", () => {
		expect(isReturnAction("handoff_to", {})).toBe(true);
		expect(isReturnAction("handoff_to", { role: "reviewer" })).toBe(true);
	});

	it("returns true for send_message unconditionally", () => {
		expect(isReturnAction("send_message", {})).toBe(true);
		expect(isReturnAction("send_message", { to: "human-1", body: "done" })).toBe(true);
	});

	it("returns true for reply unconditionally", () => {
		expect(isReturnAction("reply", {})).toBe(true);
		expect(isReturnAction("reply", { text: "done" })).toBe(true);
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
			"score_attention",
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

	it("namespaced submit_review is recognised as a return action", () => {
		expect(isReturnAction("mcp__hyperidle__submit_review")).toBe(true);
	});

	it("namespaced handoff_to is recognised as a return action", () => {
		expect(isReturnAction("mcp__hyperidle__handoff_to")).toBe(true);
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
		expect(isReturnAction("mcp__hyper_idle__submit_review")).toBe(true);
		expect(isReturnAction("mcp__hyper_idle__read_inbox")).toBe(false);
	});

	it("opencode hyperidle_ tool names are recognised as return actions", () => {
		expect(isReturnAction("hyperidle_send_message")).toBe(true);
		expect(isReturnAction("hyperidle_submit_review")).toBe(true);
		expect(isReturnAction("hyperidle_handoff_to")).toBe(true);
		expect(isReturnAction("hyperidle_reply")).toBe(true);
		expect(isReturnAction("hyperidle_commit_file")).toBe(false);
	});

	it("namespaced reply is recognised as a return action", () => {
		expect(isReturnAction("mcp__hyperidle__reply")).toBe(true);
	});
});

describe("isInternalExtractionDrain — AC4: exemption predicate", () => {
	// The exemption helper is also in return-actions (or return-gate — architecture §2.3).
	// Import it from @hyperidle/shared once it exists. For now reference the planned export.
	it("returns true for a config with tools:[] (extraction drain)", async () => {
		const { isInternalExtractionDrain } = await import("@hyperidle/shared");
		expect(isInternalExtractionDrain({ tools: [] })).toBe(true);
	});

	it("returns false for a config with tools:['read_inbox', ...] (real agent turn)", async () => {
		const { isInternalExtractionDrain } = await import("@hyperidle/shared");
		expect(isInternalExtractionDrain({ tools: ["read_inbox", "submit_review"] })).toBe(false);
	});

	it("returns false for a config with a single tool (not an extraction drain)", async () => {
		const { isInternalExtractionDrain } = await import("@hyperidle/shared");
		expect(isInternalExtractionDrain({ tools: ["write_memory"] })).toBe(false);
	});
});
