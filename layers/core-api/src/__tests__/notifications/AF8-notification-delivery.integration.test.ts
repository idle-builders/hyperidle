/**
 * AF8 — Notification delivery integration tests
 *
 * @lore AU44 batch 4: AC1 (drain loop), AC5 (stuck lease recovery) deleted
 * along with the dispatcher, drain, and lease machinery. FakeAdapter removed
 * (adapter abstraction deleted). AC2, AC3, AC9, AC10 updated.
 *
 * Covers:
 *   AC2  — notification event → queued row with typeKey, urgency, thread-keyed sourceLink
 *   AC3  — dep-watcher auto_unblock event does NOT create a notification row
 *   AC9  — muting a type suppresses enqueue
 *   AC10 — popover API: GET /notifications/inbox, POST /seen, POST /:id/read
 */

import { type HyperIdleDb, items as itemsTable, notificationQueue, threads } from "@hyperidle/db";
import type { NotificationEvent } from "@hyperidle/event-bus";
import { enqueue, installNotifications, updatePreferences } from "@hyperidle/notifications";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../__testing__/test-fixtures.js";
import { notificationsDeps } from "../notifications-test-deps.js";

// Helper: all rows for test assertions (bypasses the reduced public filter set)
async function allRows(db: HyperIdleDb) {
	return db.select().from(notificationQueue);
}

// --- AC2: notification event → queued row with typeKey, urgency, thread-keyed sourceLink ---

describe("AF8 AC2 — notification event produces typed, source-linked row", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-AF8");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("policy-engine push notification → row with typeKey=review_request and thread-keyed sourceLink", async ({
		db,
		eventBus,
	}) => {
		const threadId = "thread-af8-ac2";
		const itemId = "item-af8-ac2";

		// Seed thread and item
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-af8",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: "2026-06-11T00:00:00.000Z",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		await db.insert(itemsTable).values({
			id: itemId,
			kind: "review",
			title: "Needs review",
			body: "Please review",
			blocking: false,
			riskTier: "high",
			threadId,
			createdAt: "2026-06-11T00:00:00.000Z",
		});

		const dispose = installNotifications(db, eventBus, notificationsDeps);

		const event: NotificationEvent = {
			type: "notification",
			streamId: "s1",
			targetId: itemId,
			kind: "attention",
			message: `Item ${itemId} requires attention`,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const rows = await allRows(db);
			expect(rows.length).toBeGreaterThan(0);
		});

		dispose();

		const rows = await allRows(db);
		expect(rows.length).toBeGreaterThan(0);
		const row = rows[0]!;

		// AC2: typeKey must be review_request
		expect(row.typeKey).toBe("review_request");
		// AC2: sourceLink must be /conversations/<threadId>
		expect(row.sourceLink).toBe(`/conversations/${threadId}`);
		// urgency must be set
		expect(["immediate", "ambient"]).toContain(row.urgency);
	});
});

// --- AC3: auto_unblock does NOT create a notification ---

describe("AF8 AC3 — auto_unblock event is filtered out (ambient, not a notification)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-AF8");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("notification event with kind=auto_unblock produces NO notification_queue row", async ({
		db,
		eventBus,
	}) => {
		const dispose = installNotifications(db, eventBus, notificationsDeps);

		const event: NotificationEvent = {
			type: "notification",
			streamId: "s2",
			targetId: "task-123",
			kind: "auto_unblock",
			message: "Task auto-transitioned to accepted: all dependencies are done",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));
		dispose();

		const rows = await allRows(db);
		expect(rows).toHaveLength(0);
	});
});

// --- AC9: muting a type suppresses enqueue ---

describe("AF8 AC9 — muting a type suppresses notification enqueue", () => {
	test("review_request notifications are not enqueued when type is muted", async ({
		db,
		eventBus,
	}) => {
		const threadId = "thread-af8-ac9";
		const itemId = "item-af8-ac9";

		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-af8-mute",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: "2026-06-11T00:00:00.000Z",
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		await db.insert(itemsTable).values({
			id: itemId,
			kind: "review",
			title: "Muted review",
			body: "Should not be enqueued",
			blocking: false,
			riskTier: "high",
			threadId,
			createdAt: "2026-06-11T00:00:00.000Z",
		});

		await updatePreferences(db, "review_request", true, notificationsDeps);

		const dispose = installNotifications(db, eventBus, notificationsDeps);

		const event: NotificationEvent = {
			type: "notification",
			streamId: "s9",
			targetId: itemId,
			kind: "attention",
			message: `Item ${itemId} requires attention`,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));
		dispose();

		const rows = await allRows(db);
		expect(rows).toHaveLength(0);
	});
});

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

	test("installNotifications returns a disposer that stops the listener", async ({
		db,
		eventBus,
	}) => {
		const dispose = installNotifications(db, eventBus, notificationsDeps);
		expect(typeof dispose).toBe("function");
		dispose(); // should not throw
	});
});
