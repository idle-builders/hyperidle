/**
 * AH2 RED — Agent config API integration tests
 *
 * AC1: Each agent's model is per-agent; two agents can differ
 * AC2: Harness chosen from registry; unregistered rejected (422 UNKNOWN_HARNESS)
 * AC2b: Cross-axis (harness, provider) pair rejected (422 INCOMPATIBLE_HARNESS_MODEL)
 * AC2c: Per-agent openai-compatible rejected (422 UNSUPPORTED_PROVIDER)
 * AC3: Seeded agents have working default model+harness
 *
 * These tests FAIL until:
 *  - agents.ts adds modelId/modelProvider to schemas + response
 *  - agents.ts injects adapterPool + validates harness/model
 *  - schema + migration 0032 adds model_id/model_provider columns
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { AdapterPool, createHarnessAdapter } from "@hyperidle/harness-registry";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-ah2-agents";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Minimal adapter pool for AH2 validation tests (builtin + claude-code only). */
function makeAH2Pool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", createHarnessAdapter({ kind: "builtin" }), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	pool.register(
		"local-claude-code",
		createHarnessAdapter({
			kind: "cli",
			config: { binary: "claude", args: [], envMap: {}, eventFormat: "text", envAllowlist: [] },
		}),
		{
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		},
	);
	return pool;
}

async function seedPrereqs(db: HyperIdleDb) {
	await db
		.insert(teams)
		.values({ id: "ah2-team", name: "AH2 Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "ah2-tm",
		teamId: "ah2-team",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: "u-founder-ah2",
		kind: "human",
		name: "AH2 Founder",
		role: "founder",
		status: "active",
		email: "ah2-founder@hyperidle.com",
		maxConcurrentSessions: 0,
		createdAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// AC1: Per-agent model — two agents can have distinct models
// ---------------------------------------------------------------------------

describe("AH2 AC1: per-agent model — distinct models on different agents", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST creates agent with modelId and modelProvider", async ({ db, eventBus }) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Agent One",
				role: "builder",
				harnessType: "builtin",
				modelId: "claude-opus-4-8",
				modelProvider: "anthropic",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.modelId).toBe("claude-opus-4-8");
		expect(body.modelProvider).toBe("anthropic");
	});

	test("two agents can have different modelId values", async ({ db, eventBus }) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res1 = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Opus Agent",
				role: "builder",
				harnessType: "builtin",
				modelId: "claude-opus-4-8",
				modelProvider: "anthropic",
			}),
		});
		const res2 = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Sonnet Agent",
				role: "builder",
				harnessType: "builtin",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
			}),
		});

		expect(res1.status).toBe(201);
		expect(res2.status).toBe(201);

		const a1 = (await res1.json()) as Record<string, unknown>;
		const a2 = (await res2.json()) as Record<string, unknown>;

		expect(a1.modelId).toBe("claude-opus-4-8");
		expect(a2.modelId).toBe("claude-sonnet-4-6");
		expect(a1.modelId).not.toBe(a2.modelId);
	});

	test("GET /api/agents response includes modelId and modelProvider fields", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		await db.insert(users).values({
			id: "ah2-builder",
			kind: "ai",
			name: "AH2 Builder",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			teamId: "ah2-tm",
			harnessType: "builtin",
			modelTierPreference: "workhorse",
			createdAt: NOW,
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/agents", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Array<Record<string, unknown>>;
		const agent = body.find((a) => a.id === "ah2-builder");
		expect(agent).toBeDefined();
		// Fields must be present in response (even if null before migration — post-migration they'll be set)
		// biome-ignore lint/style/noNonNullAssertion: asserted defined above
		expect(Object.hasOwn(agent!, "modelId")).toBe(true);
		// biome-ignore lint/style/noNonNullAssertion: asserted defined above
		expect(Object.hasOwn(agent!, "modelProvider")).toBe(true);
	});

	test("PATCH updates modelId on existing agent", async ({ db, eventBus }) => {
		await seedPrereqs(db);
		await db.insert(users).values({
			id: "ah2-patchable",
			kind: "ai",
			name: "Patchable",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			harnessType: "builtin",
			createdAt: NOW,
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/agents/ah2-patchable", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelId: "claude-haiku-4-5", modelProvider: "anthropic" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.modelId).toBe("claude-haiku-4-5");
	});
});

// ---------------------------------------------------------------------------
// AC2: Unknown harness rejected with 422 UNKNOWN_HARNESS
// ---------------------------------------------------------------------------

describe("AH2 AC2: unknown harness rejected", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST with unregistered harnessType returns 422 UNKNOWN_HARNESS", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Bad Harness Agent",
				role: "builder",
				harnessType: "nonsense-typo-harness",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
			}),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("UNKNOWN_HARNESS");
	});

	test("PATCH with unregistered harnessType returns 422 UNKNOWN_HARNESS", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		await db.insert(users).values({
			id: "ah2-harness-patch",
			kind: "ai",
			name: "Harness Patch",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			harnessType: "builtin",
			createdAt: NOW,
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/agents/ah2-harness-patch", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ harnessType: "ghost-harness" }),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("UNKNOWN_HARNESS");
	});

	test("POST with registered harnessType 'builtin' succeeds (200/201)", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Good Harness Agent",
				role: "builder",
				harnessType: "builtin",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
			}),
		});

		expect(res.status).toBe(201);
	});

	test("POST with unknown anthropic model returns 422 UNKNOWN_MODEL", async ({ db, eventBus }) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Stale Model Agent",
				role: "builder",
				harnessType: "builtin",
				modelId: "claude-sonnet-4-20250514",
				modelProvider: "anthropic",
			}),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("UNKNOWN_MODEL");
	});
});

