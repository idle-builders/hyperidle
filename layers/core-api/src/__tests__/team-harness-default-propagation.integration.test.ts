/**
 * Primary harness persists as team default; every creation path consumes it.
 *
 * Integration test — real DB/app.
 * - Persist + first roster: onboarding with primaryHarness → teams row carries default + agents use it
 * - Add-agent-later inherits: POST /:teamId/agents with no harness body → inherits team default
 * - Unset default → builtin fallback on scaffold AND add-agent
 */

import { agentRunConfig, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

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
		const teamMembersId = body.teamMembers.id;

		// scaffolded agents report the chosen harnessType
		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			const [config] = await db
				.select()
				.from(agentRunConfig)
				.where(eq(agentRunConfig.agentUserId, agent.id))
				.limit(1);
			expect(config?.harnessType).toBe("claude-code");
		}

		vi.unstubAllEnvs();
	});

	test("unset default: no team default AND scaffolded agents are assigned none", async ({
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
		const body = (await res.json()) as { teamMembers: { id: string } };
		const teamMembersId = body.teamMembers.id;

		// A team whose owner picked no harness assigns its agents none. The run
		// resolves it — the pool takes an available harness and that harness runs
		// its own default model — rather than a vendor name being written onto the
		// row and shown back as someone's configuration.
		const agents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			const [config] = await db
				.select()
				.from(agentRunConfig)
				.where(eq(agentRunConfig.agentUserId, agent.id))
				.limit(1);
			expect(config?.harnessType ?? null).toBeNull();
			expect(config?.modelId ?? null).toBeNull();
		}

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
		expect(assistantRow).toBeDefined();

		// @lore AU26 G1: the stub's harness lives in `agent_run_config` now.
		const [assistantConfig] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, assistantId))
			.limit(1);

		// Assert it carries a non-null harnessType
		expect(assistantConfig?.harnessType).not.toBeNull();
		expect(assistantConfig?.harnessType).toBe("claude-code");

		vi.unstubAllEnvs();
	});
});
