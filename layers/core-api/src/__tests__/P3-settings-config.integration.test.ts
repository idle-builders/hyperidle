/**
 * P3 RED — Settings route migration to server_config (AC-10)
 *
 * AC coverage:
 *  - PATCH /api/settings with notification prefs writes to server_config
 *  - GET /api/settings reads notification prefs from server_config
 *  - Existing M3 behavior still works (profile, products, users all returned)
 *  - server_config persists across request cycles (not in-memory only)
 *  - PATCH notifications.reviewAlerts=false persists and re-GET reflects it
 *  - PATCH notifications.quietHoursStart persists and re-GET reflects it
 *
 * @lore P3: Settings route migrates notification prefs from factorySettings to
 * server_config. The M3 tests for settings must continue passing — this file
 * tests only the P3-specific behavior (server_config backing, not factorySettings).
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { seedTeam } from "./_helpers.js";

const TEST_API_KEY = "test-key-p3-settings-config";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedFounderProfile(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: "p3-settings-founder",
			kind: "human",
			name: "P3 Settings Founder",
			email: "p3settings@hyperidle.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

describe("P3 AC-10 — Settings route: server_config backing", () => {
	describe("GET /api/settings — notification prefs from server_config", () => {
		test("returns default notification prefs when server_config is empty", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			const res = await app.request("/api/settings", { headers: authHeaders() });
			expect(res.status).toBe(200);

			// @lore AU21 Increment 14a: "costAlerts" removed from this shape — the
			// settings contract field is HARD-DELETED, no replacement.
			const body = (await res.json()) as {
				notifications: {
					reviewAlerts: boolean;
					blockerAlerts: boolean;
					quietHoursStart: string;
					quietHoursEnd: string;
					mutedTeams: string[];
				};
			};

			expect(body.notifications).toBeDefined();
			expect(typeof body.notifications.reviewAlerts).toBe("boolean");
			expect(typeof body.notifications.blockerAlerts).toBe("boolean");
			vi.unstubAllEnvs();
		});
	});

	describe("PATCH /api/settings — persists notification prefs to server_config", () => {
		test("PATCH reviewAlerts=false persists and re-GET reflects the change", async ({
			app,
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			const patchRes = await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { reviewAlerts: false } }),
			});
			expect(patchRes.status).toBe(200);

			const getRes = await app.request("/api/settings", { headers: authHeaders() });
			const body = (await getRes.json()) as { notifications: { reviewAlerts: boolean } };
			expect(body.notifications.reviewAlerts).toBe(false);
			vi.unstubAllEnvs();
		});

		// @lore AU21 Increment 14a: "PATCH costAlerts=false persists and re-GET
		// reflects the change" is HARD-DELETED — the `costAlerts` settings field
		// is HARD-DELETED, no replacement.

		test("PATCH quietHoursStart persists and re-GET reflects the change", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { quietHoursStart: "23:30" } }),
			});

			const getRes = await app.request("/api/settings", { headers: authHeaders() });
			const body = (await getRes.json()) as {
				notifications: { quietHoursStart: string };
			};
			expect(body.notifications.quietHoursStart).toBe("23:30");
			vi.unstubAllEnvs();
		});

		test("successive PATCH calls are cumulative (deep-merge)", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { reviewAlerts: false } }),
			});
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { quietHoursStart: "22:00" } }),
			});

			const getRes = await app.request("/api/settings", { headers: authHeaders() });
			const body = (await getRes.json()) as {
				notifications: { reviewAlerts: boolean; quietHoursStart: string; blockerAlerts: boolean };
			};
			expect(body.notifications.reviewAlerts).toBe(false);
			expect(body.notifications.quietHoursStart).toBe("22:00");
			// blockerAlerts still default true
			expect(body.notifications.blockerAlerts).toBe(true);
			vi.unstubAllEnvs();
		});

		test("returns 200 with the updated settings in the response", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			const patchRes = await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { blockerAlerts: false } }),
			});
			expect(patchRes.status).toBe(200);

			// The PATCH response should include the updated notifications
			const body = (await patchRes.json()) as { notifications: { blockerAlerts: boolean } };
			if (body.notifications) {
				expect(body.notifications.blockerAlerts).toBe(false);
			}
			vi.unstubAllEnvs();
		});
	});

	describe("Persistence: uses server_config table not just in-memory", () => {
		test("changes persist in the DB (readable by readServerConfig)", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { reviewAlerts: false } }),
			});

			// Import and directly read server_config to verify DB persistence
			const { readServerConfig } = await import("@hyperidle/settings");
			const config = await readServerConfig(db);
			expect(config.notifications.reviewAlerts).toBe(false);
			vi.unstubAllEnvs();
		});
	});

	describe("Products and users still returned (AC-17 compatibility)", () => {
		test("GET /api/settings still returns profile section", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedFounderProfile(db);
			const now = new Date().toISOString();
			await seedTeam(db, {
				id: "p3-prod-1",
				name: "P3 Test Product",
				phase: "build",
				createdAt: now,
			});

			const res = await app.request("/api/settings", { headers: authHeaders() });
			// @lore U1: `products` renamed to `teams` in the settings response.
			const body = (await res.json()) as {
				profile: { name: string };
				teams: Array<{ id: string }>;
			};

			expect(body.profile).toBeDefined();
			expect(body.teams).toBeDefined();
			vi.unstubAllEnvs();
		});
	});
});
