import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, teams } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import type { BuildToolRegistryOptions } from "@hyperidle/tool-handlers";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";

/**
 * @lore AU31 §3.2/§5: the `coreApiSeamRegistration` auto-fixture used to
 * register this test's `app` on the ambient global — replaced by a
 * `buildToolRegistry` fixture that builds the dispatch fresh off THIS test's
 * own `app`, bound with the OLD two-arg shape (`(ctx, options) => registry`)
 * so every call site below is unchanged.
 * @lore the six document tools (`write_memory`/`create_artifact`/
 * `promote_knowledge`/`create_conflict_review`/`merge_knowledge`/
 * `split_knowledge`) are DELETED. `create_routine` was the dispatch vehicle
 * for handler-routing/INVALID_INPUT proof below, deleted in its turn with
 * the routine package (BC5 T7b) — `add_agent` is the vehicle now
 * (`create_team`'s seam route requires a `functions` field its tool input
 * never sends and always 400s — a pre-existing gap out of scope here, so it
 * stays off the dispatch-vehicle path, same as before).
 * @lore document-module: the registry a real agent gets is the FOUR
 * hand-written management tools (from `buildToolDefinitions`) PLUS the
 * composed core actions' own tool projection (`actionsAsTools(buildCoreActions(...))`)
 * — exactly what `run-orchestration-composition.ts`'s `buildToolProvider`
 * assembles (`[...actionTools, ...definitions]`). This fixture reproduces
 * that same union rather than the four-tool subset alone, so "the registered
 * tool names an agent gets" is what is actually asserted below.
 */
const test = baseTest.extend<{
	buildToolRegistry: (
		ctx: ToolContext<HyperIdleDb>,
		options: BuildToolRegistryOptions<HyperIdleDb>,
	) => ToolRegistry<HyperIdleDb>;
}>({
	buildToolRegistry: async ({ app, agentOrchestration }, use) => {
		const definitions = buildToolDefinitions(createInProcessCoreApiTransport(app));
		const actionTools = actionsAsTools(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}),
		);
		await use((ctx, options) =>
			buildToolRegistryFromDefinitions<HyperIdleDb>([...actionTools, ...definitions], ctx, options),
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
		teamId: "team-x",
		sandboxPath: path.join(os.tmpdir(), `hyperidle-d4-registry-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

const NOW = "2026-09-21T00:00:00.000Z";

/** Seeds a team for `add_agent`'s `teamId` foreign key. */
async function seedTeam(db: HyperIdleDb): Promise<string> {
	const teamId = `team-${Date.now()}`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Registry Team", phase: "build", createdAt: NOW });
	return teamId;
}

describe("buildToolRegistry", () => {
	// @lore the six document tools (write_memory/create_artifact/
	// promote_knowledge/create_conflict_review/merge_knowledge/split_knowledge)
	// are gone. What an agent gets today is the four hand-written AE3
	// management tools PLUS whatever the composed core action list projects
	// as tools — never asserted with `toContain`, always exact set equality,
	// because a `toContain` here would silently tolerate an extra tool
	// leaking in. The composed side is derived, not hardcoded: task's own
	// three actions, thread's own four, document's own three (search/open/
	// edit), platform's own two (search_plugins/edit_plugin) — twelve
	// today, re-derived every run so a future action addition or removal is
	// caught here rather than assumed.
	// @lore BC5 T7b: create_routine/update_routine deleted with the routine
	// package — the hand-written catalog is down to the two team tools.
	test("returns exactly the two management tools plus the composed action tools", ({
		db,
		eventBus,
		agentOrchestration,
		buildToolRegistry,
	}) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" }); // @lore AD8a: role string renamed to "assistant" in AD8b
		const names = new Set(registry.definitions.map((d) => d.name));

		const composedActionNames = new Set(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}).map((a) => a.declaration.name),
		);
		// Set equality, never toContain: proves the registered set is EXACTLY
		// this union, with nothing extra and nothing missing.
		const expected = new Set(["create_team", "add_agent", ...composedActionNames]);
		expect(names).toEqual(expected);
		// task ×3 (search_tasks/open_task/edit_task), thread ×4
		// (search_threads/open_thread/adjust_thread/send_message), document ×3
		// (search_documents/open_document/edit_document), platform ×2
		// (search_plugins/edit_plugin), user ×3 (search_users/open_user/
		// edit_user) — fifteen, not the earlier twelve (written before the
		// user module was counted).
		expect(composedActionNames.size).toBe(15);
		expect(registry.definitions).toHaveLength(2 + composedActionNames.size);
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
			const teamId = await seedTeam(db);
			// @lore BC5 T7b: create_routine (the dispatch vehicle after the six
			// document tools) is deleted too, with the routine package. add_agent
			// replaces it — see the doc comment above for why not create_team.
			const result = await registry.invoke("add_agent", {
				teamId,
				role: "builder",
				name: "Routing check agent",
			});
			expect(result.success).toBe(true);
		});

		test("returns INVALID_INPUT when args fail Zod validation", async ({
			db,
			eventBus,
			buildToolRegistry,
		}) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			// @lore BC5 T7b: add_agent's `teamId`/`role`/`name` are required.
			const result = await registry.invoke("add_agent", {});
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
