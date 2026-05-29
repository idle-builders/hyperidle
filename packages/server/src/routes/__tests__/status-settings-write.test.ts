/**
 * I2 — V5: PATCH /api/status/settings must reject keys that begin with
 * blocked prefixes (`git_export.`, `notifications.`, `observability.`).
 * Those domains have dedicated routes that handle redaction and
 * structured config — letting the generic settings PATCH bypass them
 * was the I1-H1 escape hatch on the read side, now closed on the write.
 *
 * Red phase: today's PATCH happily upserts any key, including
 * `notifications.smtp_password`. Both the response status and the
 * underlying row would become wrong.
 */

import { createTestDb, factorySettings, type HyperIdleDb, type TestDbHandle } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-status-write";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("I2 V5 — PATCH /api/status/settings blocks reserved-prefix keys", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		app = await createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	const BLOCKED_KEYS = [
		"notifications.smtp_password",
		"notifications.ntfy_auth_token",
		"git_export.repo_path",
		"git_export.token",
	];

	for (const key of BLOCKED_KEYS) {
		it(`returns 400 with VALIDATION_ERROR when key='${key}'`, async () => {
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ key, value: "leaked" }),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { code?: string; error?: string };
			expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
			// Error message should mention the dedicated route guidance.
			expect(typeof body.error).toBe("string");

			// And the row must NOT be present in factorySettings.
			const [row] = await db.select().from(factorySettings).where(eq(factorySettings.key, key));
			expect(row).toBeUndefined();
		});
	}

	it("still accepts non-reserved keys (e.g. factory_start_time)", async () => {
		const res = await app.request("/api/status/settings", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ key: "factory_start_time", value: "2026-04-18T00:00:00.000Z" }),
		});
		expect(res.status).toBe(200);
		const [row] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "factory_start_time"));
		expect(row?.value).toBe("2026-04-18T00:00:00.000Z");
	});
});
