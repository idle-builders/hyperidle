import {
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	products,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-status";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Status & Settings Endpoints (E6)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed required data
		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
		db.insert(users)
			.values([
				{
					id: "agent-1",
					name: "Builder Bot",
					role: "builder",
					status: "idle",
					teamId: "team-1",
					costActual: 100,
					createdAt: new Date().toISOString(),
				},
				{
					id: "agent-2",
					name: "Growth Bot",
					role: "growth",
					status: "active",
					teamId: "team-1",
					costActual: 200,
					createdAt: new Date().toISOString(),
				},
			])
			.run();
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test",
				appetite: "small",
				status: "committed",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "Test Task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC12: GET /api/status — factory-wide status
	describe("AC12: GET /api/status — factory-wide status", () => {
		it("returns status with zero active sessions", async () => {
			const res = await app.request("/api/status", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.activeSessions).toBe(0);
			expect(body.totalCost).toBe(300);
			expect(body).toHaveProperty("agentStates");
			expect(body).toHaveProperty("uptime");

			const agentStates = body.agentStates as Record<string, number>;
			expect(agentStates.idle).toBe(1);
			expect(agentStates.active).toBe(1);
		});

		it("counts active sessions correctly", async () => {
			// Create active session
			db.insert(sessions)
				.values({
					id: "sess-1",
					agentId: "agent-1",
					taskId: "task-1",
					modelTier: "workhorse",
					startedAt: new Date().toISOString(),
					state: "active",
				})
				.run();
			// Create done session (should not count)
			db.insert(sessions)
				.values({
					id: "sess-2",
					agentId: "agent-2",
					taskId: "task-1",
					modelTier: "fast",
					startedAt: new Date().toISOString(),
					state: "done",
					endedAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request("/api/status", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.activeSessions).toBe(1);
		});

		it("uses factory_start_time from settings if available", async () => {
			const startTime = "2024-01-01T00:00:00.000Z";
			db.insert(factorySettings)
				.values({
					key: "factory_start_time",
					value: startTime,
					updatedAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request("/api/status", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.uptime).toBe(startTime);
		});
	});

	// AC13: GET /api/status/settings — factory settings
	describe("AC13: GET /api/status/settings — list settings", () => {
		it("returns empty array when no settings", async () => {
			const res = await app.request("/api/status/settings", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(0);
		});

		it("returns all settings", async () => {
			db.insert(factorySettings)
				.values([
					{ key: "cost_cap", value: "10000", updatedAt: new Date().toISOString() },
					{ key: "max_agents", value: "50", updatedAt: new Date().toISOString() },
				])
				.run();

			const res = await app.request("/api/status/settings", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(2);
		});
	});

	// AC14: PATCH /api/status/settings — update settings
	describe("AC14: PATCH /api/status/settings — update settings", () => {
		it("creates a new setting", async () => {
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ key: "cost_cap", value: "10000" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.key).toBe("cost_cap");
			expect(body.value).toBe("10000");
		});

		it("updates an existing setting (upsert)", async () => {
			// Create initial
			db.insert(factorySettings)
				.values({ key: "cost_cap", value: "10000", updatedAt: new Date().toISOString() })
				.run();

			// Update
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ key: "cost_cap", value: "20000" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.value).toBe("20000");

			// Verify only one row
			const allSettings = db.select().from(factorySettings).all();
			expect(allSettings).toHaveLength(1);
		});

		it("returns 400 for missing key", async () => {
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ value: "10000" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// ---------------- I1 security-H1: GET /settings redacts credentials ----------------
	describe("I1 security-H1: GET /api/status/settings redacts secret keys", () => {
		const SECRET_ROWS = [
			{ key: "notifications.smtp_password", value: "super-secret-pass" },
			{ key: "notifications.ntfy_auth_token", value: "tk_abc_private" },
		];
		const SAFE_ROW = { key: "cost_cap", value: "10000" };

		it("does not return raw secret values in the response body", async () => {
			const now = new Date().toISOString();
			db.insert(factorySettings)
				.values([...SECRET_ROWS, SAFE_ROW].map((r) => ({ ...r, updatedAt: now })))
				.run();

			const res = await app.request("/api/status/settings", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const bodyText = await res.text();

			// No raw secret value substring may appear in the payload.
			for (const row of SECRET_ROWS) {
				expect(bodyText).not.toContain(row.value);
			}
			// Non-secret settings round-trip unchanged.
			expect(bodyText).toContain("10000");

			// Every secret row must still be present, just with a redacted value.
			const body = JSON.parse(bodyText) as Array<{ key: string; value: string | null }>;
			for (const row of SECRET_ROWS) {
				const found = body.find((r) => r.key === row.key);
				expect(found).toBeDefined();
				expect(found?.value).not.toBe(row.value);
			}
		});

		// I2 V5 supersedes the I1 H-1 redact-on-PATCH behavior for namespaced
		// keys: PATCH on a `notifications.*` (or `git_export.*`,
		// `observability.*`) key is now rejected with 400 so the dedicated
		// domain routes remain the single source of truth. Redaction-on-echo
		// for unconstrained keys remains covered by the GET-side test above.
		it("PATCH on namespaced secret keys is blocked (I2 V5)", async () => {
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					key: "notifications.smtp_password",
					value: "another-secret",
				}),
			});
			expect(res.status).toBe(400);
		});
	});
});
