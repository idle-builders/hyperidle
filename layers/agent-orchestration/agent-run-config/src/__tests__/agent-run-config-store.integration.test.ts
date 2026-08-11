/**
 * AU26 G1 — `agent-run-config` is the SQL-owning Service for the run-config
 * columns relocated off `users`/`teams` (architecture §D-L).
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
 *    semantics `PATCH /api/agents/:id` has always had);
 *  - team defaults round-trip and default to all-null.
 */

import { teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	DEFAULT_AGENT_RUN_CONFIG,
	EMPTY_TEAM_RUN_CONFIG_DEFAULTS,
	readAgentRunConfig,
	readAgentRunConfigs,
	readTeamRunConfigDefaults,
	writeAgentRunConfig,
	writeTeamRunConfigDefaults,
} from "../index.js";

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
	test("an agent with no config row resolves the all-null effective config", async ({
		db,
		ids,
	}) => {
		await insertAgent(db, ids("a-none"));

		const config = await readAgentRunConfig(db, ids("a-none"));

		expect(config).toEqual({
			systemPrompt: null,
			harnessType: null,
			modelTierPreference: null,
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 1,
		});
		expect(config).toEqual(DEFAULT_AGENT_RUN_CONFIG);
	});

	test("a full write round-trips verbatim", async ({ db, ids }) => {
		await insertAgent(db, ids("a-full"));

		await writeAgentRunConfig(db, ids("a-full"), {
			systemPrompt: "you are a builder",
			harnessType: "claude-code",
			modelTierPreference: "reasoning",
			modelId: "claude-opus-4-8",
			modelProvider: "anthropic",
			maxConcurrentSessions: 7,
		});

		expect(await readAgentRunConfig(db, ids("a-full"))).toEqual({
			systemPrompt: "you are a builder",
			harnessType: "claude-code",
			modelTierPreference: "reasoning",
			modelId: "claude-opus-4-8",
			modelProvider: "anthropic",
			maxConcurrentSessions: 7,
		});
	});

	test("a partial write patches only the named fields", async ({ db, ids }) => {
		await insertAgent(db, ids("a-partial"));
		await writeAgentRunConfig(db, ids("a-partial"), {
			harnessType: "builtin",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 3,
		});

		await writeAgentRunConfig(db, ids("a-partial"), { modelId: "claude-opus-4-8" });

		expect(await readAgentRunConfig(db, ids("a-partial"))).toEqual({
			systemPrompt: null,
			harnessType: "builtin",
			modelTierPreference: null,
			modelId: "claude-opus-4-8",
			modelProvider: "anthropic",
			maxConcurrentSessions: 3,
		});
	});

	test("an explicit null in a patch clears that field only", async ({ db, ids }) => {
		await insertAgent(db, ids("a-clear"));
		await writeAgentRunConfig(db, ids("a-clear"), {
			harnessType: "claude-code",
			modelId: "claude-opus-4-8",
		});

		await writeAgentRunConfig(db, ids("a-clear"), { modelId: null });

		const config = await readAgentRunConfig(db, ids("a-clear"));
		expect(config.modelId).toBeNull();
		expect(config.harnessType).toBe("claude-code");
	});

	test("a first write for an agent with no row still lands the defaults for absent fields", async ({
		db,
		ids,
	}) => {
		await insertAgent(db, ids("a-first"));

		await writeAgentRunConfig(db, ids("a-first"), { harnessType: "builtin" });

		expect(await readAgentRunConfig(db, ids("a-first"))).toEqual({
			systemPrompt: null,
			harnessType: "builtin",
			modelTierPreference: null,
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 1,
		});
	});

	test("readAgentRunConfigs returns one entry per requested agent, defaulting the missing", async ({
		db,
		ids,
	}) => {
		await insertAgent(db, ids("a-batch-1"));
		await insertAgent(db, ids("a-batch-2"));
		await writeAgentRunConfig(db, ids("a-batch-1"), { maxConcurrentSessions: 5 });

		const map = await readAgentRunConfigs(db, [ids("a-batch-1"), ids("a-batch-2")]);

		expect(map.get(ids("a-batch-1"))?.maxConcurrentSessions).toBe(5);
		expect(map.get(ids("a-batch-2"))).toEqual(DEFAULT_AGENT_RUN_CONFIG);
	});

	// @lore this file used to have a test asserting the `agentRunConfig.agentId → users.id` cascade
	// FK fires by deleting a user. Deleted: production never deletes a `users` row (the agents DELETE
	// route soft-retires via an UPDATE) and no code path anywhere deletes one either — the cascade FK
	// exists in the schema (untouched) but nothing production does can ever trigger it. The store
	// itself exports no delete function at all, so there is no feature here to remove either — the
	// safety this test protected already holds by the capability being absent.
});

describe("team run config defaults store", () => {
	test("a team with no row resolves all-null defaults", async ({ db, ids }) => {
		await db.insert(teams).values({ id: ids("t-none"), name: "T", phase: "build", createdAt: NOW });
		// The owner writes the membership row alongside the team.
		await db.insert(teamMembers).values({
			id: ids("t-none-members"),
			teamId: ids("t-none"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		expect(await readTeamRunConfigDefaults(db, ids("t-none"))).toEqual({
			defaultHarnessType: null,
			defaultModelId: null,
			defaultModelProvider: null,
		});
		expect(await readTeamRunConfigDefaults(db, ids("t-none"))).toEqual(
			EMPTY_TEAM_RUN_CONFIG_DEFAULTS,
		);
	});

	test("team defaults round-trip verbatim", async ({ db, ids }) => {
		await db.insert(teams).values({ id: ids("t-set"), name: "T", phase: "build", createdAt: NOW });
		// The owner writes the membership row alongside the team.
		await db.insert(teamMembers).values({
			id: ids("t-set-members"),
			teamId: ids("t-set"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		await writeTeamRunConfigDefaults(db, ids("t-set"), {
			defaultHarnessType: "codex",
			defaultModelId: "claude-sonnet-4-6",
			defaultModelProvider: "anthropic",
		});

		expect(await readTeamRunConfigDefaults(db, ids("t-set"))).toEqual({
			defaultHarnessType: "codex",
			defaultModelId: "claude-sonnet-4-6",
			defaultModelProvider: "anthropic",
		});
	});
});
