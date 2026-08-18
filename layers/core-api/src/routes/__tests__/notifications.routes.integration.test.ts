/**
 * V1 — Route integration tests for notifications endpoints.
 *
 * GET   /api/notifications           — resource descriptor
 * GET   /api/notifications/config    — get config
 * PATCH /api/notifications/config    — update config
 * POST  /api/notifications/test      — test notification send
 *
 * @lore AU43: GET /queue, POST /flush, POST /digest deleted — those routes were
 * removed when getDailyDigest was convicted as demo-only (batch notifications.md
 * rows 1, 8, 9). Tests for the surviving routes are preserved below.
 */

import { createTestDb } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-notifications";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("notifications routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("notifications auth", () => {
		test("returns 401 without auth header on GET /api/notifications", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/notifications", () => {
		test("returns 200 with resource descriptor", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("notifications");
		});
	});

	describe("GET /api/notifications/config", () => {
		test("returns 200 with redacted config", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; primaryChannel: string };
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.primaryChannel).toBe("string");
		});
	});

	describe("PATCH /api/notifications/config", () => {
		test("returns 200 with updated config", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ enabled: true, primaryChannel: "console" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; primaryChannel: string };
			expect(body.enabled).toBe(true);
			expect(body.primaryChannel).toBe("console");
		});

		test("returns 400 on invalid field values (e.g., bad email)", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ recipientEmail: "not-an-email@@bad" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 with extra/unknown fields (strict schema)", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ unknownField: "value" }),
			});
			expect(res.status).toBe(400);
		});

		test("redacts secrets in response (smtpPassword, ntfyAuthToken)", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ smtpPassword: "secret-password" }),
			});
			expect(res.status).toBe(200);
			const raw = await res.text();
			// The plaintext password must not appear in the response
			expect(raw).not.toContain("secret-password");
		});
	});

	describe("POST /api/notifications/test", () => {
		test("returns 200 with send result on valid test", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			// Configure console channel first
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					enabled: true,
					primaryChannel: "console",
					testMaxPerHour: 100,
				}),
			});

			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ channel: "console" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; channel: string };
			expect(body.ok).toBe(true);
			expect(body.channel).toBe("console");
		});

		test("returns 400 when recipient not configured for channel", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			// Configure with ntfy channel but no recipient
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					enabled: true,
					primaryChannel: "ntfy",
					testMaxPerHour: 100,
				}),
			});

			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ channel: "ntfy" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 429 when rate limit exceeded", async () => {
			// This test needs its own isolated DB + app with testMaxPerHour=0 from start
			const handle = await createTestDb();
			const freshDb = handle.db;
			const freshEventBus = new EventBus();

			try {
				vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
				const limitApp = await createTestApp({ db: freshDb, eventBus: freshEventBus });

				// Set testMaxPerHour=0 so capacity=0, first request should return 429
				await limitApp.request("/api/notifications/config", {
					method: "PATCH",
					headers: authHeaders(),
					body: JSON.stringify({ testMaxPerHour: 0 }),
				});

				const res = await limitApp.request("/api/notifications/test", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({}),
				});
				expect(res.status).toBe(429);
			} finally {
				await handle.close();
			}
		});
	});
});
