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
 */
const test = baseTest.extend<{
	buildToolRegistry: (
		ctx: ToolContext<HyperIdleDb>,
		options: BuildToolRegistryOptions<HyperIdleDb>,
	) => ToolRegistry<HyperIdleDb>;
}>({
	buildToolRegistry: async ({ app }, use) => {
		const definitions = buildToolDefinitions(createInProcessCoreApiTransport(app));
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
	// @lore the six document tools are gone — the catalog is now exactly the
	// four AE3 management tools.
	test("returns the canonical set of management tools", ({ db, eventBus, buildToolRegistry }) => {
		const registry = buildToolRegistry(makeContext(db, eventBus), { role: "assistant" }); // @lore AD8a: role string renamed to "assistant" in AD8b
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toEqual(["add_agent", "create_routine", "create_team", "update_routine"]);
		expect(registry.definitions).toHaveLength(4);
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
