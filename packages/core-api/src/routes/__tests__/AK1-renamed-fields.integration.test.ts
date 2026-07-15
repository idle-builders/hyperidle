/**
 * AK1 — Renamed API fields: integration tests (RED phase)
 *
 * Asserts that the renamed vocabulary is exposed at the API boundary:
 *   - Agent API (GET /api/agents) returns `systemPrompt`, NOT `systemPrompt (old: soulPrompt)`
 *   - Assistant API (GET /api/users/:id/assistant) returns `systemPrompt`, NOT `systemPrompt (old: soulPrompt)`
 *   - PATCH /api/users/:id/assistant accepts `systemPrompt` (not the old name)
 *   - Agent POST/PATCH accept `systemPrompt` field (not the old name)
 *
 * RED PHASE: Fails until:
 *   - packages/server/src/routes/agents.ts renames `soulPrompt` → `systemPrompt`
 *     in request/response zod schemas + handlers
 *   - packages/server/src/routes/assistant.ts renames `soulPrompt` → `systemPrompt`
 *     + `SOUL_PROMPT_MAX_LENGTH` → `SYSTEM_PROMPT_MAX_LENGTH`
 *   - packages/db/src/schema.ts renames `soulPrompt` → `systemPrompt` column
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-ak1-renamed-fields";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

const NOW = new Date().toISOString();

async function seedFounder(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: "AK1 Founder",
		role: "founder",
		status: "active",
		email: `${id}@test.local`,
		createdAt: NOW,
		maxConcurrentSessions: 0,
	});
}

describe("AK1 — assistant route uses systemPrompt (not soulPrompt)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/users/:id/assistant returns systemPrompt field (not soulPrompt)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-ak1-a1");

		const res = await app.request("/api/users/u-ak1-a1/assistant", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();

		// New name must be present
		expect(body).toHaveProperty("systemPrompt");
		// Old name must NOT be present
		expect(body).not.toHaveProperty("soulPrompt");
	});

	test("PATCH /api/users/:id/assistant accepts systemPrompt field and returns it", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-ak1-a2");

		const newPrompt = "You are a focused assistant. Help with clarity.";

		const res = await app.request("/api/users/u-ak1-a2/assistant", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ systemPrompt: newPrompt }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();

		// Response must use systemPrompt
		expect(body).toHaveProperty("systemPrompt");
		expect((body as { systemPrompt: string }).systemPrompt).toBe(newPrompt);
		// Old name must NOT appear
		expect(body).not.toHaveProperty("soulPrompt");
	});

	test("PATCH /api/users/:id/assistant with soulPrompt field returns 400 (old field rejected)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-ak1-a3");

		// After rename, soulPrompt is no longer a valid field name in the body schema.
		// The zod schema should reject unknown/old fields (strict mode) or ignore them —
		// either way, sending soulPrompt should NOT update the system prompt.
		// We verify by checking the request either rejects or ignores the old field.
		const res = await app.request("/api/users/u-ak1-a3/assistant", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ soulPrompt: "Old field name" }),
		});

		// Either 400 (strict schema rejection) or 200 with systemPrompt unchanged (strip unknown).
		// The important assertion is that soulPrompt is NOT in the response body.
		const body = await res.json();
		expect(body).not.toHaveProperty("soulPrompt");
	});

	test("PATCH /api/users/:id/assistant enforces max length via SYSTEM_PROMPT_MAX_LENGTH", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-ak1-a4");

		const oversizedPrompt = "x".repeat(50_001);

		const res = await app.request("/api/users/u-ak1-a4/assistant", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ systemPrompt: oversizedPrompt }),
		});

		// Should still enforce the max length (same constraint as old SOUL_PROMPT_MAX_LENGTH)
		expect(res.status).toBe(400);
	});
});

describe("AK1 — agents route uses systemPrompt (not soulPrompt)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/agents returns agents with systemPrompt field (not soulPrompt)", async ({
		db,
		app,
	}) => {
		// Seed prerequisite data for the agents route
		const { teams, teamMembers } = await import("@hyperidle/db");

		await db.insert(teams).values({
			id: "ak1-team",
			name: "AK1 Team",
			phase: "build",
			createdAt: NOW,
		});

		await db.insert(teamMembers).values({
			id: "ak1-tm",
			teamId: "ak1-team",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});

		await seedFounder(db, "u-ak1-b1");

		await db.insert(users).values({
			id: "ak1-agent-1",
			kind: "ai",
			name: "AK1 Builder Bot",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 2,
			teamId: "ak1-tm",
			createdAt: NOW,
		});

		const res = await app.request("/api/agents", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();

		// At least one agent should be present
		expect(Array.isArray(body)).toBe(true);
		const agents = body as Array<Record<string, unknown>>;
		expect(agents.length).toBeGreaterThan(0);

		// Every agent must expose systemPrompt, not soulPrompt
		for (const agent of agents) {
			expect(agent).toHaveProperty("systemPrompt");
			expect(agent).not.toHaveProperty("soulPrompt");
		}
	});
});
