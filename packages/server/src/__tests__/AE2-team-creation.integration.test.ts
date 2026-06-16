/**
 * AE2 — Team Creation & Onboarding Journey
 *
 * AC-1: Team creation with function-based roster using defaultRoster().
 * AC-4: Welcome message seeded in assistant thread when userId is provided.
 *
 * Expected defaultRoster() values (derived from AGENT_ROLE_CATALOG):
 *   defaultRoster(["development", "marketing"]) → ["brand_voice", "builder", "content", "growth", "qa_engineer"] (5 roles)
 *   defaultRoster(["development", "product"])   → ["builder", "product_manager", "qa_engineer"] (3 roles)
 *   defaultRoster(["design"])                   → ["designer"] (1 role)
 *
 * @lore AE2: These are red-phase tests. They fail until the implementation in
 * /write-code phase rewrites POST /api/teams to call defaultRoster(), stores
 * teams.functions as JSON, and seeds a welcome message when userId is provided.
 */

import { factorySettings, messages, teamMembers, teams, threads, users } from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import { defaultRoster } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-AE2";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit: verify defaultRoster() returns the expected roles (sanity check)
// ─────────────────────────────────────────────────────────────────────────────

describe("defaultRoster() sanity checks", () => {
	test("defaultRoster(['development', 'marketing']) returns 5 roles sorted", () => {
		const result = defaultRoster(["development", "marketing"]);
		expect([...result].sort()).toEqual([
			"brand_voice",
			"builder",
			"content",
			"growth",
			"qa_engineer",
		]);
	});

	test("defaultRoster(['development', 'product']) returns 3 roles sorted", () => {
		const result = defaultRoster(["development", "product"]);
		expect([...result].sort()).toEqual(["builder", "product_manager", "qa_engineer"]);
	});

	test("defaultRoster(['design']) returns 1 role", () => {
		const result = defaultRoster(["design"]);
		expect([...result]).toEqual(["designer"]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: POST /api/teams creates agents using defaultRoster()
// ─────────────────────────────────────────────────────────────────────────────

// AK6: These tests verify the Fabric Strategy preserves defaultRoster() behavior.
// The roster expansion (multi-agent per functions) lives in Fabric, not Kernel.
// minimalStrategy (fixture default) creates 1 agent; fabricStrategy creates the full roster.
describe("AC-1: POST /api/teams with functions creates agents via defaultRoster()", () => {
	beforeEach(() => {
		setActiveStrategy(fabricStrategy);
	});
	afterEach(() => {
		clearActiveStrategy();
	});

	// AC-1a: development + marketing → 5 agents matching defaultRoster output
	test("POST with functions=['development','marketing'] creates 5 agents with correct roles", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Dev Marketing Team",
				functions: ["development", "marketing"],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamMembersId = body.teamMembers.id;

		// Fetch the agents created for this team
		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		const roles = agents.map((a) => a.role).sort();

		// defaultRoster(["development", "marketing"]) = ["brand_voice", "builder", "content", "growth", "qa_engineer"]
		expect(roles).toEqual(["brand_voice", "builder", "content", "growth", "qa_engineer"]);

		vi.unstubAllEnvs();
	});

	// AC-1b: development + product → 3 agents matching defaultRoster output
	test("POST with functions=['development','product'] creates 3 agents with correct roles", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Dev Product Team",
				functions: ["development", "product"],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamMembersId = body.teamMembers.id;

		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		const roles = agents.map((a) => a.role).sort();

		// defaultRoster(["development", "product"]) = ["builder", "product_manager", "qa_engineer"]
		expect(roles).toEqual(["builder", "product_manager", "qa_engineer"]);

		vi.unstubAllEnvs();
	});

	// AC-1c: design only → 1 agent
	test("POST with functions=['design'] creates 1 agent with role 'designer'", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Design Team", functions: ["design"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));
		const roles = agents.map((a) => a.role).sort();

		expect(roles).toEqual(["designer"]);

		vi.unstubAllEnvs();
	});

	// AC-1d: no functions → backward compat default ["development", "product"] = 3 agents
	test("POST without functions defaults to ['development','product'] roster (backward compat)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Legacy Team" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));

		// Default = ["development", "product"] → builder, product_manager, qa_engineer
		expect(agents.length).toBe(3);
		const roles = agents.map((a) => a.role).sort();
		expect(roles).toEqual(["builder", "product_manager", "qa_engineer"]);

		vi.unstubAllEnvs();
	});

	// AC-1e: agents have agentCategory = "team"
	test("All created agents have agentCategory = 'team'", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Category Test Team",
				functions: ["development", "product"],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));

		for (const agent of agents) {
			expect(agent.agentCategory).toBe("team");
		}

		vi.unstubAllEnvs();
	});

	// AC-1f: agents with templates have non-null systemPrompt
	test("Agents for roles with hasTemplate=true get non-null systemPrompt when template seeded", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Seed a system template for the builder role
		await db
			.insert(factorySettings)
			.values({
				key: "system_template:builder",
				value: "You are a builder agent. You write code.",
				updatedAt: NOW,
			})
			.onConflictDoNothing();

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Template Test Team", functions: ["development"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));

		const builderAgent = agents.find((a) => a.role === "builder");
		expect(builderAgent).toBeDefined();
		expect(builderAgent?.systemPrompt).not.toBeNull();
		expect(builderAgent?.systemPrompt).toBe("You are a builder agent. You write code.");

		vi.unstubAllEnvs();
	});

	// AC-1g: teams.functions column stores the JSON array
	test("teams.functions column stores the selected functions as JSON", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Functions Column Test",
				functions: ["development", "marketing"],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };

		const [teamRow] = await db.select().from(teams).where(eq(teams.id, body.team.id)).limit(1);

		expect(teamRow).toBeDefined();
		// functions column should store JSON array
		const parsedFunctions = JSON.parse(teamRow?.functions ?? "null") as string[];
		expect(parsedFunctions).toEqual(["development", "marketing"]);

		vi.unstubAllEnvs();
	});

	// AC-1h: zero-agent edge case — unknown functions returns 400 or empty roster error
	test("POST with functions that produce zero agents is rejected", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Use an unknown function name that produces no catalog matches
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Empty Roster Team", functions: ["nonexistent_function"] }),
		});

		// Should return 400 (validation error) when roster is empty
		expect(res.status).toBe(400);

		vi.unstubAllEnvs();
	});

	// AC-1i: response is still 201 and shape is preserved
	test("POST /api/teams still returns 201 with team and teamMembers shape", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Shape Check Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			team: { id: string; name: string; phase: string };
			teamMembers: { id: string };
		};

		expect(body.team.id).toMatch(/^team-/);
		expect(body.team.name).toBe("Shape Check Team");
		expect(body.team.phase).toBe("build");
		expect(body.teamMembers.id).toBeDefined();

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Welcome message seeded in assistant thread when userId is provided
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: Welcome message seeded when userId is provided", () => {
	// AC-4a: welcome message is seeded in the assistant thread
	test("POST with userId seeds a welcome message in the assistant thread", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create the human user first
		const userId = `user-ae2-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: userId,
			kind: "human",
			name: "Alice",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Alice Team",
				functions: ["development", "product"],
				userId,
			}),
		});

		expect(res.status).toBe(201);

		// Check the assistant thread was created
		const threadId = `thr-ast-${userId}`;
		const threadRows = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(threadRows.length).toBe(1);

		// Check a welcome message exists in that thread
		const messageRows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(messageRows.length).toBeGreaterThan(0);

		vi.unstubAllEnvs();
	});

	// AC-4b: welcome message senderId is ast-{userId}
	test("Welcome message senderId is ast-{userId}", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = `user-ae2-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: userId,
			kind: "human",
			name: "Bob",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		// Also create the assistant agent expected as sender
		const assistantId = `ast-${userId}`;
		await db.insert(users).values({
			id: assistantId,
			kind: "ai",
			name: "Bob's Assistant",
			role: "assistant",
			status: "active",
			createdAt: NOW,
		});

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Bob Team",
				functions: ["development", "product"],
				userId,
			}),
		});

		expect(res.status).toBe(201);

		const threadId = `thr-ast-${userId}`;
		const messageRows = await db.select().from(messages).where(eq(messages.threadId, threadId));

		expect(messageRows.length).toBeGreaterThan(0);
		expect(messageRows[0]?.senderId).toBe(`ast-${userId}`);

		vi.unstubAllEnvs();
	});

	// AC-4c: welcome message text contains agent names
	test("Welcome message payload text contains created agent names", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = `user-ae2-${crypto.randomUUID()}`;
		await db.insert(users).values({
			id: userId,
			kind: "human",
			name: "Carol",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		// Create the assistant agent
		const assistantId = `ast-${userId}`;
		await db.insert(users).values({
			id: assistantId,
			kind: "ai",
			name: "Carol's Assistant",
			role: "assistant",
			status: "active",
			createdAt: NOW,
		});

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Carol Team",
				functions: ["development", "product"],
				userId,
			}),
		});

		expect(res.status).toBe(201);

		const threadId = `thr-ast-${userId}`;
		const messageRows = await db.select().from(messages).where(eq(messages.threadId, threadId));

		expect(messageRows.length).toBeGreaterThan(0);
		const payload = JSON.parse(messageRows[0]?.payload ?? "{}") as { text?: string };
		// The welcome message should mention agents (at minimum, contains the team name or agents)
		expect(typeof payload.text).toBe("string");
		expect(payload.text?.length).toBeGreaterThan(0);
		// Should contain some reference to agents (e.g., "Builder", "Product Manager", or count "3 agents")
		const text = payload.text ?? "";
		const hasAgentInfo = /builder|product.?manager|qa.?engineer|\d+ agent/i.test(text);
		expect(hasAgentInfo).toBe(true);

		vi.unstubAllEnvs();
	});

	// AC-4d: no welcome message when userId is NOT provided (best-effort)
	test("POST without userId does not error — welcome message is skipped gracefully", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "No User Team", functions: ["development", "product"] }),
		});

		// Must still succeed (welcome message is best-effort)
		expect(res.status).toBe(201);

		vi.unstubAllEnvs();
	});

	// AC-4e: invalid userId does not crash the team creation
	test("POST with non-existent userId does not crash team creation", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Bad User Team",
				functions: ["development", "product"],
				userId: "user-does-not-exist",
			}),
		});

		// Team creation must succeed even if welcome message seeding fails (FK violation on thread)
		// The architecture says welcome message is best-effort
		expect(res.status).toBe(201);

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Backward compatibility — existing tests must not break
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: Backward compatibility — POST /api/teams without functions", () => {
	test("POST with only name still creates team and returns 201", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Compat Team" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team?: { id: string; name: string } };
		expect(body.team?.id).toMatch(/^team-/);
		expect(body.team?.name).toBe("Compat Team");

		vi.unstubAllEnvs();
	});

	test("POST with empty name still returns 400", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "   " }),
		});

		expect(res.status).toBe(400);

		vi.unstubAllEnvs();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: GET /api/teams/:id roster reflects created agents
// ─────────────────────────────────────────────────────────────────────────────

// AK6: Roster shape test requires Fabric (multi-role expansion).
describe("AC-1: GET /api/teams/:id roster after function-based creation", () => {
	beforeEach(() => {
		setActiveStrategy(fabricStrategy);
	});
	afterEach(() => {
		clearActiveStrategy();
	});

	test("GET /api/teams/:id roster has correct roles after POST with functions", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create team
		const createRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Roster Verify Team",
				functions: ["development", "product"],
			}),
		});
		expect(createRes.status).toBe(201);
		const { team } = (await createRes.json()) as { team: { id: string } };

		// We also need the teamMembers row — insert it was done by POST
		const tmRows = await db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.teamId, team.id))
			.limit(1);
		expect(tmRows.length).toBe(1);

		// GET team detail
		const getRes = await app.request(`/api/teams/${team.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);

		const detail = (await getRes.json()) as {
			roster: Array<{ role: string }>;
		};
		const rosterRoles = detail.roster.map((m) => m.role).sort();

		// defaultRoster(["development", "product"]) = ["builder", "product_manager", "qa_engineer"]
		expect(rosterRoles).toEqual(["builder", "product_manager", "qa_engineer"]);

		vi.unstubAllEnvs();
	});
});
