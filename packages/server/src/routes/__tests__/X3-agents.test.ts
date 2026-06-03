/**
 * X3 — Agent CRUD API routes: integration tests (RED phase)
 *
 * AC-4: GET /api/agents returns AI agents with config fields
 * AC-5: POST /api/agents creates a new agent
 * AC-6: PATCH /api/agents/:id updates agent configuration
 * AC-7: DELETE /api/agents/:id soft-deletes (status = "retired")
 * AC-8: GET /api/agents/templates/:role returns template content
 *
 * These tests FAIL until:
 *  - packages/server/src/routes/agents.ts is created with all five endpoints
 *  - packages/server/src/app.ts registers the agent routes at /api/agents
 *  - packages/db/drizzle/0021_X3_agent_config.sql migration adds the columns
 *  - packages/db/src/schema.ts adds soulPrompt, harnessType, modelTierPreference to users
 *  - packages/db/src/seed.ts inserts soul_template:* factorySettings rows
 */

import {
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-x3-agents";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

const NOW = new Date().toISOString();

/** Seed the minimum required prerequisite rows for agent tests. */
async function seedPrereqs(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "x3-team", name: "X3 Test Product", phase: "build", createdAt: NOW });

	await db.insert(teamMembers).values({
		id: "x3-tm",
		teamId: "x3-team",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	// Seed the human founder (required for auth middleware)
	await db.insert(users).values({
		id: "u-founder-x3",
		kind: "human",
		name: "X3 Founder",
		role: "founder",
		status: "active",
		email: "x3-founder@hyperidle.com",
		maxConcurrentSessions: 0,
		createdAt: NOW,
	});

	// Seed a configurable AI agent
	await db.insert(users).values({
		id: "x3-agent-builder",
		kind: "ai",
		name: "X3 Builder Bot",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 2,
		teamId: "x3-tm",
		createdAt: NOW,
	});

	// Seed a system-role agent (should be excluded from agent management)
	await db.insert(users).values({
		id: "x3-system-agent",
		kind: "ai",
		name: "System Agent",
		role: "system",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});

	// Seed a chief_of_staff agent for testing multiple agents
	await db.insert(users).values({
		id: "x3-agent-cos",
		kind: "ai",
		name: "X3 Chief of Staff",
		role: "chief_of_staff",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});

	// Seed a product_manager template in factorySettings (needed for AC-8)
	await db.insert(factorySettings).values({
		key: "soul_template:product_manager",
		value: "# You are the Product Manager\n\nYour job is to clarify requirements for {{product}}.",
		updatedAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// AC-4: GET /api/agents returns AI agents with config fields
// ---------------------------------------------------------------------------

describe("X3 AC-4: GET /api/agents returns AI agents with config fields", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 200 with array of AI agents", async () => {
		const res = await app.request("/api/agents", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
	});

	it("returns 401 without auth header", async () => {
		const res = await app.request("/api/agents");
		expect(res.status).toBe(401);
	});

	it("each agent has required X3 config fields", async () => {
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		expect(body.length).toBeGreaterThan(0);
		const agent = body[0];
		expect(agent).toHaveProperty("id");
		expect(agent).toHaveProperty("name");
		expect(agent).toHaveProperty("role");
		expect(agent).toHaveProperty("soulPrompt");
		expect(agent).toHaveProperty("harnessType");
		expect(agent).toHaveProperty("modelTierPreference");
		expect(agent).toHaveProperty("maxConcurrentSessions");
		expect(agent).toHaveProperty("status");
		expect(agent).toHaveProperty("activeSessions");
	});

	it("excludes system-role agents from the response", async () => {
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const systemAgents = body.filter((a) => a.role === "system");
		expect(systemAgents).toHaveLength(0);
	});

	it("includes AI agents (non-system) in the response", async () => {
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const builderAgent = body.find((a) => a.id === "x3-agent-builder");
		expect(builderAgent).toBeDefined();
		expect(builderAgent?.name).toBe("X3 Builder Bot");
	});

	it("activeSessions is a number (0 when no active sessions)", async () => {
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		for (const agent of body) {
			expect(typeof agent.activeSessions).toBe("number");
		}
	});
});

// ---------------------------------------------------------------------------
// AC-5: POST /api/agents creates a new agent
// ---------------------------------------------------------------------------

describe("X3 AC-5: POST /api/agents creates a new agent", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 201 with created agent on success", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "New Test Builder",
				role: "builder",
				maxConcurrentSessions: 2,
			}),
		});
		expect(res.status).toBe(201);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("id");
		expect(body.name).toBe("New Test Builder");
		expect(body.role).toBe("builder");
		expect(body.maxConcurrentSessions).toBe(2);
	});

	it("created agent has kind = 'ai' and status = 'active'", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Active Bot", role: "builder" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("active");
	});

	it("created agent has activeSessions = 0", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "New Bot", role: "builder" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.activeSessions).toBe(0);
	});

	it("returns 400 when name is missing", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ role: "builder" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when role is invalid", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Test", role: "invalid_role" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when name exceeds 200 characters", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "a".repeat(201), role: "builder" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when soulPrompt exceeds 50,000 characters", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Big Prompt Bot",
				role: "builder",
				soulPrompt: "x".repeat(50_001),
			}),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when maxConcurrentSessions exceeds 20", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Test", role: "builder", maxConcurrentSessions: 21 }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when modelTierPreference is invalid", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Test", role: "builder", modelTierPreference: "ultra" }),
		});
		expect(res.status).toBe(400);
	});

	it("accepts valid modelTierPreference values", async () => {
		for (const tier of ["reasoning", "workhorse", "fast"]) {
			const res = await app.request("/api/agents", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: `Bot ${tier}`, role: "builder", modelTierPreference: tier }),
			});
			expect(res.status, `modelTierPreference '${tier}' should be 201`).toBe(201);
		}
	});

	it("persists the agent to the database", async () => {
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "DB Persist Bot", role: "builder" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		const agentId = body.id as string;

		// Verify the agent exists in the DB via GET /api/agents
		const listRes = await app.request("/api/agents", { headers: authHeaders() });
		const agents = (await listRes.json()) as Array<Record<string, unknown>>;
		expect(agents.find((a) => a.id === agentId)).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// AC-6: PATCH /api/agents/:id updates agent configuration
// ---------------------------------------------------------------------------

describe("X3 AC-6: PATCH /api/agents/:id updates agent configuration", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 200 with updated agent on success", async () => {
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ soulPrompt: "New persona text", modelTierPreference: "reasoning" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.soulPrompt).toBe("New persona text");
		expect(body.modelTierPreference).toBe("reasoning");
	});

	it("preserves unchanged fields when patching", async () => {
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ soulPrompt: "Updated prompt" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		// name should be unchanged
		expect(body.name).toBe("X3 Builder Bot");
		expect(body.role).toBe("builder");
	});

	it("returns 403 when patching a system-role agent", async () => {
		const res = await app.request("/api/agents/x3-system-agent", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Renamed System" }),
		});
		expect(res.status).toBe(403);
	});

	it("returns 404 when agent ID does not exist", async () => {
		const res = await app.request("/api/agents/nonexistent-agent-id", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Ghost" }),
		});
		expect(res.status).toBe(404);
	});

	it("returns 400 when soulPrompt exceeds 50,000 characters", async () => {
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ soulPrompt: "x".repeat(50_001) }),
		});
		expect(res.status).toBe(400);
	});

	it("can set harnessType", async () => {
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ harnessType: "aider" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.harnessType).toBe("aider");
	});

	it("can set soulPrompt to null (removes persona)", async () => {
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ soulPrompt: null }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.soulPrompt).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-7: DELETE /api/agents/:id soft-deletes (status = "retired")
// ---------------------------------------------------------------------------

