/**
 * P2: Users endpoint tests (renamed from agents.test.ts).
 *
 * @lore P2: /api/agents → /api/users. agents table → users table.
 * All endpoint behaviors preserved.
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-users";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	// Seed product and team
	await db.insert(teams).values({
		id: "prod-1",
		name: "Test Product",
		phase: "build",
		createdAt: NOW,
	});

	await db.insert(teamMembers).values({
		id: "team-1",
		teamId: "prod-1",
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});

	// Seed AI users (formerly agents).
	// AF11: agent-1 is kind='human' so auth middleware resolves it as the principal.
	// GET /api/users/:id/inbox is principal-self only (AC5 AF11); the resolved
	// principal must match the inbox owner. All seedBase tests resolve principal = "agent-1".
	await db.insert(users).values([
		{
			id: "agent-1",
			kind: "human",
			name: "Builder Bot",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: NOW,
		},
		{
			id: "agent-2",
			kind: "ai",
			name: "Growth Bot",
			role: "growth",
			status: "active",
			teamId: "team-1",
			createdAt: NOW,
		},
	]);
}

describe("User Endpoints /api/users (E6 — renamed from agents)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC1: GET /api/users — list all with status, team, role.
	// @lore AU26 J1: the `activeSessions` count is gone (see
	// `AU26-J1-run-read-deletions.integration.test.ts`) — the run count was a raw
	// `sessions` read serving a consumer typed `{id,name,role,teamId}`.
	describe("AC1: GET /api/users — list all users", () => {
		test("returns all users with their identity fields", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(2);
			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("teamId");
			expect(body[0]).toHaveProperty("role");
		});

		test("returns 401 without auth", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/users");
			expect(res.status).toBe(401);
		});
	});

	// AC2: GET /api/users/:id — user detail
	describe("AC2: GET /api/users/:id — user detail", () => {
		test("returns the user identity", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/agent-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe("agent-1");
			expect(body.name).toBe("Builder Bot");
		});

		test("returns 404 for unknown user", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("NOT_FOUND");
		});
	});
});
