/**
 * AF15 RED — Org routes extension (AC-6): GET /api/org returns teams list.
 *
 * Tests that:
 * - GET /api/org now includes teams: {id, name}[] (teamMembers joined to teams.name)
 * - Only non-dissolved teamMembers rows are included
 * - PUT /api/org/edges with mechanism:"team" and a real teamMembers.id returns 201
 * - PUT /api/org/edges with mechanism:"function" and free-text target returns 201
 *   (the zero-dependency solo first-relationship path)
 *
 * @lore AF15: The teams list in GET /api/org uses teamMembers.id (not teams.id) as
 * the id — this is what the server validates for mechanism:"team" edges. The UI
 * shows teams.name but submits teamMembers.id.
 */

import { teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-af15-org";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AF15 AC-6 — GET /api/org includes teams list", () => {
	const NOW = new Date().toISOString();

	test("GET /api/org returns teams array alongside edges and users", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Seed team + teamMembers
		await db
			.insert(teams)
			.values({ id: "team-af15-1", name: "Alpha Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: "tm-af15-1",
			teamId: "team-af15-1",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: "u-human-af15",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			email: "founder@example.com",
			createdAt: NOW,
		});

		const res = await app.request("/api/org", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			edges: unknown[];
			users: unknown[];
			teams: { id: string; name: string }[];
		};
		expect(Array.isArray(body.teams)).toBe(true);
		expect(body.teams).toHaveLength(1);
		// id is teamMembers.id (what the edge target needs)
		expect(body.teams[0]).toMatchObject({ id: "tm-af15-1", name: "Alpha Team" });
		vi.unstubAllEnvs();
	});

	test("GET /api/org teams array excludes dissolved teamMembers rows", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const now = new Date().toISOString();
		const past = new Date(Date.now() - 1000).toISOString();
		await db
			.insert(teams)
			.values({ id: "team-active", name: "Active Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "tm-active",
			teamId: "team-active",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});
		await db
			.insert(teams)
			.values({ id: "team-dissolved", name: "Old Team", phase: "archived", createdAt: past });
		await db.insert(teamMembers).values({
			id: "tm-dissolved",
			teamId: "team-dissolved",
			capacity: 1,
			activeBets: 0,
			formedAt: past,
			dissolvedAt: past,
		});

		const res = await app.request("/api/org", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: { id: string }[] };
		const ids = body.teams.map((t) => t.id);
		expect(ids).toContain("tm-active");
		expect(ids).not.toContain("tm-dissolved");
		vi.unstubAllEnvs();
	});

	test("GET /api/org returns empty teams array when no teamMembers exist", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await db.insert(users).values({
			id: "u-human-notm",
			kind: "human",
			name: "Solo",
			role: "founder",
			status: "active",
			email: "solo@example.com",
			createdAt: NOW,
		});
		const res = await app.request("/api/org", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { teams: unknown[] };
		expect(Array.isArray(body.teams)).toBe(true);
		expect(body.teams).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("PUT /api/org/edges mechanism=team with teamMembers.id target returns 201", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await db
			.insert(teams)
			.values({ id: "team-af15-2", name: "Beta Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: "tm-af15-2",
			teamId: "team-af15-2",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: "u-human-af15b",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			email: "founder2@example.com",
			createdAt: NOW,
		});

		const res = await app.request("/api/org/edges", {
			method: "PUT",
			headers: authHeaders(),
			body: JSON.stringify({
				fromUserId: "u-human-af15b",
				mechanism: "team",
				target: "tm-af15-2", // teamMembers.id
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { mechanism: string; target: string };
		expect(body.mechanism).toBe("team");
		expect(body.target).toBe("tm-af15-2");
		vi.unstubAllEnvs();
	});

	test("PUT /api/org/edges mechanism=function with free-text target returns 201 (solo path)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await db.insert(users).values({
			id: "u-solo-af15",
			kind: "human",
			name: "Solo Founder",
			role: "founder",
			status: "active",
			email: "solo2@example.com",
			createdAt: NOW,
		});

		const res = await app.request("/api/org/edges", {
			method: "PUT",
			headers: authHeaders(),
			body: JSON.stringify({
				fromUserId: "u-solo-af15",
				mechanism: "function",
				target: "Engineering",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { mechanism: string; target: string };
		expect(body.mechanism).toBe("function");
		expect(body.target).toBe("Engineering");
		vi.unstubAllEnvs();
	});

	test("function edge round-trips: appears in GET /api/org after creation", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await db.insert(users).values({
			id: "u-solo-rt",
			kind: "human",
			name: "Solo Founder RT",
			role: "founder",
			status: "active",
			email: "solo-rt@example.com",
			createdAt: NOW,
		});

		await app.request("/api/org/edges", {
			method: "PUT",
			headers: authHeaders(),
			body: JSON.stringify({
				fromUserId: "u-solo-rt",
				mechanism: "function",
				target: "Design",
			}),
		});

		const res = await app.request("/api/org", { headers: authHeaders() });
		const body = (await res.json()) as {
			edges: { mechanism: string; target: string }[];
		};
		const edge = body.edges.find((e) => e.mechanism === "function" && e.target === "Design");
		expect(edge).toBeDefined();
		vi.unstubAllEnvs();
	});
});
