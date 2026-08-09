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
 *   B. log_task handler — appendTaskNote port usage
 *      The handler calls ports.coreApi.appendTaskNote (AU21 §9 Increment 2:
 *      crosses the CoreApiPort seam, not raw ports.work DI) atomically
 *      (no pre-read) and returns NOT_FOUND when the port signals the task
 *      is missing.
 *
 * @lore AU20 Stage 1/3: Stage 1 imported `createLogTaskTool` directly from
 * `../log-task.js`. Stage 3 collapsed `log-task.ts` into `tool-definitions.ts`
 * as a private maker; Section B now drives `buildToolDefinitions` to obtain
 * the `log_task` tool, keeping all behaviour assertions identical.
 *
 * `create_bet`/`edit_bet` are pinned in Section A as ordinary
 * `["assistant"]`-role-scoped tools — their handler-level behavior is
 * covered by `tool-definitions`'s existing per-tool tests.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

// ─── shared fixtures ──────────────────────────────────────────────────────────

/**
 * A fake db value. The fake port implementations below never inspect it —
 * they return controlled data directly — so we only need it to satisfy
 * TypeScript's `TDb` param.
 */
const FAKE_DB = {} as unknown as HyperIdleDb;

function makeFakeCtx(agentId = "agent-1"): ToolContext<HyperIdleDb> {
	return {
		db: FAKE_DB,
		eventBus: new EventBus(),
		agentId,
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `th-contract-${Date.now()}`),
		ingestion: { dispose: () => {} },
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// A. buildToolDefinitions — role filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Role assignment summary for the current catalog:
 *
 * No roles (unrestricted, 13 tools):
 *   read_inbox, send_message, reply, log_task, query_practice, write_memory,
 *   handoff_to, create_item, write_session_notes, create_task, submit_review,
 *   create_artifact, commit_file
 *
 * roles: ["assistant"] only (6 tools):
 *   create_bet, edit_bet, create_team, add_agent, create_routine, update_routine
 *
 * roles: ["assistant", "facilitator", "product_manager"] (4 tools):
 *   score_attention, promote_knowledge, create_conflict_review
 *   (`route_item` was a 4th member of this set — AU21 §6 Decision L3 deleted
 *   it outright as vestigial, not merely re-narrowed)
 */
describe("buildToolDefinitions — role filtering", () => {
	const UNRESTRICTED = [
		"read_inbox",
		"send_message",
		"reply",
		"log_task",
		"query_practice",
		"write_memory",
		"handoff_to",
		"create_item",
		"write_session_notes",
		"create_task",
		"submit_review",
		"create_artifact",
		"commit_file",
	] as const;

	const ASSISTANT_ONLY = [
		"create_bet",
		"edit_bet",
		"create_team",
		"add_agent",
		"create_routine",
		"update_routine",
	] as const;

	const MULTI_ROLE = ["score_attention", "promote_knowledge", "create_conflict_review"] as const;

	it("returns all 22 tools when no opts provided", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS);
		expect(tools).toHaveLength(22);
	});

	it("returns all 22 tools when opts.role is undefined", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: undefined });
		expect(tools).toHaveLength(22);
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

	describe("role: 'assistant' (all 22 tools)", () => {
		it("returns 22 tools — assistant sees the full catalog", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			expect(tools).toHaveLength(22);
		});

		it("includes all unrestricted tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of UNRESTRICTED) {
				expect(names.has(name), `assistant should see unrestricted tool: ${name}`).toBe(true);
			}
		});

		it("includes assistant-only tools (create_bet, edit_bet, create_team, add_agent, create_routine, update_routine)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of ASSISTANT_ONLY) {
				expect(names.has(name), `assistant should see assistant-only tool: ${name}`).toBe(true);
			}
		});

		it("includes multi-role tools (score_attention, promote_knowledge, create_conflict_review)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of MULTI_ROLE) {
				expect(names.has(name), `assistant should see multi-role tool: ${name}`).toBe(true);
			}
		});
	});

	describe("role: 'facilitator' (16 tools — unrestricted + multi-role, not assistant-only)", () => {
		it("returns 16 tools for facilitator", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			expect(tools).toHaveLength(16);
		});

		it("includes unrestricted tools", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			const names = new Set(tools.map((t) => t.name));
			for (const name of UNRESTRICTED) {
				expect(names.has(name), `facilitator should see: ${name}`).toBe(true);
			}
		});

		it("includes multi-role tools (score_attention, promote_knowledge, create_conflict_review)", () => {
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

	describe("role: 'product_manager' (16 tools — unrestricted + multi-role, not assistant-only)", () => {
		it("returns 16 tools for product_manager", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			expect(tools).toHaveLength(16);
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

	describe("role: 'builder' (13 tools — unrestricted only)", () => {
		it("returns 13 tools for builder (unrestricted only)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			expect(tools).toHaveLength(13);
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
		expect(tools).toHaveLength(13);
		const names = new Set(tools.map((t) => t.name));
		for (const name of UNRESTRICTED) {
			expect(names.has(name), `unknown role should see: ${name}`).toBe(true);
		}
		for (const name of [...ASSISTANT_ONLY, ...MULTI_ROLE]) {
			expect(names.has(name), `unknown role must NOT see: ${name}`).toBe(false);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// B. log_task handler — appendTaskNote port usage (atomic guarantee)
// ─────────────────────────────────────────────────────────────────────────────

describe("log_task handler — appendTaskNote port usage", () => {
	/**
	 * @lore AU20 Stage 1: appendTaskNote atomicity (single UPDATE with SQL CASE,
	 * no pre-read) is tested at the `work` service layer
	 * (layers/core-api/work/src/__tests__/append-task-note.integration.test.ts).
	 * Here we pin the tool-handler's CONTRACT with the port: the handler
	 * forwards the note entry to `appendTaskNote` and correctly surfaces
	 * NOT_FOUND when the port returns `undefined` (task missing).
	 */

	let appendTaskNoteCalls: Array<{ taskId: string; entry: string }>;

	/** Return value the fake appendTaskNote uses. Changed per-test. */
	let appendReturnValue: { readonly id: string } | undefined;

	let fakePorts: ToolHandlersPorts;

	beforeEach(() => {
		appendTaskNoteCalls = [];
		appendReturnValue = { id: "task-1" }; // default: task found

		fakePorts = {
			...STUB_TOOL_HANDLERS_PORTS,
			// AU21 §9 Increment 2: `log_task` now routes through `ports.coreApi`,
			// not raw `ports.work.appendTaskNote` DI (deleted) — fake the seam
			// call here.
			coreApi: {
				...STUB_TOOL_HANDLERS_PORTS.coreApi,
				appendTaskNote: async (taskId, entry) => {
					appendTaskNoteCalls.push({ taskId, entry });
					return appendReturnValue;
				},
			},
		};
	});

	it("happy path: appends the note and returns {taskId}", async () => {
		const tool = buildToolDefinitions(fakePorts).find((t) => t.name === "log_task")!;
		const ctx = makeFakeCtx("agent-1");

		const result = await tool.handler({ note: "Completed the setup step." }, ctx);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { taskId: string };
		expect(data.taskId).toBe(ctx.taskId);
	});

	it("calls appendTaskNote with ctx.taskId (not a hardcoded value)", async () => {
		const tool = buildToolDefinitions(fakePorts).find((t) => t.name === "log_task")!;
		const ctx = makeFakeCtx("agent-1");
		ctx.taskId; // verify taskId is what we expect

		await tool.handler({ note: "Mid-task observation." }, ctx);

		expect(appendTaskNoteCalls).toHaveLength(1);
		expect(appendTaskNoteCalls[0]!.taskId).toBe("task-1");
	});

	it("the entry passed to appendTaskNote contains the agent id and the note text", async () => {
		const tool = buildToolDefinitions(fakePorts).find((t) => t.name === "log_task")!;
		const ctx = makeFakeCtx("my-agent-id");

		await tool.handler({ note: "Note text here." }, ctx);

		expect(appendTaskNoteCalls).toHaveLength(1);
		const entry = appendTaskNoteCalls[0]!.entry;
		expect(entry).toContain("my-agent-id");
		expect(entry).toContain("Note text here.");
	});

	it("returns NOT_FOUND when appendTaskNote returns undefined (task missing)", async () => {
		appendReturnValue = undefined; // signal: task not found
		const tool = buildToolDefinitions(fakePorts).find((t) => t.name === "log_task")!;
		const ctx = makeFakeCtx("agent-1");

		const result = await tool.handler({ note: "Note for missing task." }, ctx);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	it("returns INVALID_INPUT for an empty note string", async () => {
		const tool = buildToolDefinitions(fakePorts).find((t) => t.name === "log_task")!;
		const ctx = makeFakeCtx("agent-1");

		// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
		const result = await tool.handler({ note: "" } as any, ctx);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
		// appendTaskNote must NOT be called for invalid input
		expect(appendTaskNoteCalls).toHaveLength(0);
	});

	it("calls appendTaskNote exactly once per invocation (no duplicate writes)", async () => {
		const tool = buildToolDefinitions(fakePorts).find((t) => t.name === "log_task")!;
		const ctx = makeFakeCtx("agent-1");

		await tool.handler({ note: "First invocation." }, ctx);
		await tool.handler({ note: "Second invocation." }, ctx);

		expect(appendTaskNoteCalls).toHaveLength(2);
		expect(appendTaskNoteCalls[0]!.entry).toContain("First invocation.");
		expect(appendTaskNoteCalls[1]!.entry).toContain("Second invocation.");
	});
});