// ---------------------------------------------------------------------------
// AC2b: Cross-axis harness↔provider pair rejected
// ---------------------------------------------------------------------------

describe("AH2 AC2b: cross-axis harness↔provider rejection", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST with claude-code harness + openrouter provider returns 422 INCOMPATIBLE_HARNESS_MODEL", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Cross-Axis Agent",
				role: "builder",
				harnessType: "claude-code",
				modelId: "anthropic/claude-sonnet-4",
				modelProvider: "openrouter",
			}),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("INCOMPATIBLE_HARNESS_MODEL");
	});

	test("POST with builtin harness + openrouter provider succeeds (builtin is multi-provider)", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Builtin+Openrouter Agent",
				role: "builder",
				harnessType: "builtin",
				modelId: "anthropic/claude-sonnet-4",
				modelProvider: "openrouter",
			}),
		});

		expect(res.status).toBe(201);
	});

	test("PATCH that flips only modelProvider to incompatible value returns 422 INCOMPATIBLE_HARNESS_MODEL", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		// Start with claude-code (anthropic-only) + anthropic — valid pair
		await db.insert(users).values({
			id: "ah2-cross-patch",
			kind: "ai",
			name: "Cross Patch",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			harnessType: "claude-code",
			createdAt: NOW,
		});

		// Now PATCH only modelProvider to openrouter — this should be caught
		// because the effective pair is claude-code (anthropic-only) + openrouter
		const res = await app.request("/api/agents/ah2-cross-patch", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelProvider: "openrouter" }),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("INCOMPATIBLE_HARNESS_MODEL");
	});

	test("PATCH to claude-code harness on agent already having openrouter returns 422", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		// Start with builtin + openrouter (valid)
		await db.insert(users).values({
			id: "ah2-cross-patch2",
			kind: "ai",
			name: "Cross Patch 2",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			harnessType: "builtin",
			createdAt: NOW,
		});
		// First set openrouter provider
		await app.request("/api/agents/ah2-cross-patch2", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelProvider: "openrouter", modelId: "openrouter/my-model" }),
		});

		// Now flip only harnessType to claude-code — effective pair = claude-code + openrouter → 422
		const res = await app.request("/api/agents/ah2-cross-patch2", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ harnessType: "claude-code" }),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("INCOMPATIBLE_HARNESS_MODEL");
	});
});

// ---------------------------------------------------------------------------
// AC2c: Per-agent openai-compatible rejected
// ---------------------------------------------------------------------------

describe("AH2 AC2c: per-agent openai-compatible rejected (ARCH-3)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST with modelProvider openai-compatible returns 422 UNSUPPORTED_PROVIDER", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "OAI Agent",
				role: "builder",
				harnessType: "builtin",
				modelId: "some-model",
				modelProvider: "openai-compatible",
			}),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("UNSUPPORTED_PROVIDER");
	});

	test("PATCH with modelProvider openai-compatible returns 422 UNSUPPORTED_PROVIDER", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		await db.insert(users).values({
			id: "ah2-oai-patch",
			kind: "ai",
			name: "OAI Patch",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			harnessType: "builtin",
			createdAt: NOW,
		});

		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/agents/ah2-oai-patch", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelProvider: "openai-compatible" }),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("UNSUPPORTED_PROVIDER");
	});
});

// ---------------------------------------------------------------------------
// AC3: Seeded / newly created agents have working defaults
// ---------------------------------------------------------------------------

describe("AH2 AC3: new agents get default model + harness", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST without explicit model/harness still creates agent with defaults", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Default Agent",
				role: "builder",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		// defaults applied
		expect(body.harnessType).toBe("builtin");
		expect(body.modelId).toBe("claude-sonnet-4-6");
		expect(body.modelProvider).toBe("anthropic");
	});
});
