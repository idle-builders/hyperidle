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

import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import type {
	AdapterFactory,
	Notification,
	NotificationAdapter,
	NotificationConfig,
} from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

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
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		const { factory } = makeFakeAdapterFactory();
		app = await createTestApp({ db, eventBus, notificationAdapterFactory: factory });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("notifications auth", () => {
		it("returns 401 without auth header on GET /api/notifications", async () => {
			const res = await app.request("/api/notifications", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/notifications", () => {
		it("returns 200 with resource descriptor", async () => {
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
		it("returns 200 with redacted config", async () => {
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
		it("returns 200 with updated config", async () => {
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

		it("returns 400 on invalid field values (e.g., bad email)", async () => {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ recipientEmail: "not-an-email@@bad" }),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 with extra/unknown fields (strict schema)", async () => {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ unknownField: "value" }),
			});
			expect(res.status).toBe(400);
		});

		it("redacts secrets in response (smtpPassword, ntfyAuthToken)", async () => {
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
		it("returns 200 with pending queue items", async () => {
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

		it("returns 200 with empty rows when queue is empty", async () => {
			const res = await app.request("/api/notifications/queue", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { rows: unknown[] };
			expect(body.rows).toHaveLength(0);
		});

		it("returns 400 on invalid status param", async () => {
			const res = await app.request("/api/notifications/queue?status=invalid_status_xyz", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		it("respects limit query param", async () => {
			const res = await app.request("/api/notifications/queue?limit=10&status=sent", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		});
	});

	describe("POST /api/notifications/test", () => {
		it("returns 200 with send result on valid test", async () => {
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

		it("returns 400 when recipient not configured for channel", async () => {
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

		it("returns 429 when rate limit exceeded", async () => {
			// Set testMaxPerHour to 0 (disabled)
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ testMaxPerHour: 0 }),
			});

			// Create a new app instance with testMaxPerHour=0 to get fresh bucket
			const handle = await createTestDb();
			const freshDb = handle.db;
			await freshDb.insert((await import("@hyperidle/db")).factorySettings).values({
				key: "notifications.testMaxPerHour",
				value: "0",
				updatedAt: new Date().toISOString(),
			});

			// The rate limit test: with testMaxPerHour=0, any send should get 429
			// We need to exhaust the bucket first by sending requests
			// But since testMaxPerHour=0 means capacity=0, first request should return 429
			const { factory: limitFactory } = makeFakeAdapterFactory();
			const limitApp = await createTestApp({
				db: freshDb,
				eventBus: new EventBus(),
				notificationAdapterFactory: limitFactory,
			});
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			// Update config on fresh db
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
		});
	});

	describe("POST /api/notifications/flush", () => {
		it("returns 200 with flush result", async () => {
			const res = await app.request("/api/notifications/flush", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
		});

		it("returns flushed:0 reason:disabled when config not enabled", async () => {
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
		it("returns 200 with digest result", async () => {
			const res = await app.request("/api/notifications/digest", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
		});
	});
});
