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
 *  - framework/db/drizzle/0021_X3_agent_config.sql migration adds the columns
 *  - framework/db/src/schema.ts adds systemPrompt, harnessType, modelTierPreference to users
 *  - framework/db/src/seed.ts inserts system_template:* factorySettings rows
 */

import { agentRunConfig, type HyperIdleDb, knowledgeItems, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

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

	// Seed the human founder (required for auth middleware)
	await db.insert(users).values({
		id: "u-founder-x3",
		kind: "human",
		name: "X3 Founder",
		role: "founder",
		status: "active",
		email: "x3-founder@hyperidle.com",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "u-founder-x3",
		maxConcurrentSessions: 0,
	});

	// Seed a configurable AI agent
	await db.insert(users).values({
		id: "x3-agent-builder",
		kind: "ai",
		name: "X3 Builder Bot",
		role: "builder",
		status: "active",
		teamId: "x3-team",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "x3-agent-builder",
		maxConcurrentSessions: 2,
	});

	// Seed a system-role agent (should be excluded from agent management)
	await db.insert(users).values({
		id: "x3-system-agent",
		kind: "ai",
		name: "System Agent",
		role: "system",
		status: "active",
		createdAt: NOW,
	});

	// @lore AD8a: role string "chief_of_staff" renamed in AD8b. Seed a chief_of_staff agent for testing multiple agents
	await db.insert(users).values({
		id: "x3-agent-cos",
		kind: "ai",
		name: "X3 System Agent",
		role: "assistant",
		status: "active",
		createdAt: NOW,
	});

	// @lore AU18: no factorySettings seed needed — AC-8's product_manager
	// template now resolves from the real docs/system-prompts/product-manager.md
	// file on disk via the shared resolver.
}

// ---------------------------------------------------------------------------
// AC-4: GET /api/agents returns AI agents with config fields
// ---------------------------------------------------------------------------

describe("X3 AC-4: GET /api/agents returns AI agents with config fields", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with array of AI agents", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
	});

	test("returns 401 without auth header", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/agents");
		expect(res.status).toBe(401);
	});

	test("each agent has required X3 config fields", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		expect(body.length).toBeGreaterThan(0);
		const agent = body[0];
		expect(agent).toHaveProperty("id");
		expect(agent).toHaveProperty("name");
		expect(agent).toHaveProperty("role");
		expect(agent).toHaveProperty("identityKnowledgeId");
		expect(agent).toHaveProperty("harnessType");
		expect(agent).toHaveProperty("modelTierPreference");
		expect(agent).toHaveProperty("maxConcurrentSessions");
		expect(agent).toHaveProperty("status");
	});

	test("excludes system-role agents from the response", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const systemAgents = body.filter((a) => a.role === "system");
		expect(systemAgents).toHaveLength(0);
	});

	test("includes AI agents (non-system) in the response", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const builderAgent = body.find((a) => a.id === "x3-agent-builder");
		expect(builderAgent).toBeDefined();
		expect(builderAgent?.name).toBe("X3 Builder Bot");
	});

	// @lore AU26 J4: the `activeSessions` run count is GONE from this response —
	// core-api stopped reading `agent-orchestration`'s `sessions` table. Settings →
	// Agents fetches `GET /api/agent-orchestration/runs/active-counts` instead.
	test("carries no agent-run count", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		expect(body.length).toBeGreaterThan(0);
		for (const agent of body) {
			expect(agent).not.toHaveProperty("activeSessions");
		}
	});
});

// ---------------------------------------------------------------------------
// AC-5: POST /api/agents creates a new agent
// ---------------------------------------------------------------------------

