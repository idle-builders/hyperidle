/**
 * Primary harness persists as team default; every creation path consumes it.
 *
 * Integration test — real DB/app.
 * - Persist + first roster: onboarding with primaryHarness → teams row carries default + agents use it
 * - Add-agent-later inherits: POST /:teamId/agents with no harness body → inherits team default
 * - Unset default → builtin fallback on scaffold AND add-agent
 */

import { teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-AV1";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("primary harness persisted as team default", () => {
	test("persist + first roster: primaryHarness stored on teams row + scaffolded agents use it", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Claude Team",
				functions: ["development"],
				primaryHarness: {
					harnessType: "claude-code",
					modelId: "claude-haiku-4-5",
					modelProvider: "anthropic",
				},
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;
		const teamMembersId = body.teamMembers.id;

		// (a) teams row carries the default
		const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		expect(teamRow?.defaultHarnessType).toBe("claude-code");
		expect(teamRow?.defaultModelId).toBe("claude-haiku-4-5");
		expect(teamRow?.defaultModelProvider).toBe("anthropic");

		// (b) scaffolded agents report the chosen harnessType
		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			expect(agent.harnessType).toBe("claude-code");
		}

		vi.unstubAllEnvs();
	});

	test("add-agent-later inherits the persisted team default (not builtin)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create team with primaryHarness
		const createRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Inherit Team",
				functions: ["development"],
				primaryHarness: {
					harnessType: "claude-code",
					modelId: "claude-haiku-4-5",
					modelProvider: "anthropic",
				},
			}),
		});
		expect(createRes.status).toBe(201);
		const createBody = (await createRes.json()) as { team: { id: string } };
		const teamId = createBody.team.id;

		// Add agent later — no harness in body
		const addRes = await app.request(`/api/teams/${teamId}/agents`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ role: "designer" }),
		});
		expect(addRes.status).toBe(201);
		const addBody = (await addRes.json()) as { agentId: string };

		// Assert new agent inherits the persisted team default, NOT builtin
		const [newAgent] = await db.select().from(users).where(eq(users.id, addBody.agentId)).limit(1);
		expect(newAgent?.harnessType).toBe("claude-code");
		expect(newAgent?.modelId).toBe("claude-haiku-4-5");

		vi.unstubAllEnvs();
	});

	test("unset default: teams.defaultHarnessType is null AND scaffolded agents fall back to builtin", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create team with NO primaryHarness
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Default Team",
				functions: ["development"],
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const teamId = body.team.id;
		const teamMembersId = body.teamMembers.id;

		// teams.defaultHarnessType is null
		const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		expect(teamRow?.defaultHarnessType).toBeNull();

		// Scaffolded agents fall back to builtin/claude-sonnet-4-6
		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			expect(agent.harnessType).toBe("builtin");
			expect(agent.modelId).toBe("claude-sonnet-4-6");
		}

		// Add-agent-later also falls back to builtin
		const addRes = await app.request(`/api/teams/${teamId}/agents`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ role: "designer" }),
		});
		expect(addRes.status).toBe(201);
		const addBody = (await addRes.json()) as { agentId: string };
		const [newAgent] = await db.select().from(users).where(eq(users.id, addBody.agentId)).limit(1);
		expect(newAgent?.harnessType).toBe("builtin");
		expect(newAgent?.modelId).toBe("claude-sonnet-4-6");

		vi.unstubAllEnvs();
	});

	test("assistant stub carries a non-null harnessType equal to the persisted team default", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Create user first
		const userRes = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Tester" }),
		});
		expect(userRes.status).toBe(201);
		const userBody = (await userRes.json()) as { user: { id: string } };
		const userId = userBody.user.id;

		// Create team with primaryHarness + userId to trigger assistant stub creation
		const teamRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Ready Team",
				functions: ["development"],
				userId,
				primaryHarness: {
					harnessType: "claude-code",
					modelId: "claude-haiku-4-5",
					modelProvider: "anthropic",
				},
			}),
		});
		expect(teamRes.status).toBe(201);

		// The assistant stub row has id = `ast-${userId}`
		const assistantId = `ast-${userId}`;
		const [assistantRow] = await db.select().from(users).where(eq(users.id, assistantId)).limit(1);

		// Assert it carries a non-null harnessType
		expect(assistantRow).toBeDefined();
		expect(assistantRow?.harnessType).not.toBeNull();
		expect(assistantRow?.harnessType).toBe("claude-code");

		vi.unstubAllEnvs();
	});
});
