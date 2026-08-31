/**
 * AU26 G1 — `agent-run-config-store` is the SQL-owning Service for the
 * run-config columns relocated off `users`/`teams` (architecture §D-L).
 *
 * Folded into run-orchestration by AU44 batch6; test recovered and
 * re-pointed here.
 *
 * The behavioural contract these tests pin:
 *  - a written config round-trips verbatim (including `maxConcurrentSessions`,
 *    the one NOT NULL DEFAULT 1 column);
 *  - an agent with NO row resolves the SAME effective config an agent whose
 *    columns were all-null resolved before the move — `maxConcurrentSessions`
 *    1, everything else null (§D-L's backfill invariant, stated for the
 *    steady state as well as the migration);
 *  - a partial write patches only the named fields and leaves the rest;
 *  - an explicit `null` in a patch clears the field (the `"x" in data`
 *    semantics `PATCH /api/agents/:id` has always had).
 */

import { agentRunConfig, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	DEFAULT_AGENT_RUN_CONFIG,
	readAgentRunConfig,
	readAgentRunConfigs,
	writeAgentRunConfig,
} from "../agent-run-config-store.js";

const NOW = "2026-08-04T00:00:00.000Z";

async function insertAgent(
	db: Parameters<typeof readAgentRunConfig>[0],
	id: string,
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: id,
		role: "builder",
		agentCategory: "team",
		status: "active",
		createdAt: NOW,
	});
}

