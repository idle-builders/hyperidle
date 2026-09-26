import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import type { BuildToolRegistryOptions } from "@hyperidle/tool-handlers";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { describe, expect } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";

/**
 * @lore BC5 T11: `create_team`/`add_agent` (the hand-written management
 * catalog `buildToolDefinitions` built) are DELETED with the `CoreApiPort`
 * seam they wrote through — the `org` package they scaffolded is gone. What
 * an agent gets today is exactly the composed core action list's own tool
 * projection (`actionsAsTools(buildCoreActions(...))`), the same union
 * `run-orchestration-composition.ts`'s `buildToolProvider` assembles.
 */
const test = baseTest.extend<{
	buildToolRegistry: (
		ctx: ToolContext<HyperIdleDb>,
		options: BuildToolRegistryOptions<HyperIdleDb>,
	) => ToolRegistry<HyperIdleDb>;
}>({
	buildToolRegistry: async ({ agentOrchestration }, use) => {
		const actionTools = actionsAsTools(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}),
		);
		await use((ctx, options) =>
			buildToolRegistryFromDefinitions<HyperIdleDb>([...actionTools], ctx, options),
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

describe("buildToolRegistry", () => {
	// @lore BC5 T11: what an agent gets today is exactly the composed core
	// action list's own tool projection — never asserted with `toContain`,
	// always exact set equality, so a future action addition or removal is
	// caught here rather than assumed. task's own three, thread's own four,
	// document's own three (search/open/edit), platform's own two
	// (search_plugins/edit_plugin), user's own three (search_users/open_user/
	// edit_user) — fifteen.
	test("returns exactly the composed action tools", ({
		db,
		eventBus,
		agentOrchestration,
		buildToolRegistry,
	}) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), {});
		const names = new Set(registry.definitions.map((d) => d.name));

		const composedActionNames = new Set(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}).map((a) => a.declaration.name),
		);
		// Set equality, never toContain: proves the registered set is EXACTLY
		// the composed action list, with nothing extra and nothing missing.
		expect(names).toEqual(composedActionNames);
		expect(composedActionNames.size).toBe(15);
		expect(registry.definitions).toHaveLength(composedActionNames.size);
	});

	test("each definition has a non-empty description and a Zod input schema", ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), {});
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
			const registry = buildToolRegistry(makeContext(db, eventBus), {});
			const result = await registry.invoke("does_not_exist", {});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("NOT_FOUND");
			}
		});

		test("routes to the matching handler by name", async ({ db, eventBus, buildToolRegistry }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), {});
			const result = await registry.invoke("search_users", {});
			expect(result.success).toBe(true);
		});

		test("returns INVALID_INPUT when args fail Zod validation", async ({
			db,
			eventBus,
			buildToolRegistry,
		}) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), {});
			// `open_task`'s `id` is a bare required string — no business
			// invariant runs before the zod shape itself refuses `{}`.
			const result = await registry.invoke("open_task", {});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("INVALID_INPUT");
			}
		});
	});

	describe("toClaudeToolSpecs()", () => {
		test("returns one Claude tool spec per definition", ({ db, eventBus, buildToolRegistry }) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), {});
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
			const registry = buildToolRegistry(makeContext(db, eventBus), {});
			const specNames = registry
				.toClaudeToolSpecs()
				.map((s) => s.name)
				.sort();
			const defNames = registry.definitions.map((d) => d.name).sort();
			expect(specNames).toEqual(defNames);
		});
	});
});
