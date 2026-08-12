/**
 * M3 RED — Settings routes: GET /api/settings + PATCH /api/settings (Cluster B).
 *
 * These tests FAIL until:
 *  - createSettingsRoutes(db) is implemented in packages/server/src/routes/settings.ts
 *  - The route is mounted in app.ts at /api/settings
 *  - factorySettings are seeded with founder profile keys
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { seedTeam } from "./_helpers.js";

const TEST_API_KEY = "test-key-m3-settings";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * @lore P2: Profile now comes from `users WHERE kind='human'` instead of
 * factorySettings founder_name/email keys. Seed a human user for profile tests.
 */
async function seedFounderProfile(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: ids("founder"),
			kind: "human",
			name: "Test Founder",
			email: "test@hyperidle.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

describe("M3 — GET /api/settings (B1)", () => {
	test("returns 200 with profile, products, users, notifications", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const now = new Date().toISOString();
		await seedFounderProfile(db, ids);

		// Seed 2 products
		await seedTeam(db, {
			id: ids("team-1"),
			name: "Product Alpha",
			phase: "build",
			createdAt: now,
		});
		await seedTeam(db, {
			id: ids("team-2"),
			name: "Product Beta",
			phase: "archived",
			createdAt: now,
		});

		// Seed 2 AI users (formerly agents)
		await db.insert(users).values({
			id: ids("agent-1"),
			kind: "ai",
			name: "Builder Bot",
			role: "builder",
			status: "idle",
			createdAt: now,
		});

		await db.insert(users).values({
			id: ids("agent-2"),
			kind: "ai",
			name: "Reviewer Bot",
			role: "reviewer",
			status: "paused",
			createdAt: now,
		});

		const res = await app.request("/api/settings", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			profile: { name: string; email: string; avatarUrl: string | null };
			// @lore U1: `products` renamed to `teams` in the settings response.
			teams: Array<{ id: string; name: string; active: boolean }>;
			/** @lore P2: renamed from agents. Contains AI users only. */
			users: Array<{
				id: string;
				name: string;
				autonomyLevel: string;
				paused: boolean;
			}>;
			// @lore AU21 Increment 14a: "costAlerts" removed from this shape —
			// the settings contract field is HARD-DELETED, no replacement.
			notifications: {
				reviewAlerts: boolean;
				blockerAlerts: boolean;
			};
		};

		expect(body.profile.name).toBe("Test Founder");
		expect(body.profile.email).toBe("test@hyperidle.dev");
		expect(body.profile.avatarUrl).toBeNull();
		// P6: global list endpoint — assert my scoped rows are present
		const myTeamIds = new Set([ids("team-1"), ids("team-2")]);
		const myTeams = body.teams.filter((t) => myTeamIds.has(t.id));
		expect(myTeams).toHaveLength(2);
		const myUserIds = new Set([ids("agent-1"), ids("agent-2")]);
		const myUsers = body.users.filter((u) => myUserIds.has(u.id));
		expect(myUsers).toHaveLength(2);
		expect(body.notifications).toBeDefined();
		vi.unstubAllEnvs();
	});

	test("products include active flag derived from phase (archived=inactive)", async ({
		app,
		db,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const now = new Date().toISOString();
		await seedFounderProfile(db, ids);
		await seedTeam(db, {
			id: ids("team-1"),
			name: "Product Alpha",
			phase: "build",
			createdAt: now,
		});
		await seedTeam(db, {
			id: ids("team-2"),
			name: "Product Beta",
			phase: "archived",
			createdAt: now,
		});

		const res = await app.request("/api/settings", { headers: authHeaders() });
		// @lore U1: `products` renamed to `teams` in the settings response.
		const body = (await res.json()) as {
			teams: Array<{ id: string; active: boolean }>;
		};

		const prod1 = body.teams.find((p) => p.id === ids("team-1"));
		const prod2 = body.teams.find((p) => p.id === ids("team-2"));
		expect(prod1?.active).toBe(true); // phase "build" → active
		expect(prod2?.active).toBe(false); // phase "archived" → inactive
		vi.unstubAllEnvs();
	});

	test("users include paused flag derived from status", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const now = new Date().toISOString();
		await seedFounderProfile(db, ids);
		await db.insert(users).values({
			id: ids("agent-1"),
			kind: "ai",
			name: "Builder Bot",
			role: "builder",
			status: "idle",
			createdAt: now,
		});
		await db.insert(users).values({
			id: ids("agent-2"),
			kind: "ai",
			name: "Reviewer Bot",
			role: "reviewer",
			status: "paused",
			createdAt: now,
		});

		const res = await app.request("/api/settings", { headers: authHeaders() });
		const body = (await res.json()) as {
			users: Array<{ id: string; paused: boolean }>;
		};

		const agent1 = body.users.find((a) => a.id === ids("agent-1"));
		const agent2 = body.users.find((a) => a.id === ids("agent-2"));
		expect(agent1?.paused).toBe(false); // status "idle"
		expect(agent2?.paused).toBe(true); // status "paused"
		vi.unstubAllEnvs();
	});

	test("returns 401 without API key", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/settings");
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});

describe("M3 — PATCH /api/settings persists notification preferences (B1)", () => {
	test("PATCH with notifications.reviewAlerts=false persists and re-GET reflects change", async ({
		app,
		db,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderProfile(db, ids);
		// First PATCH
		const patchRes = await app.request("/api/settings", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				notifications: { reviewAlerts: false },
			}),
		});
		expect(patchRes.status).toBe(200);

		// Re-GET to verify persistence
		const getRes = await app.request("/api/settings", { headers: authHeaders() });
		const body = (await getRes.json()) as {
			notifications: { reviewAlerts: boolean };
		};
		expect(body.notifications.reviewAlerts).toBe(false);
		vi.unstubAllEnvs();
	});
});
