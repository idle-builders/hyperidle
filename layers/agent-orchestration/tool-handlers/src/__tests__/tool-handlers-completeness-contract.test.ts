/**
 * AU20 Stage 1 — tool-handlers completeness contract.
 *
 * Pins every capability a consumer of the `tool-handlers` service needs so
 * the Stage 2 rewrite can be aggressive without silently losing capability.
 * These tests must be GREEN on the current (old) code and STAY GREEN on the
 * new code after the rewrite.
 *
 * Capabilities pinned:
 *
 *   A. buildToolDefinitions role filtering
 *      The `role` param filters the catalog correctly. The exact inclusion/
 *      exclusion sets for "builder", "facilitator", "product_manager", and
 *      "assistant" roles are pinned so a rewrite cannot accidentally shift
 *      role boundaries.
 *
 * `log_task`/`handoff_to`/`create_task`/`edit_task` are DELETED from
 * this catalog — they fold into the `edit_task` ACTION
 * (`@hyperidle/domain-model`'s `TASK_ACTIONS`), registered on the MCP seam by
 * the composed action list, never a hand-written `ToolDefinition` (Section B,
 * which pinned `log_task`'s `appendTaskNote` handler behaviour, is deleted
 * with it — the assertion moves to the new task seam test,
 * `layers/core-api/src/__tests__/task-actions.integration.test.ts`).
 *
 * @lore BC3 architecture.md §5 B4: `send_message`/`reply`/`create_item`/
 * `submit_review` are DELETED from this catalog — `send_message` reappears
 * as an action (`THREAD_ACTIONS`), registered the same way `edit_task` is;
 * the other three have no successor tool. The assertion for `send_message`
 * moves to `layers/core-api/src/__tests__/thread-actions.integration.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

// ─────────────────────────────────────────────────────────────────────────────
// A. buildToolDefinitions — role filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Role assignment summary for the current catalog:
 *
 * No roles (unrestricted, 2 tools):
 *   write_memory, create_artifact
 *   (`send_message`/`reply`/`create_item`/`submit_review` DELETED —
 *   architecture.md §5 B4)
 *
 * roles: ["assistant"] only (4 tools):
 *   create_team, add_agent, create_routine, update_routine
 *
 * roles: ["assistant", "facilitator", "product_manager"] (4 tools):
 *   promote_knowledge, create_conflict_review, merge_knowledge, split_knowledge
 *   (`route_item` was a 4th member of this set — AU21 §6 Decision L3 deleted
 *   it outright as vestigial; `run_knowledge_sweep`/`score_attention` were
 *   deleted with the attention engine, not merely re-narrowed)
 */
describe("buildToolDefinitions — role filtering", () => {
	const UNRESTRICTED = ["write_memory", "create_artifact"] as const;

	const ASSISTANT_ONLY = ["create_team", "add_agent", "create_routine", "update_routine"] as const;

	// run_knowledge_sweep + score_attention deleted
	const MULTI_ROLE = [
		"promote_knowledge",
		"create_conflict_review",
		"merge_knowledge",
		"split_knowledge",
	] as const;

	it("returns all 10 tools when no opts provided", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS);
		expect(tools).toHaveLength(10);
	});

	it("returns all 10 tools when opts.role is undefined", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: undefined });
		expect(tools).toHaveLength(10);
	});

	it("returns same tool set for undefined and no-opts (identity guarantee)", () => {
		const noOpts = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS)
			.map((t) => t.name)
			.sort();
		const withUndefined = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: undefined })
			.map((t) => t.name)
			.sort();
		expect(noOpts).toEqual(withUndefined);
	});

	describe("role: 'assistant' (all 10 tools)", () => {
		it("returns 10 tools — assistant sees the full catalog", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			expect(tools).toHaveLength(10);
		});

		it("includes all unrestricted tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of UNRESTRICTED) {
				expect(names.has(name), `assistant should see unrestricted tool: ${name}`).toBe(true);
			}
		});

		it("includes assistant-only tools (create_team, add_agent, create_routine, update_routine)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `assistant should see assistant-only tool: ${name}`).toBe(true);
			}
		});

		it("includes multi-role tools (promote_knowledge, create_conflict_review, merge_knowledge, split_knowledge)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of MULTI_ROLE) {
				expect(names.has(name), `assistant should see multi-role tool: ${name}`).toBe(true);
			}
		});
	});

	describe("role: 'facilitator' (6 tools — unrestricted + multi-role, not assistant-only)", () => {
		it("returns 6 tools for facilitator", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			expect(tools).toHaveLength(6);
		});

		it("includes unrestricted tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of UNRESTRICTED) {
				expect(names.has(name), `facilitator should see: ${name}`).toBe(true);
			}
		});

		it("includes multi-role tools (promote_knowledge, create_conflict_review)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of MULTI_ROLE) {
				expect(names.has(name), `facilitator should see: ${name}`).toBe(true);
			}
		});

		it("excludes assistant-only tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `facilitator must NOT see assistant-only tool: ${name}`).toBe(
					false,
				);
			}
		});
	});

	describe("role: 'product_manager' (6 tools — unrestricted + multi-role, not assistant-only)", () => {
		it("returns 6 tools for product_manager", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			expect(tools).toHaveLength(6);
		});

		it("excludes assistant-only tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `product_manager must NOT see: ${name}`).toBe(false);
			}
		});

		it("includes multi-role tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of MULTI_ROLE) {
				expect(names.has(name), `product_manager should see: ${name}`).toBe(true);
			}
		});
	});

	describe("role: 'builder' (2 tools — unrestricted only)", () => {
		it("returns 2 tools for builder (unrestricted only)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			expect(tools).toHaveLength(2);
		});

		it("includes all unrestricted tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of UNRESTRICTED) {
				expect(names.has(name), `builder should see: ${name}`).toBe(true);
			}
		});

		it("excludes assistant-only tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `builder must NOT see: ${name}`).toBe(false);
			}
		});

		it("excludes multi-role tools (builder not in the roles list)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of MULTI_ROLE) {
				expect(names.has(name), `builder must NOT see: ${name}`).toBe(false);
			}
		});
	});

	it("unknown role sees only unrestricted tools (open-vocab safety)", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "custom_unknown_role" });
		// Only unrestricted tools survive (roles-restricted tools exclude unknown)
		expect(tools).toHaveLength(2);
		const names = new Set(tools.map((t) => t.name));
		for (const name of UNRESTRICTED) {
			expect(names.has(name), `unknown role should see: ${name}`).toBe(true);
		}
		for (const name of [...ASSISTANT_ONLY, ...MULTI_ROLE]) {
			expect(names.has(name), `unknown role must NOT see: ${name}`).toBe(false);
		}
	});
});
