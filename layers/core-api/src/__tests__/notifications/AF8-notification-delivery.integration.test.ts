/**
 * AF8 — Notification delivery integration tests
 *
 * @lore AU44 batch 4: AC1 (drain loop), AC5 (stuck lease recovery) deleted
 * along with the dispatcher, drain, and lease machinery. FakeAdapter removed
 * (adapter abstraction deleted). AC2, AC3, AC9, AC10 updated.
 *
 * @lore BC3 architecture.md §5 B7: AC2 ("notification event → queued row"),
 * AC3 ("auto_unblock does NOT create a notification"), and AC9 ("muting
 * suppresses enqueue") are DELETED along with the notification listener
 * (`installNotifications`/`registerNotificationListener`) they exercised —
 * its only production trigger was the policy engine's "attention" event,
 * deleted with the `items` table (R2). AC10 survives unchanged: the popover
 * API reads/writes `notification_queue` directly via `enqueue`, never
 * through the listener.
 *
 * Covers:
 *   AC10 — popover API: GET /notifications/inbox, POST /seen, POST /:id/read
 */

import { type HyperIdleDb, notificationQueue } from "@hyperidle/db";
import { enqueue } from "@hyperidle/notifications";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../__testing__/test-fixtures.js";

// Helper: all rows for test assertions (bypasses the reduced public filter set)
async function allRows(db: HyperIdleDb) {
	return db.select().from(notificationQueue);
}

// --- AC10: Popover API ---

describe("AF8 AC10 — popover API routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-AF8");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /notifications/inbox returns unseenCount and rows", async ({ app }) => {
		const res = await app.request("/api/notifications/inbox", {
			headers: { "X-API-Key": "test-key-AF8" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { unseenCount: number; rows: unknown[] };
		expect(typeof body.unseenCount).toBe("number");
		expect(Array.isArray(body.rows)).toBe(true);
	});

	test("POST /notifications/seen marks all unseen rows as seen", async ({ db, app }) => {
		const nowIso = new Date().toISOString();
		await enqueue(db, {
			id: "notif-seen-1",
			eventType: "test",
			subjectId: null,
			severity: "blocking",
			title: "Test",
			body: "body",
			reason: "notification_event",
			channel: null,
			status: "pending",
			attempts: 0,
			createdAt: nowIso,
		});

		const res = await app.request("/api/notifications/seen", {
			method: "POST",
			headers: { "X-API-Key": "test-key-AF8" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);

		const rows = await allRows(db);
		const seen = rows.find((r) => r.seenAt !== null);
		expect(seen?.seenAt).toBeTruthy();
	});

	test("POST /notifications/:id/read marks a row as read", async ({ db, app }) => {
		const notifId = "a1b2c3d4-e5f6-4789-abcd-ef0123456789";
		const nowIso = new Date().toISOString();
		await enqueue(db, {
			id: notifId,
			eventType: "test",
			subjectId: null,
			severity: "blocking",
			title: "Test",
			body: "body",
			reason: "notification_event",
			channel: null,
			status: "pending",
			attempts: 0,
			createdAt: nowIso,
		});

		const res = await app.request(`/api/notifications/${notifId}/read`, {
			method: "POST",
			headers: { "X-API-Key": "test-key-AF8" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	test("GET /notifications/mute returns muted type keys", async ({ app }) => {
		const res = await app.request("/api/notifications/mute", {
			headers: { "X-API-Key": "test-key-AF8" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { muted: string[] };
		expect(Array.isArray(body.muted)).toBe(true);
	});

	test("PUT /notifications/mute/:key sets mute state", async ({ app }) => {
		const res = await app.request("/api/notifications/mute/review_request", {
			method: "PUT",
			headers: {
				"X-API-Key": "test-key-AF8",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ muted: true }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	test("PUT /notifications/mute/:key rejects unknown type keys", async ({ app }) => {
		const res = await app.request("/api/notifications/mute/unknown_type", {
			method: "PUT",
			headers: {
				"X-API-Key": "test-key-AF8",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ muted: true }),
		});
		expect(res.status).toBe(400);
	});
});
