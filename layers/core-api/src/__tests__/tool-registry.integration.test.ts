import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
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
 * `split_knowledge`) are DELETED — `create_routine` is the new dispatch
 * vehicle for handler-routing/INVALID_INPUT proof below (`create_team`'s
 * seam route requires a `functions` field its tool input never sends and
 * always 400s — a pre-existing gap out of scope here, so it stays off the
 * dispatch-vehicle path).
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

/** Seeds a team + agent for `create_routine`'s `ownerAgentId` foreign key. */
async function seedAgent(db: HyperIdleDb): Promise<string> {
	const teamId = `team-${Date.now()}`;
	const agentId = `agent-${Date.now()}`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Registry Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		name: "Registry Agent",
		role: "builder",
		status: "active",
		teamId,
		createdAt: NOW,
	});
	return agentId;
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
	// edit) — ten today, re-derived every run so a future action addition or
	// removal is caught here rather than assumed.
	test("returns exactly the four management tools plus the composed action tools", ({
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
		const expected = new Set([
			"create_team",
			"add_agent",
			"create_routine",
			"update_routine",
			...composedActionNames,
		]);
		expect(names).toEqual(expected);
		// task ×3 (search_tasks/open_task/edit_task), thread ×4
		// (search_threads/open_thread/adjust_thread/send_message), document ×3
		// (search_documents/open_document/edit_document) — ten, not the plan's
		// stale "six" (written before the thread module was counted).
		expect(composedActionNames.size).toBe(10);
		expect(registry.definitions).toHaveLength(4 + composedActionNames.size);
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
			const agentId = await seedAgent(db);
			// @lore the six document tools (write_memory among them) are deleted —
			// create_routine is the new dispatch vehicle.
			const result = await registry.invoke("create_routine", {
				name: "Routing check routine",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * 1-5" }),
			});
			expect(result.success).toBe(true);
		});

		test("returns INVALID_INPUT when args fail Zod validation", async ({
			db,
			eventBus,
			buildToolRegistry,
		}) => {
			const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" });
			// @lore create_routine's `name`/`ownerAgentId`/`triggerType` are required.
			const result = await registry.invoke("create_routine", {});
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
