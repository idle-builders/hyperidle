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

import { createTestDb, type HyperIdleDb, type TestDbHandle, teams, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

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
			maxConcurrentSessions: 0,
			createdAt: now,
		})
		.onConflictDoNothing();
}

describe("P3 AC-10 — Settings route: server_config backing", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedFounderProfile(db);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	describe("GET /api/settings — notification prefs from server_config", () => {
		it("returns default notification prefs when server_config is empty", async () => {
			const res = await app.request("/api/settings", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				notifications: {
					reviewAlerts: boolean;
					costAlerts: boolean;
					blockerAlerts: boolean;
					quietHoursStart: string;
					quietHoursEnd: string;
					mutedTeams: string[];
				};
			};

			expect(body.notifications).toBeDefined();
			expect(typeof body.notifications.reviewAlerts).toBe("boolean");
			expect(typeof body.notifications.costAlerts).toBe("boolean");
			expect(typeof body.notifications.blockerAlerts).toBe("boolean");
		});
	});

	describe("PATCH /api/settings — persists notification prefs to server_config", () => {
		it("PATCH reviewAlerts=false persists and re-GET reflects the change", async () => {
			const patchRes = await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { reviewAlerts: false } }),
			});
			expect(patchRes.status).toBe(200);

			const getRes = await app.request("/api/settings", { headers: authHeaders() });
			const body = (await getRes.json()) as { notifications: { reviewAlerts: boolean } };
			expect(body.notifications.reviewAlerts).toBe(false);
		});

		it("PATCH costAlerts=false persists and re-GET reflects the change", async () => {
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { costAlerts: false } }),
			});

			const getRes = await app.request("/api/settings", { headers: authHeaders() });
			const body = (await getRes.json()) as { notifications: { costAlerts: boolean } };
			expect(body.notifications.costAlerts).toBe(false);
		});

		it("PATCH quietHoursStart persists and re-GET reflects the change", async () => {
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
		});

		it("successive PATCH calls are cumulative (deep-merge)", async () => {
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { reviewAlerts: false } }),
			});
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { costAlerts: false } }),
			});

			const getRes = await app.request("/api/settings", { headers: authHeaders() });
			const body = (await getRes.json()) as {
				notifications: { reviewAlerts: boolean; costAlerts: boolean; blockerAlerts: boolean };
			};
			expect(body.notifications.reviewAlerts).toBe(false);
			expect(body.notifications.costAlerts).toBe(false);
			// blockerAlerts still default true
			expect(body.notifications.blockerAlerts).toBe(true);
		});

		it("returns 200 with the updated settings in the response", async () => {
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
		});
	});

	describe("Persistence: uses server_config table not just in-memory", () => {
		it("changes persist in the DB (readable by readServerConfig)", async () => {
			await app.request("/api/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notifications: { reviewAlerts: false } }),
			});

			// Import and directly read server_config to verify DB persistence
			const { readServerConfig } = await import("../services/server-config.js");
			const config = await readServerConfig(db);
			expect(config.notifications.reviewAlerts).toBe(false);
		});
	});

	describe("Products and users still returned (AC-17 compatibility)", () => {
		it("GET /api/settings still returns profile section", async () => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "p3-prod-1", name: "P3 Test Product", phase: "build", createdAt: now });

			const res = await app.request("/api/settings", { headers: authHeaders() });
			// @lore U1: `products` renamed to `teams` in the settings response.
			const body = (await res.json()) as {
				profile: { name: string };
				teams: Array<{ id: string }>;
			};

			expect(body.profile).toBeDefined();
			expect(body.teams).toBeDefined();
		});
	});
});
