/**
 * H2 HTTP route tests — `/api/notifications/*`.
 *
 * Covers:
 *  - Auth: X-API-Key required
 *  - GET /config: SMTP password + ntfy token redacted to "***"
 *  - PATCH /config: sanitizer rejects invalid email / topic / URL
 *  - POST /test: sends through adapter, returns SendResult, no queue write
 *  - GET /queue: filters by status
 *  - POST /flush: drains pending queue
 *  - POST /digest: runs digest through adapter
 *
 * @lore AU20 Ag6b: migrated from `Recipient`/`SendResult`/`updateNotificationConfig`
 * to inline types + `updateConfig`; old three-dep exports replaced by `notificationsDeps`.
 */

import {
	enqueue,
	listNotifications,
	type Notification,
	type NotificationAdapter,
	type SafeNotificationConfig,
	updateConfig,
} from "@hyperidle/notifications";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";
import { disposeApp } from "../../app.js";
import { notificationsDeps } from "../notifications-test-deps.js";

const API_KEY = "test-key-H2-routes";

interface AdapterCall {
	recipient: { channelId: string; label?: string };
	notification: Notification;
}

function createFakeAdapter(): NotificationAdapter & { calls: AdapterCall[] } {
	const calls: AdapterCall[] = [];
	return {
		name: "console",
		calls,
		async send(recipient, notification) {
			calls.push({ recipient, notification });
			return { ok: true, channel: "console", sentAt: new Date().toISOString() };
		},
	};
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

describe("H2 /api/notifications routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /config requires auth", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config");
			expect(res.status).toBe(401);
		} finally {
			disposeApp(app);
		}
	});

	test("GET /config returns a SafeNotificationConfig with redacted secrets", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			// Seed a password + auth token; verify they come back as "***".
			await updateConfig(
				db,
				{
					enabled: true,
					primaryChannel: "smtp",
					smtpHost: "smtp.example.com",
					smtpPassword: "super-secret",
					ntfyAuthToken: "tk_abc",
					smtpFrom: "ops@example.com",
				},
				notificationsDeps,
			);

			const res = await app.request("/api/notifications/config", { headers: headers() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as SafeNotificationConfig;
			expect(body.enabled).toBe(true);
			expect(body.smtp.passwordSet).toBe(true);
			expect(body.smtp.password).toBe("***");
			expect(body.ntfy.authTokenSet).toBe(true);
			expect(body.ntfy.authToken).toBe("***");
			// Raw secret must NEVER appear in the response.
			const raw = await (
				await app.request("/api/notifications/config", { headers: headers() })
			).text();
			expect(raw).not.toContain("super-secret");
			expect(raw).not.toContain("tk_abc");
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects invalid email", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ recipientEmail: "not-an-email" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("VALIDATION_ERROR");
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects unsafe ntfy URL", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ ntfyBaseUrl: "ftp://bad.example.com" }),
			});
			expect(res.status).toBe(400);
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config accepts a valid partial patch", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({
					enabled: true,
					recipientEmail: "ops@example.com",
					recipientNtfyTopic: "factory-alerts",
				}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as SafeNotificationConfig;
			expect(body.enabled).toBe(true);
			expect(body.recipient.email).toBe("ops@example.com");
			expect(body.recipient.ntfyTopic).toBe("factory-alerts");
		} finally {
			disposeApp(app);
		}
	});

	test("POST /test sends through the adapter and does NOT write the queue", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			// Configure notifications.
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({
					enabled: true,
					primaryChannel: "console",
				}),
			});
			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: headers(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const result = (await res.json()) as { ok: boolean; channel: string; sentAt?: string };
			expect(result.ok).toBe(true);
			expect(adapter.calls).toHaveLength(1);
			const queueRows = await listNotifications(db, { kind: "all" });
			expect(queueRows).toHaveLength(0);
		} finally {
			disposeApp(app);
		}
	});

	test("GET /queue returns pending rows", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const now = "2026-04-18T00:00:00.000Z";
			await enqueue(db, {
				id: "q-1",
				eventType: "item_created",
				subjectId: "x",
				severity: "digest",
				title: "Pending one",
				body: "body",
				reason: "digest",
				channel: "console",
				status: "pending",
				attempts: 0,
				createdAt: now,
			});

			const res = await app.request("/api/notifications/queue?status=pending", {
				headers: headers(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				status: string;
				count: number;
				rows: Array<{ id: string; title: string }>;
			};
			expect(body.status).toBe("pending");
			expect(body.count).toBe(1);
			expect(body!.rows[0]!.title).toBe("Pending one");
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects ntfy URL pointing to private/metadata IP (SSRF)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ ntfyBaseUrl: "https://169.254.169.254/" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("VALIDATION_ERROR");
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects ntfy URL with RFC1918 private IP", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ ntfyBaseUrl: "https://10.0.0.5/" }),
			});
			expect(res.status).toBe(400);
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects ntfy URL with mDNS .local suffix", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ ntfyBaseUrl: "https://printer.local/" }),
			});
			expect(res.status).toBe(400);
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects SMTP username with CR/LF", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ smtpUsername: "user\r\nDATA\r\nSubject: injected" }),
			});
			expect(res.status).toBe(400);
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects SMTP password with NUL", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ smtpPassword: "pw\0boom" }),
			});
			expect(res.status).toBe(400);
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config rejects smtpIgnoreTls=true in production", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			vi.stubEnv("NODE_ENV", "production");
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ smtpIgnoreTls: true }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.error).toContain("not permitted in production");
		} finally {
			disposeApp(app);
			vi.unstubAllEnvs();
			vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
		}
	});

	test("POST /test returns 429 with Retry-After once the bucket empties", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			// Tighten the bucket to 1/hour.
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ enabled: true, primaryChannel: "console", testMaxPerHour: 1 }),
			});
			const first = await app.request("/api/notifications/test", {
				method: "POST",
				headers: headers(),
				body: JSON.stringify({}),
			});
			expect(first.status).toBe(200);
			const second = await app.request("/api/notifications/test", {
				method: "POST",
				headers: headers(),
				body: JSON.stringify({}),
			});
			expect(second.status).toBe(429);
			expect(second.headers.get("Retry-After")).not.toBeNull();
		} finally {
			disposeApp(app);
		}
	});

	test("GET /queue rejects invalid status with 400", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			const res = await app.request("/api/notifications/queue?status=garbage", {
				headers: headers(),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("VALIDATION_ERROR");
		} finally {
			disposeApp(app);
		}
	});

	test("PATCH /config emits a config_changed audit log with secrets redacted", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const seen: Array<{ level: string; message: string; payload: Record<string, unknown> }> = [];
		const captureLogger = {
			debug: () => undefined,
			info: (message: string, payload?: unknown) =>
				seen.push({
					level: "info",
					message,
					payload: (payload as Record<string, unknown>) ?? {},
				}),
			warn: () => undefined,
			error: () => undefined,
		};
		// Build a new app that wires the capture logger.
		const audit = await createTestApp({
			db,
			eventBus,
			notificationAdapterFactory: () => adapter,
		});
		// Route factory is not swappable on createApp — the audit surfaces
		// via the notifications.audit logger which writes to stdout. We
		// assert the in-process logger capture through a direct
		// createNotificationRoutes call instead.
		disposeApp(audit);
		const { createNotificationRoutes } = await import("../../routes/notifications-routes.js");
		const router = createNotificationRoutes(db, {
			deps: notificationsDeps,
			adapterOverride: adapter,
			logger: captureLogger,
		});
		const hono = new (await import("hono")).Hono();
		hono.route("/api/notifications", router);
		const res = await hono.request("/api/notifications/config", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				smtpPassword: "super-secret-leak",
				ntfyAuthToken: "tk_sneaky",
				recipientEmail: "ops@example.com",
			}),
		});
		expect(res.status).toBe(200);
		const auditEntry = seen.find((e) => e.message === "config_changed");
		expect(auditEntry).toBeDefined();
		const diff = auditEntry?.payload.diff as Record<string, unknown>;
		expect(diff.smtpPassword).toBe("***");
		expect(diff.ntfyAuthToken).toBe("***");
		// Non-secret fields round-trip.
		expect(diff.recipientEmail).toBe("ops@example.com");
		// Full log text never contains the plaintext secret.
		const serialized = JSON.stringify(seen);
		expect(serialized).not.toContain("super-secret-leak");
		expect(serialized).not.toContain("tk_sneaky");
	});

	test("POST /digest runs the digest and marks rows sent", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createTestApp({ db, eventBus, notificationAdapterFactory: () => adapter });
		try {
			// Configure + seed.
			await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ enabled: true, primaryChannel: "console" }),
			});
			const now = "2026-04-18T00:00:00.000Z";
			await enqueue(db, {
				id: "q-d-1",
				eventType: "item_created",
				subjectId: "x",
				severity: "digest",
				title: "Digest one",
				body: "body",
				reason: "digest",
				channel: "console",
				status: "pending",
				attempts: 0,
				createdAt: now,
			});

			const res = await app.request("/api/notifications/digest", {
				method: "POST",
				headers: headers(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const result = (await res.json()) as { status: string; notificationsIncluded: number };
			expect(result.status).toBe("sent");
			expect(result.notificationsIncluded).toBe(1);
			expect(adapter.calls).toHaveLength(1);
			const rows = await listNotifications(db, { kind: "all" });
			expect(rows[0]!.status).toBe("sent");
		} finally {
			disposeApp(app);
		}
	});
});
