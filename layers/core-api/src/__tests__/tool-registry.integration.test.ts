import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	THROWING_OPEN_TASK,
} from "@hyperidle/agent-orchestration/testing";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import type { BuildToolRegistryOptions } from "@hyperidle/tool-handlers";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §3.2/§5: the `coreApiSeamRegistration` auto-fixture used to
 * register this test's `app` on the ambient global — replaced by a
 * `buildToolRegistry` fixture that builds the dispatch fresh off THIS test's
 * own `app`, bound with the OLD two-arg shape (`(ctx, options) => registry`)
 * so every call site below is unchanged.
 * @lore AU20 repair: read_inbox, write_session_notes, commit_file were deleted
 * by the AU20 destroyer pass. Tests that used them as dispatch vehicles are
 * ported to surviving tools (write_memory for handler routing and for
 * INVALID_INPUT — query_practice was itself deleted, its
 * only filter was `layer === 'L3'`).
 */
const test = baseTest.extend<{
	buildToolRegistry: (
		ctx: ToolContext<HyperIdleDb>,
		options: BuildToolRegistryOptions<HyperIdleDb>,
	) => ToolRegistry<HyperIdleDb>;
}>({
	buildToolRegistry: async ({ app }, use) => {
		const definitions = buildToolDefinitions(
			createInProcessCoreApiTransport(app),
			THROWING_OPEN_TASK,
		);
		await use((ctx, options) =>
			buildToolRegistryFromDefinitions<HyperIdleDb>(definitions, ctx, options),
		);
	},
});

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-x",
		sessionId: "session-x",
		taskId: "task-x",
		// @lore write_memory falls back to `openTask` only when `teamId` is
		// absent from the context — setting it here keeps this test's dispatch
		// vehicle off the THROWING_OPEN_TASK stub, which is deliberately wired
		// below so a test that DOES reach `openTask` fails loudly instead of
		// silently exercising a stub.
		teamId: "team-x",
		sandboxPath: path.join(os.tmpdir(), `hyperidle-d4-registry-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("buildToolRegistry", () => {
	test("returns the canonical set of skill tools", ({ db, eventBus, buildToolRegistry }) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" }); // @lore AD8a: role string renamed to "assistant" in AD8b
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toEqual(
			[
				// @lore BC3 architecture.md §5 B4: create_item/send_message/reply/
				// submit_review deleted — send_message reappears as an action,
				// projected the same way edit_task is; the other three have no
				// successor tool.
				"write_memory",
				// G1 facilitator tools (`route_item` deleted outright as vestigial —
				// AU21 §6 Decision L3, not merely re-narrowed)
				// score_attention + run_knowledge_sweep deleted
				"promote_knowledge",
				"create_conflict_review",
				// R6 artifact tools
				"create_artifact",
				// AE3 management tools
				"create_team",
				"add_agent",
				"create_routine",
				"update_routine",
				// BA9d wave 2: knowledge merge and split
				"merge_knowledge",
				"split_knowledge",
				// @lore AU20 repair: read_inbox, write_session_notes, commit_file removed
				// run_knowledge_sweep and score_attention were deleted with the
				// attention engine.
				// the architecture doc §7/§8 B1: handoff_to, create_task, edit_task
				// (the old tool body) and log_task are deleted from THIS registry —
				// they are projected instead from the action list
				// (`search_tasks`/`open_task`/`edit_task`), composed in at
				// `buildToolRegistry`'s call site, not `buildToolDefinitions` — this
				// fixture builds definitions directly, so the action-projected trio
				// never appears here.
			].sort(),
		);
		// 9 base tools + create_task (R5) + submit_review (R5) + create_artifact (R6) = 12
		// + 4 AE3 management tools: create_team, add_agent, create_routine, update_routine = 16
		// BB1: create_bet + edit_bet deleted; edit_task added = 17
		// + 1 AU27: reply = 18
		// + 2 BA9d wave 2: merge_knowledge + split_knowledge = 20
		// score_attention and run_knowledge_sweep deleted with the attention engine = 18
		// handoff_to, create_task, edit_task (old body) and log_task deleted with
		// the task action list = 14
		// BC3 architecture.md §5 B4: create_item/send_message/reply/submit_review
		// deleted = 10
		expect(registry.definitions).toHaveLength(10);
	});

	test("each definition has a non-empty description and a Zod input schema", ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
		for (const def of registry.definitions) {
			expect(typeof def.name).toBe("string");
			expect(def.name.length).toBeGreaterThan(0);
			expect(typeof def.description).toBe("string");
			expect(def.description.length).toBeGreaterThan(10);
			expect(def.inputSchema).toBeDefined();
			// Zod object must expose .parse
			expect(typeof (def.inputSchema as { parse?: unknown }).parse).toBe("function");
		}
	});

	describe("invoke()", () => {
		test("returns NOT_FOUND when tool name is unknown", async ({
			db,
			eventBus,
			buildToolRegistry,
		}) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			const result = await registry.invoke("does_not_exist", {});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("NOT_FOUND");
			}
		});

		test("routes to the matching handler by name", async ({ db, eventBus, buildToolRegistry }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			// @lore AU20 repair: was read_inbox (deleted) — ported to query_practice, which
			// was then deleted too (its only filter was `layer === 'L3'`).
			// write_memory is the new dispatch vehicle.
			const result = await registry.invoke("write_memory", {
				title: "Routing check",
				body: "Proves dispatch reaches the handler.",
			});
			expect(result.success).toBe(true);
		});

		test("returns INVALID_INPUT when args fail Zod validation", async ({
			db,
			eventBus,
			buildToolRegistry,
		}) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			// @lore AU20 repair: was read_inbox { limit: "not-a-number" } (deleted) — ported to
			// query_practice, which was then deleted too. `title` is required.
			const result = await registry.invoke("write_memory", {
				body: "No title.",
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("INVALID_INPUT");
			}
		});
	});

	describe("toClaudeToolSpecs()", () => {
		test("returns one Claude tool spec per definition", ({ db, eventBus, buildToolRegistry }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			const specs = registry.toClaudeToolSpecs();
			expect(specs).toHaveLength(registry.definitions.length);
			for (const spec of specs) {
				expect(typeof spec.name).toBe("string");
				expect(typeof spec.description).toBe("string");
				expect(spec.input_schema).toBeDefined();
				expect(spec.input_schema.type).toBe("object");
				expect(typeof spec.input_schema.properties).toBe("object");
			}
		});

		test("preserves tool names exactly", ({ db, eventBus, buildToolRegistry }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			const specNames = registry
				.toClaudeToolSpecs()
				.map((s) => s.name)
				.sort();
			const defNames = registry.definitions.map((d) => d.name).sort();
			expect(specNames).toEqual(defNames);
		});
	});
});
