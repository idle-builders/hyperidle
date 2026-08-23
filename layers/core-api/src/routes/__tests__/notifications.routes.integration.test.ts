/**
 * V1 — Route integration tests for notifications endpoints.
 *
 * GET   /api/notifications/config    — get config
 * PATCH /api/notifications/config    — update config
 * POST  /api/notifications/test      — test notification send
 *
 * @lore AU43: GET /queue, POST /flush, POST /digest deleted — those routes were
 * removed when getDailyDigest was convicted as demo-only (batch notifications.md
 * rows 1, 8, 9). Tests for the surviving routes are preserved below.
 *
 * @lore AU44 batch 4: primaryChannel, digestChannel, ntfy, testMaxPerHour, rate
 * limiter deleted. patchConfigSchema is now SMTP-only + strict. POST /test accepts
 * empty body {} (no channel param); rate-limit (429) test deleted.
 */

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

	// GET /api/notifications root (door #129) deleted. Tests removed with the route.

	describe("GET /api/notifications/config", () => {
		test("returns 200 with redacted config (enabled + smtp fields)", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; smtp: { host: string | null } };
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.smtp).toBe("object");
		});
	});

	describe("PATCH /api/notifications/config", () => {
		test("returns 200 with updated config", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ enabled: true }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean };
			expect(body.enabled).toBe(true);
		});

		test("returns 400 on invalid field values (e.g., removed recipientEmail)", async ({
			db,
			eventBus,
		}) => {
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

		test("redacts secrets in response (smtpPassword)", async ({ db, eventBus }) => {
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
		test("returns 400 when SMTP is not configured (no host/from — recipient not configured)", async ({
			db,
			eventBus,
		}) => {
			// @lore AU44 batch 4: deliver() returns "recipient not configured" when no SMTP
			// host/from is set → route returns 400. Tests without SMTP config always get 400.
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when channel param is sent (removed — strict schema)", async ({
			db,
			eventBus,
		}) => {
			const app = await createTestApp({ db, eventBus });
			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ channel: "console" }),
			});
			expect(res.status).toBe(400);
		});
	});
});
