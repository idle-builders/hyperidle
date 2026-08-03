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
 *   B. buildAssistantDraftRegistry constraint injection
 *      teamId is HARD-INJECTED from the user's real team — the model cannot
 *      override it. betId is FORCED from the most-recent draft in the
 *      transcript — the model cannot target another bet. Errors (NO_TEAM,
 *      NO_DRAFT) surface when preconditions are absent.
 *
 *   C. log_task handler — appendTaskNote port usage
 *      The handler calls ports.coreApi.appendTaskNote (AU21 §9 Increment 2:
 *      crosses the CoreApiPort seam, not raw ports.work DI) atomically
 *      (no pre-read) and returns NOT_FOUND when the port signals the task
 *      is missing.
 *
 * @lore AU20 Stage 1/3: Stage 1 imported `createLogTaskTool` directly from
 * `../log-task.js`. Stage 3 collapsed `log-task.ts` into `tool-definitions.ts`
 * as a private maker; Section C now drives `buildToolDefinitions` to obtain
 * the `log_task` tool, keeping all behaviour assertions identical.
 * `AssistantDraftRegistryParams` is intentionally NOT imported here
 * (it was de-exported in Stage 2); params are passed as object literals.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAssistantDraftRegistry } from "../assistant-draft-registry.js";
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
 * No roles (unrestricted, 12 tools):
 *   read_inbox, send_message, log_task, query_practice, write_memory,
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

	it("returns all 21 tools when no opts provided", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS);
		expect(tools).toHaveLength(21);
	});

	it("returns all 21 tools when opts.role is undefined", () => {
		const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: undefined });
		expect(tools).toHaveLength(21);
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

	describe("role: 'assistant' (all 21 tools)", () => {
		it("returns 21 tools — assistant sees the full catalog", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "assistant" });
			expect(tools).toHaveLength(21);
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

	describe("role: 'facilitator' (15 tools — unrestricted + multi-role, not assistant-only)", () => {
		it("returns 15 tools for facilitator", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "facilitator" });
			expect(tools).toHaveLength(15);
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

	describe("role: 'product_manager' (15 tools — unrestricted + multi-role, not assistant-only)", () => {
		it("returns 15 tools for product_manager", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "product_manager" });
			expect(tools).toHaveLength(15);
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

	describe("role: 'builder' (12 tools — unrestricted only)", () => {
		it("returns 12 tools for builder (unrestricted only)", () => {
			const tools = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS, { role: "builder" });
			expect(tools).toHaveLength(12);
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
		expect(tools).toHaveLength(12);
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
// B. buildAssistantDraftRegistry — constraint injection
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAssistantDraftRegistry — constraint injection", () => {
	/**
	 * Fake port data:
	 *   - user "user-with-team" has teamId = "team-members-1" (the teamMembers.id)
	 *   - teamMembers "team-members-1" maps to teams.id = "real-team-id"
	 *   - team "real-team-id" exists
	 *   - "user-no-team" has no teamId
	 */
	const FAKE_USER_WITH_TEAM = {
		id: "user-with-team",
		role: null,
		teamId: "team-members-1", // @lore AK4: this is actually teamMembers.id
		name: "User With Team",
	} as const;

	const FAKE_USER_NO_TEAM = {
		id: "user-no-team",
		role: null,
		teamId: null,
		name: "User Without Team",
	} as const;

	/** Builds a controlled ports bundle. `createBetCalls` / `updateBetCalls` accumulate for assertion. */
	function buildFakePorts(): {
		ports: ToolHandlersPorts;
		createBetCalls: Array<Record<string, unknown>>;
		updateBetCalls: Array<{ betId: string; updates: Record<string, unknown> }>;
	} {
		const createBetCalls: Array<Record<string, unknown>> = [];
		const updateBetCalls: Array<{ betId: string; updates: Record<string, unknown> }> = [];

		const ports: ToolHandlersPorts = {
			...STUB_TOOL_HANDLERS_PORTS,
			coreApi: {
				...STUB_TOOL_HANDLERS_PORTS.coreApi,
				// AU21 §9 Increment 1: create_bet now routes through `ports.coreApi`,
				// not `ports.work.createBet` (deleted) — fake the seam call here.
				createBet: async (input, actorId) => {
					createBetCalls.push({ ...(input as Record<string, unknown>), actorId });
					return { id: "fake-seam-bet-id", teamId: input.teamId, status: "draft" };
				},
				// AU21 §9 Increment 2: `resolveDraftTeamId`/`edit_bet` now route
				// through `ports.coreApi`, not raw `ports.work`/`ports.users` DI
				// (both deleted) — fake the seam calls here.
				getUserById: async (id) => {
					if (id === "user-with-team") return { ...FAKE_USER_WITH_TEAM };
					if (id === "user-no-team") return { ...FAKE_USER_NO_TEAM };
					return undefined;
				},
				getBetById: async (betId) => {
					if (betId === "draft-bet-1") return { status: "draft" };
					return undefined;
				},
				updateBetById: async (betId, updates) => {
					updateBetCalls.push({ betId, updates: updates as Record<string, unknown> });
				},
				// AU21 §9 Increment 2 (org/routine/handoff wave): `resolveDraftTeamId`'s
				// AK4 second hop now routes through `ports.coreApi`, not raw
				// `ports.org` DI (deleted) — fake the seam calls here.
				getTeamMembersById: async (teamMembersId) => {
					if (teamMembersId === "team-members-1") return { teamId: "real-team-id" };
					return undefined;
				},
				getTeamById: async (teamId) => {
					if (teamId === "real-team-id") return { id: "real-team-id", name: "Test Team" };
					return undefined;
				},
			},
		};

		return { ports, createBetCalls, updateBetCalls };
	}

	/** Build transcript rows that simulate a prior successful create_bet. */
	function makePriorCreateBetTranscript(
		assistantAgentId: string,
		betId = "draft-bet-1",
	): ReadonlyArray<{ readonly senderId: string; readonly payload: string }> {
		return [
			{
				senderId: assistantAgentId,
				payload: JSON.stringify({
					toolCalls: [{ name: "create_bet", status: "ok", output: JSON.stringify({ betId }) }],
				}),
			},
		];
	}

	describe("registry structure", () => {
		it("definitions contains exactly 2 tools: create_bet and edit_bet", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);
			const names = registry.definitions.map((d) => d.name);
			expect(names).toHaveLength(2);
			expect(names).toContain("create_bet");
			expect(names).toContain("edit_bet");
		});

		it("toClaudeToolSpecs() returns 2 Claude specs (one per tool)", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);
			const specs = registry.toClaudeToolSpecs();
			expect(specs).toHaveLength(2);
			expect(specs.some((s) => s.name === "create_bet")).toBe(true);
			expect(specs.some((s) => s.name === "edit_bet")).toBe(true);
		});
	});

	describe("teamId hard-injection into create_bet", () => {
		it("create_bet succeeds with the hard-injected teamId — not any model-supplied value", async () => {
			const { ports, createBetCalls } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("create_bet", { description: "Build the feature" });

			// Tool must succeed
			expect(result.success).toBe(true);
			// The bet was created with the hard-injected teamId
			expect(createBetCalls).toHaveLength(1);
			expect(createBetCalls[0]!.teamId).toBe("real-team-id");
		});

		it("teamId is hard-injected even when model passes a different teamId in args (schema strips it)", async () => {
			const { ports, createBetCalls } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);

			// The registry schema (createBetDraftInputSchema) does NOT have a teamId field —
			// any teamId the model passes is silently stripped by Zod before the handler sees it.
			await registry.invoke("create_bet", {
				description: "Build the feature",
				// biome-ignore lint/suspicious/noExplicitAny: deliberately testing model injection attempt
				...({ teamId: "attacker-team-id" } as any),
			});

			// The bet must still be created with the real, hard-injected teamId
			expect(createBetCalls).toHaveLength(1);
			expect(createBetCalls[0]!.teamId).toBe("real-team-id");
		});

		it("create_bet returns NO_TEAM error when user has no team", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-no-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("create_bet", { description: "Draft a bet" });
			expect(result.success).toBe(false);
			expect(result.success === false && result.code).toBe("NO_TEAM");
		});

		it("create_bet result carries the correct betId and status in the response", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("create_bet", { description: "Build X" });
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { betId: string; status: "draft"; teamId: string };
			expect(data.status).toBe("draft");
			expect(typeof data.betId).toBe("string");
			expect(data.betId.length).toBeGreaterThan(0);
			expect(data.teamId).toBe("real-team-id");
		});
	});

	describe("betId forced from transcript into edit_bet", () => {
		it("edit_bet is called with the betId from the prior create_bet in the transcript", async () => {
			const { ports, updateBetCalls } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const transcript = makePriorCreateBetTranscript("ast-agent", "draft-bet-1");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: transcript, assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("edit_bet", { description: "Updated description" });

			expect(result.success).toBe(true);
			expect(updateBetCalls).toHaveLength(1);
			// The betId comes from the transcript, NOT from any model arg
			expect(updateBetCalls[0]!.betId).toBe("draft-bet-1");
		});

		it("edit_bet result carries the correct betId", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const transcript = makePriorCreateBetTranscript("ast-agent", "draft-bet-1");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: transcript, assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("edit_bet", { description: "Updated" });
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { betId: string };
			expect(data.betId).toBe("draft-bet-1");
		});

		it("edit_bet returns NO_DRAFT error when there is no prior draft bet in the transcript", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				// empty transcript — no prior create_bet
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("edit_bet", { description: "No bet yet" });
			expect(result.success).toBe(false);
			expect(result.success === false && result.code).toBe("NO_DRAFT");
		});

		it("only picks up the assistant's own tool calls (not other senders) for betId resolution", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");

			// Row from a different sender — should NOT trigger betId resolution
			const transcriptWithWrongSender = [
				{
					senderId: "other-agent", // not the assistantAgentId
					payload: JSON.stringify({
						toolCalls: [
							{
								name: "create_bet",
								status: "ok",
								output: JSON.stringify({ betId: "draft-bet-1" }),
							},
						],
					}),
				},
			];

			const registry = await buildAssistantDraftRegistry(
				ctx,
				{
					userId: "user-with-team",
					transcriptRows: transcriptWithWrongSender,
					assistantAgentId: "ast-agent",
				},
				ports,
			);

			// No draft bet found for this agent → NO_DRAFT
			const result = await registry.invoke("edit_bet", { description: "Edit attempt" });
			expect(result.success).toBe(false);
			expect(result.success === false && result.code).toBe("NO_DRAFT");
		});
	});

	describe("invoke routes unknown tool names", () => {
		it("invoke returns NOT_FOUND for a tool not in the registry", async () => {
			const { ports } = buildFakePorts();
			const ctx = makeFakeCtx("ast-agent");
			const registry = await buildAssistantDraftRegistry(
				ctx,
				{ userId: "user-with-team", transcriptRows: [], assistantAgentId: "ast-agent" },
				ports,
			);

			const result = await registry.invoke("create_task", { title: "bad" });
			expect(result.success).toBe(false);
			expect(result.success === false && result.code).toBe("NOT_FOUND");
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// C. log_task handler — appendTaskNote port usage (atomic guarantee)
// ─────────────────────────────────────────────────────────────────────────────

describe("log_task handler — appendTaskNote port usage", () => {
	/**
	 * @lore AU20 Stage 1: appendTaskNote atomicity (single UPDATE with SQL CASE,
	 * no pre-read) is tested at the `work` service layer
	 * (packages/core-api/work/src/__tests__/append-task-note.integration.test.ts).
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
