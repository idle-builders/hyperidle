/**
 * Options set when configuring an agent survive the round trip through the real
 * API and database, and are what an agent's next run would carry.
 *
 * The last test is the load-bearing one: an agent nobody configured must read
 * back as having no options at all, because that is what makes it run exactly as
 * it did before this existed.
 */

import { agentRunConfig, teams, users } from "@hyperidle/db";
import { AdapterPool, CliHarnessAdapter } from "@hyperidle/harness-registry";
import { readAgentRunConfig } from "@hyperidle/run-orchestration";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-agent-model-options";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

function makePool(): AdapterPool {
	const pool = new AdapterPool();
	// @lore The options this test configures used to be the built-in harness's
	// `reasoning_effort`, which rode an outgoing request body because that harness
	// had no command line. Every harness is a spawned process now, so the same
	// property is proven on codex's `model_reasoning_effort`, which rides argv.
	pool.register(
		"local-codex",
		new CliHarnessAdapter({
			binary: "codex",
			args: [],
			envMap: {},
			eventFormat: "ndjson",
			envAllowlist: [],
		}),
		{
			name: "Codex",
			kind: "local",
			type: "codex",
			modelProviders: [],
			maxConcurrent: 4,
		},
	);
	return pool;
}

async function seedPrereqs(db: Parameters<typeof readAgentRunConfig>[0]): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "opt-team", name: "Options Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: "u-founder-opt",
		kind: "human",
		name: "Options Founder",
		role: "founder",
		status: "active",
		email: "options-founder@hyperidle.com",
		createdAt: NOW,
	});
	await db.insert(agentRunConfig).values({
		agentUserId: "u-founder-opt",
		maxConcurrentSessions: 0,
	});
}

async function createAgent(
	app: Awaited<ReturnType<typeof createTestApp>>,
	body: Record<string, unknown>,
): Promise<string> {
	const res = await app.request("/api/agents", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			name: "Atlas",
			role: "builder",
			harnessType: "codex",
			modelId: "gpt-5.4-mini",
			modelProvider: null,
			teamId: "opt-team",
			...body,
		}),
	});
	expect(res.status).toBe(201);
	return ((await res.json()) as { id: string }).id;
}

describe("configuring an agent's model options", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("options set at creation persist and are what the run would carry", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		const id = await createAgent(app, { modelOptions: { model_reasoning_effort: "high" } });

		// Read back through the API the editor uses.
		const list = (await (await app.request("/api/agents", { headers: authHeaders() })).json()) as {
			id: string;
			modelOptions: Record<string, unknown>;
		}[];
		expect(list.find((a) => a.id === id)?.modelOptions).toEqual({ model_reasoning_effort: "high" });

		// And through the read path a session actually provisions from.
		const runConfig = await readAgentRunConfig(db, id);
		expect(runConfig.modelOptions).toEqual({ model_reasoning_effort: "high" });
	});

	test("a later edit changes them, and an unrelated edit leaves them alone", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const id = await createAgent(app, { modelOptions: { model_reasoning_effort: "high" } });

		await app.request(`/api/agents/${id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelOptions: { model_reasoning_effort: "xhigh" } }),
		});
		expect((await readAgentRunConfig(db, id)).modelOptions).toEqual({
			model_reasoning_effort: "xhigh",
		});

		// Renaming the agent must not disturb what its model runs with.
		await app.request(`/api/agents/${id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Atlas Renamed" }),
		});
		expect((await readAgentRunConfig(db, id)).modelOptions).toEqual({
			model_reasoning_effort: "xhigh",
		});
	});

	test("clearing them returns the agent to whatever the harness does", async ({ db, eventBus }) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const id = await createAgent(app, { modelOptions: { model_reasoning_effort: "high" } });

		await app.request(`/api/agents/${id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelOptions: {} }),
		});

		expect((await readAgentRunConfig(db, id)).modelOptions).toEqual({});
	});

	test("an agent nobody configured has no options at all", async ({ db, eventBus }) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		const id = await createAgent(app, {});

		// This is the equivalence that keeps every existing agent running exactly
		// as it did before options existed.
		expect((await readAgentRunConfig(db, id)).modelOptions).toEqual({});
	});
});