describe("X3 AC-7: DELETE /api/agents/:id soft-deletes", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 200 with status = 'retired' on successful delete", async () => {
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("retired");
		expect(body.id).toBe("x3-agent-builder");
	});

	it("retired agent no longer appears in GET /api/agents list", async () => {
		await app.request("/api/agents/x3-agent-builder", {
			method: "DELETE",
			headers: authHeaders(),
		});

		const listRes = await app.request("/api/agents", { headers: authHeaders() });
		const agents = (await listRes.json()) as Array<Record<string, unknown>>;
		const found = agents.find((a) => a.id === "x3-agent-builder");
		expect(found).toBeUndefined();
	});

	it("returns 403 when deleting a system-role agent", async () => {
		const res = await app.request("/api/agents/x3-system-agent", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(403);
	});

	it("returns 404 when agent ID does not exist", async () => {
		const res = await app.request("/api/agents/nonexistent-id", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	it("returns 409 when agent is already retired", async () => {
		// First delete
		await app.request("/api/agents/x3-agent-builder", {
			method: "DELETE",
			headers: authHeaders(),
		});

		// Second delete — should be 409 Conflict
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(409);
	});
});

// ---------------------------------------------------------------------------
// AC-8: GET /api/agents/templates/:role returns template content
// ---------------------------------------------------------------------------

describe("X3 AC-8: GET /api/agents/templates/:role returns template content", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedPrereqs(db);
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns 200 with { role, content } for product_manager", async () => {
		const res = await app.request("/api/agents/templates/product_manager", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.role).toBe("product_manager");
		expect(typeof body.content).toBe("string");
		expect((body.content as string).length).toBeGreaterThan(0);
	});

	it("template content matches the seeded factorySettings value", async () => {
		const res = await app.request("/api/agents/templates/product_manager", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;

		// Should contain the content we seeded in seedPrereqs
		expect(body.content).toContain("Product Manager");
	});

	it("returns 404 for builder role (no template file exists)", async () => {
		const res = await app.request("/api/agents/templates/builder", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("NOT_FOUND");
	});

	it("returns 404 for nonexistent role", async () => {
		const res = await app.request("/api/agents/templates/nonexistent_role", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	it("returns 401 without auth header", async () => {
		const res = await app.request("/api/agents/templates/product_manager");
		expect(res.status).toBe(401);
	});
});