describe("agent run config store", () => {
	test("an agent with no config row resolves the all-null effective config", async ({ db }) => {
		await insertAgent(db, "a-none");

		const config = await readAgentRunConfig(db, "a-none");

		expect(config).toEqual({
			harnessType: null,
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 1,
			modelOptions: {},
		});
		expect(config).toEqual(DEFAULT_AGENT_RUN_CONFIG);
	});

	test("a full write round-trips verbatim", async ({ db }) => {
		await insertAgent(db, "a-full");

		await writeAgentRunConfig(db, "a-full", {
			harnessType: "claude-code",
			modelId: "claude-opus-4-8",
			modelProvider: "anthropic",
			maxConcurrentSessions: 7,
			modelOptions: { effort: "high" },
		});

		expect(await readAgentRunConfig(db, "a-full")).toEqual({
			harnessType: "claude-code",
			modelId: "claude-opus-4-8",
			modelProvider: "anthropic",
			maxConcurrentSessions: 7,
			modelOptions: { effort: "high" },
		});
	});

	test("a partial write patches only the named fields", async ({ db }) => {
		await insertAgent(db, "a-partial");
		await writeAgentRunConfig(db, "a-partial", {
			harnessType: "opencode",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 3,
			modelOptions: {},
		});

		await writeAgentRunConfig(db, "a-partial", { modelId: "claude-opus-4-8" });

		expect(await readAgentRunConfig(db, "a-partial")).toEqual({
			harnessType: "opencode",
			modelId: "claude-opus-4-8",
			modelProvider: "anthropic",
			maxConcurrentSessions: 3,
			modelOptions: {},
		});
	});

	test("an explicit null in a patch clears that field only", async ({ db }) => {
		await insertAgent(db, "a-clear");
		await writeAgentRunConfig(db, "a-clear", {
			harnessType: "claude-code",
			modelId: "claude-opus-4-8",
		});

		await writeAgentRunConfig(db, "a-clear", { modelId: null });

		const config = await readAgentRunConfig(db, "a-clear");
		expect(config.modelId).toBeNull();
		expect(config.harnessType).toBe("claude-code");
	});

	test("a first write for an agent with no row still lands the defaults for absent fields", async ({
		db,
	}) => {
		await insertAgent(db, "a-first");

		await writeAgentRunConfig(db, "a-first", { harnessType: "opencode" });

		expect(await readAgentRunConfig(db, "a-first")).toEqual({
			harnessType: "opencode",
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 1,
			modelOptions: {},
		});
	});

	test("readAgentRunConfigs returns one entry per requested agent, defaulting the missing", async ({
		db,
	}) => {
		await insertAgent(db, "a-batch-1");
		await insertAgent(db, "a-batch-2");
		await writeAgentRunConfig(db, "a-batch-1", { maxConcurrentSessions: 5 });

		const map = await readAgentRunConfigs(db, ["a-batch-1", "a-batch-2"]);

		expect(map.get("a-batch-1")?.maxConcurrentSessions).toBe(5);
		expect(map.get("a-batch-2")).toEqual(DEFAULT_AGENT_RUN_CONFIG);
	});

	test("options an agent never configured read as none, and survive a sibling edit", async ({
		db,
	}) => {
		await insertAgent(db, "a-untouched");
		await writeAgentRunConfig(db, "a-untouched", { harnessType: "claude-code" });

		// An agent whose options were never set reads as no options — the shape an
		// agent configured before this column existed resolves to.
		expect((await readAgentRunConfig(db, "a-untouched")).modelOptions).toEqual({});

		await writeAgentRunConfig(db, "a-untouched", { modelOptions: { effort: "max" } });
		// Editing an unrelated field must not disturb stored options.
		await writeAgentRunConfig(db, "a-untouched", { maxConcurrentSessions: 4 });

		const config = await readAgentRunConfig(db, "a-untouched");
		expect(config.modelOptions).toEqual({ effort: "max" });
		expect(config.maxConcurrentSessions).toBe(4);
	});

	test("options round-trip every value shape a harness control can produce", async ({ db }) => {
		await insertAgent(db, "a-shapes");

		await writeAgentRunConfig(db, "a-shapes", {
			modelOptions: { effort: "high", verbose: true, retries: 3 },
		});

		expect((await readAgentRunConfig(db, "a-shapes")).modelOptions).toEqual({
			effort: "high",
			verbose: true,
			retries: 3,
		});
	});

	test("writing empty options clears them rather than storing an empty object", async ({ db }) => {
		await insertAgent(db, "a-cleared");
		await writeAgentRunConfig(db, "a-cleared", { modelOptions: { effort: "low" } });

		await writeAgentRunConfig(db, "a-cleared", { modelOptions: {} });

		expect((await readAgentRunConfig(db, "a-cleared")).modelOptions).toEqual({});
		const [row] = await db
			.select({ raw: agentRunConfig.modelOptionsJson })
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, "a-cleared"));
		expect(row?.raw).toBeNull();
	});

	test("a corrupted options column degrades to no options rather than failing the read", async ({
		db,
	}) => {
		await insertAgent(db, "a-corrupt");
		await writeAgentRunConfig(db, "a-corrupt", { harnessType: "codex" });
		await db
			.update(agentRunConfig)
			.set({ modelOptionsJson: "not json at all" })
			.where(eq(agentRunConfig.agentUserId, "a-corrupt"));

		const config = await readAgentRunConfig(db, "a-corrupt");

		// The agent still runs — as an agent with no options, which is today's behaviour.
		expect(config.modelOptions).toEqual({});
		expect(config.harnessType).toBe("codex");
	});

	test("readAgentRunConfigs carries options for each agent", async ({ db }) => {
		await insertAgent(db, "a-many-1");
		await insertAgent(db, "a-many-2");
		await writeAgentRunConfig(db, "a-many-1", { modelOptions: { effort: "xhigh" } });

		const map = await readAgentRunConfigs(db, ["a-many-1", "a-many-2"]);

		expect(map.get("a-many-1")?.modelOptions).toEqual({ effort: "xhigh" });
		expect(map.get("a-many-2")?.modelOptions).toEqual({});
	});

	// @lore this file used to have a test asserting the `agentRunConfig.agentId → users.id` cascade
	// FK fires by deleting a user. Deleted: production never deletes a `users` row (the agents DELETE
	// route soft-retires via an UPDATE) and no code path anywhere deletes one either — the cascade FK
	// exists in the schema (untouched) but nothing production does can ever trigger it. The store
	// itself exports no delete function at all, so there is no feature here to remove either — the
	// safety this test protected already holds by the capability being absent.
});