describe("X3 AC-5: POST /api/agents creates a new agent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 201 with created agent on success", async ({ db, app }) => {
		await seedPrereqs(db);
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

	test("created agent has kind = 'ai' and status = 'active'", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Active Bot", role: "builder" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("active");
	});

	// @lore AU26 J4: see above — the create response no longer carries a run count.
	test("created agent carries no agent-run count", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "New Bot", role: "builder" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).not.toHaveProperty("activeSessions");
		expect(body.name).toBe("New Bot");
	});

	test("returns 400 when name is missing", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ role: "builder" }),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when role is empty string", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Test", role: "" }),
		});
		expect(res.status).toBe(400);
	});

	test("accepts custom role strings not in the catalog", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Custom Agent", role: "custom_specialist" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.role).toBe("custom_specialist");
	});

	test("returns 400 when name exceeds 200 characters", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "a".repeat(201), role: "builder" }),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when the seed identity exceeds 50,000 characters", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Big Prompt Bot",
				role: "builder",
				systemPrompt: "x".repeat(50_001),
			}),
		});
		expect(res.status).toBe(400);
	});

	test("a created agent gets an identity document of its own", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Identity Bot",
				role: "builder",
				systemPrompt: "You are Identity Bot.",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { id: string; identityKnowledgeId: string };
		expect(body.identityKnowledgeId).toBeTruthy();

		// Bound to the agent, and an agent file — the binding session assembly reads.
		const [doc] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, body.identityKnowledgeId));
		expect(doc?.body).toBe("You are Identity Bot.");
		expect(doc?.role).toBe("agent_file");
		expect(doc?.scopeKind).toBe("user");
		expect(doc?.scopeId).toBe(body.id);
	});

	test("returns 400 when maxConcurrentSessions exceeds 20", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Test", role: "builder", maxConcurrentSessions: 21 }),
		});
		expect(res.status).toBe(400);
	});

	// @lore BA9d: strategy AgentCategory removed — API wire must reject it.
	test("returns 400 when agentCategory is 'strategy'", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Strategy Bot", role: "assistant", agentCategory: "strategy" }),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when modelTierPreference is invalid", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Test", role: "builder", modelTierPreference: "ultra" }),
		});
		expect(res.status).toBe(400);
	});

	test("accepts valid modelTierPreference values", async ({ db, app }) => {
		await seedPrereqs(db);
		for (const tier of ["reasoning", "workhorse", "fast"]) {
			const res = await app.request("/api/agents", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: `Bot ${tier}`, role: "builder", modelTierPreference: tier }),
			});
			expect(res.status, `modelTierPreference '${tier}' should be 201`).toBe(201);
		}
	});

	test("persists the agent to the database", async ({ db, app }) => {
		await seedPrereqs(db);
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
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with updated agent on success", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Renamed Builder", modelTierPreference: "reasoning" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Renamed Builder");
		expect(body.modelTierPreference).toBe("reasoning");
	});

	test("preserves unchanged fields when patching", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ modelTierPreference: "reasoning" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		// name should be unchanged
		expect(body.name).toBe("X3 Builder Bot");
		expect(body.role).toBe("builder");
	});

	test("returns 403 when patching a system-role agent", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/x3-system-agent", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Renamed System" }),
		});
		expect(res.status).toBe(403);
	});

	test("returns 404 when agent ID does not exist", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/nonexistent-agent-id", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Ghost" }),
		});
		expect(res.status).toBe(404);
	});

	test("can set harnessType", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ harnessType: "aider" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.harnessType).toBe("aider");
	});

	// The two persona tests that lived here — a 50,000-char cap and clearing it
	// with null — are gone with the field. Editing an agent's identity is editing
	// its knowledge document, so those belong to the knowledge edit endpoint, not
	// to a second copy of it on this route.
});

// ---------------------------------------------------------------------------
// AC-7: DELETE /api/agents/:id soft-deletes (status = "retired")
// ---------------------------------------------------------------------------

describe("X3 AC-7: DELETE /api/agents/:id soft-deletes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with status = 'retired' on successful delete", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/x3-agent-builder", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.status).toBe("retired");
		expect(body.id).toBe("x3-agent-builder");
	});

	test("retired agent no longer appears in GET /api/agents list", async ({ db, app }) => {
		await seedPrereqs(db);
		await app.request("/api/agents/x3-agent-builder", {
			method: "DELETE",
			headers: authHeaders(),
		});

		const listRes = await app.request("/api/agents", { headers: authHeaders() });
		const agents = (await listRes.json()) as Array<Record<string, unknown>>;
		const found = agents.find((a) => a.id === "x3-agent-builder");
		expect(found).toBeUndefined();
	});

	test("returns 403 when deleting a system-role agent", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/x3-system-agent", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(403);
	});

	test("returns 404 when agent ID does not exist", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/nonexistent-id", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("returns 409 when agent is already retired", async ({ db, app }) => {
		await seedPrereqs(db);
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

// @lore BA9g: AC-8 covered `GET /api/agents/templates/:role`, which served
// `docs/system-prompts/*.md`. Both the route and those files are gone — the
// personas are the `role-personas` plugin's, and HyperIdle ships a single agent
// with a bare AGENTS.md rather than a built-in idea of what a "builder" is. A
// plugin's agent brings its own identity (`BA9g-plugin-agent-identity`), and an
// agent you create starts empty until you write one.
