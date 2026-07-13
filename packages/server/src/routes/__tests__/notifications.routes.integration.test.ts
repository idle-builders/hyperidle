/**
 * V1 — Route integration tests for notifications endpoints.
 *
 * GET   /api/notifications           — resource descriptor
 * GET   /api/notifications/config    — get config
 * PATCH /api/notifications/config    — update config
 * GET   /api/notifications/queue     — list queue items
 * POST  /api/notifications/test      — test notification send
 * POST  /api/notifications/flush     — flush queue
 * POST  /api/notifications/digest    — dispatch digest
 */

import { createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createApp } from "../../app.js";
import type { NotificationConfig } from "@hyperidle/core-app";
import type { AdapterFactory } from "@hyperidle/core-app";
import type { Notification, NotificationAdapter } from "@hyperidle/core-app";
import { expect, test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-notifications";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function makeFakeAdapterFactory(): {
	factory: AdapterFactory;
	sends: Array<{ recipient: string; notification: Notification }>;
} {
	const sends: Array<{ recipient: string; notification: Notification }> = [];
	const factory: AdapterFactory = (_cfg: NotificationConfig): NotificationAdapter => ({
		name: "console",
		send: async (recipient, notification) => {
			sends.push({ recipient: recipient.channelId, notification });
			return {
				ok: true as const,
				channel: "console" as const,
				sentAt: new Date().toISOString(),
			};
		},
	});
	return { factory, sends };
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
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/notifications", () => {
		test("returns 200 with resource descriptor", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
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
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
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
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
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
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ recipientEmail: "not-an-email@@bad" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 with extra/unknown fields (strict schema)", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ unknownField: "value" }),
			});
			expect(res.status).toBe(400);
		});

		test("redacts secrets in response (smtpPassword, ntfyAuthToken)", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
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

	describe("GET /api/notifications/queue", () => {
		test("returns 200 with pending queue items", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/queue", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string; count: number; rows: unknown[] };
			expect(body.status).toBe("pending");
			expect(typeof body.count).toBe("number");
			expect(Array.isArray(body.rows)).toBe(true);
		});

		test("returns 200 with empty rows when queue is empty", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/queue", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { rows: unknown[] };
			expect(body.rows).toHaveLength(0);
		});

		test("returns 400 on invalid status param", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/queue?status=invalid_status_xyz", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("respects limit query param", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/queue?limit=10&status=sent", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		});
	});

	describe("POST /api/notifications/test", () => {
		test("returns 200 with send result on valid test", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
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
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
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
				const { factory: limitFactory } = makeFakeAdapterFactory();
				const limitApp = await createApp({
					db: freshDb,
					eventBus: freshEventBus,
					notificationAdapterFactory: limitFactory,
				});

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

	describe("POST /api/notifications/flush", () => {
		test("returns 200 with flush result", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/flush", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
		});

		test("returns flushed:0 reason:disabled when config not enabled", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			// Ensure disabled
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ enabled: false }),
			});

			const res = await app.request("/api/notifications/flush", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { flushed: number; reason?: string };
			expect(body.flushed).toBe(0);
			expect(body.reason).toBe("disabled");
		});
	});

	describe("POST /api/notifications/digest", () => {
		test("returns 200 with digest result", async ({ db, eventBus }) => {
			const { factory } = makeFakeAdapterFactory();
			const app = await createApp({ db, eventBus, notificationAdapterFactory: factory });
			const res = await app.request("/api/notifications/digest", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
		});
	});
});
