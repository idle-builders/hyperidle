/**
 * AU20 Stage 1 — tool-handlers completeness contract.
 *
 * Pins every capability a consumer of the `tool-handlers` service needs so
 * a rewrite can be aggressive without silently losing capability.
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
 *
 * @lore the six document tools (`write_memory`/`create_artifact`/
 * `promote_knowledge`/`create_conflict_review`/`merge_knowledge`/
 * `split_knowledge`) are DELETED — `search_documents`/`open_document`/
 * `edit_document` replace their reachable surface as composed ACTIONS
 * (§8.4), never hand-written `ToolDefinition`s in this catalog. What
 * remains is four `roles: ["assistant"]` tools, all team/routine
 * management — there is no longer an unrestricted or multi-role tier.
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
 * roles: ["assistant"] only (4 tools):
 *   create_team, add_agent, create_routine, update_routine
 *
 * There is no unrestricted tier and no multi-role tier left — every
 * survivor is assistant-only team/routine management.
 */
describe("buildToolDefinitions — role filtering", () => {
	const ASSISTANT_ONLY = ["create_team", "add_agent", "create_routine", "update_routine"] as const;

	it("returns all 4 tools when no opts provided", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS);
		expect(tools).toHaveLength(4);
	});

	it("returns all 4 tools when opts.role is undefined", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: undefined });
		expect(tools).toHaveLength(4);
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

	describe("role: 'assistant' (all 4 tools)", () => {
		it("returns 4 tools — assistant sees the full catalog", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			expect(tools).toHaveLength(4);
		});

		it("includes assistant-only tools (create_team, add_agent, create_routine, update_routine)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `assistant should see assistant-only tool: ${name}`).toBe(true);
			}
		});
	});

	describe("role: 'facilitator' (0 tools — every survivor is assistant-only)", () => {
		it("returns 0 tools for facilitator", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			expect(tools).toHaveLength(0);
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

	describe("role: 'product_manager' (0 tools — every survivor is assistant-only)", () => {
		it("returns 0 tools for product_manager", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			expect(tools).toHaveLength(0);
		});

		it("excludes assistant-only tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `product_manager must NOT see: ${name}`).toBe(false);
			}
		});
	});

	describe("role: 'builder' (0 tools — every survivor is assistant-only)", () => {
		it("returns 0 tools for builder", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			expect(tools).toHaveLength(0);
		});

		it("excludes assistant-only tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `builder must NOT see: ${name}`).toBe(false);
			}
		});
	});

	it("unknown role sees no tools (open-vocab safety — every survivor is role-restricted)", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "custom_unknown_role" });
		expect(tools).toHaveLength(0);
		const names = new Set(tools.map((t) => t.name));
		for (const name of ASSISTANT_ONLY) {
			expect(names.has(name), `unknown role must NOT see: ${name}`).toBe(false);
		}
	});
});
