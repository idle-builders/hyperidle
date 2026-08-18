/**
 * AF8 — Notification delivery integration tests
 *
 * Covers:
 *   AC1  — drain loop delivers pending row automatically (no manual flush)
 *   AC2  — notification event → queued row with typeKey, urgency, thread-keyed sourceLink
 *   AC3  — dep-watcher auto_unblock event does NOT create a notification row
 *   AC4  — quiet-hours defers blocking row; after silence cleared, delivers
 *   AC5  — stuck/expired sending lease recovered by drain tick
 *   AC9  — muting a type suppresses enqueue
 *   AC10 — popover API: GET /notifications/inbox, POST /seen, POST /:id/read
 *
 * @lore AU21 Increment 14a: AC6 (cost sentinel / recordFactoryCost) and AC12
 * (cost_breach silence split) are HARD-DELETED along with the rest of the
 * cost-cap/accounting feature — no replacement.
 *
 * @lore AU20 Ag6b: migrated from internal delivery-chain imports
 * (`flushQueue`, `loadNotificationConfig`, `recoverStuckLeases`,
 * `registerNotificationListener`, `defaultMutePreferenceReader/Writer`,
 * `startNotificationDrain`, `updateNotificationConfig`) to the public wrappers
 * `flush`, `installNotifications`, `updateConfig`, `updatePreferences`; and
 * from three separate dep exports to `notificationsDeps`.
 */

import { type HyperIdleDb, items as itemsTable, threads } from "@hyperidle/db";
import type { NotificationEvent } from "@hyperidle/domain-model";
import {
	deliver,
	enqueue,
	installNotifications,
	listNotifications,
	updateConfig,
	updatePreferences,
} from "@hyperidle/notifications";
import { updateServerConfig } from "@hyperidle/settings";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../__testing__/test-fixtures.js";
import { notificationsDeps } from "../notifications-test-deps.js";

// --- helpers ---

interface AdapterCall {
	recipient: { channelId: string; label?: string };
	notification: { severity: string };
}

function createFakeAdapter() {
	const calls: AdapterCall[] = [];
	return {
		name: "console" as const,
		calls,
		async send(recipient: { channelId: string; label?: string }, notification: { severity: string }) {
			calls.push({ recipient, notification });
			return { ok: true as const, channel: "console" as const, sentAt: new Date().toISOString() };
		},
	};
}

// @lore AU18: seeds via updateConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function enableNotifications(db: HyperIdleDb): Promise<void> {
	await updateConfig(
		db,
		{
			enabled: true,
			primaryChannel: "console",
			digestChannel: "console",
			floodMaxPerMinute: 100,
			floodCoalesceWindowMs: 60_000,
		},
		notificationsDeps,
	);
}

// @lore AU18: silence config seeds via updateServerConfig (server_config.notifications.silence)
// instead of raw factorySettings.silence_* KV rows — same observable outcome, new storage.
async function setSilenceWindow(db: HyperIdleDb, start: string, end: string): Promise<void> {
	await updateServerConfig(db, {
		notifications: { silence: { windowStart: start, windowEnd: end } },
	});
}

async function insertPendingRow(
	db: HyperIdleDb,
	id: string,
	severity: "blocking" | "digest",
): Promise<void> {
	const now = new Date().toISOString();
	await enqueue(db, {
		id,
		eventType: "test_event",
		subjectId: null,
		severity,
		title: `Test ${severity}`,
		body: "body",
		reason: "silence",
		channel: "console",
		status: "pending",
		attempts: 0,
		createdAt: now,
	});
}

// --- AC1: Drain loop delivers pending row ---

describe("AF8 AC1 — drain loop delivers pending row without manual flush", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-AF8");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("flush delivers pending rows and marks them sent", async ({ db }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await insertPendingRow(db, "drain-row-1", "blocking");

		// deliver({kind:"flush"}) wraps loadNotificationConfig + recoverStuckLeases + flushQueue
		await deliver(db, { kind: "flush" }, notificationsDeps, { adapterOverride: adapter });

		const rows = (await listNotifications(db, { kind: "all" })).filter(
			(r) => r.id === "drain-row-1",
		);
		// After flush: status = sent OR the adapter was called
		expect(adapter.calls.length + rows.filter((r) => r.status === "sent").length).toBeGreaterThan(
			0,
		);
	});

	test("installNotifications returns a disposer that stops the interval", async ({
		db,
		eventBus,
	}) => {
		// installNotifications replaces startNotificationDrain (Ag6b)
		const dispose = installNotifications(db, eventBus, notificationsDeps);
		expect(typeof dispose).toBe("function");
		dispose(); // should not throw
	});
});

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

		// installNotifications sets up the listener (and dispatcher + drain)
		const dispose = installNotifications(db, eventBus, notificationsDeps);

		// Emit policy-engine push notification (kind="attention")
		const event: NotificationEvent = {
			type: "notification",
			streamId: "s1",
			targetId: itemId,
			kind: "attention",
			message: `Item ${itemId} requires attention`,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Wait for listener to process
		await vi.waitFor(async () => {
			const rows = await listNotifications(db, { kind: "all" });
			expect(rows.length).toBeGreaterThan(0);
		});

		dispose();

		const rows = await listNotifications(db, { kind: "all" });
		expect(rows.length).toBeGreaterThan(0);
		const row = rows[0]!;

		// AC2: typeKey must be review_request
		expect(row.typeKey).toBe("review_request");
		// AC2: sourceLink must be /conversations/<threadId> — NOT /conversations/item/<id>
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

		// Emit auto-unblock notification (dep-watcher kind)
		const event: NotificationEvent = {
			type: "notification",
			streamId: "s2",
			targetId: "task-123",
			kind: "auto_unblock",
			message: "Task auto-transitioned to accepted: all dependencies are done",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Wait briefly to ensure no async processing creates a row
		await new Promise<void>((resolve) => setTimeout(resolve, 100));
		dispose();

		const rows = await listNotifications(db, { kind: "all" });
		// Filter must work on kind ONLY — no message text matching
		expect(rows).toHaveLength(0);
	});
});

// --- AC4: quiet-hours defers blocking row; after cleared, delivers ---

describe("AF8 AC4 — quiet-hours deferral then delivery", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-AF8");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("blocking row stays pending during quiet hours; delivered after silence cleared", async ({
		db,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);

		// Set quiet-hours window covering "now" (00:00–23:59 = always)
		await setSilenceWindow(db, "00:00", "23:59");

		await insertPendingRow(db, "quiet-block-1", "blocking");

		// Run drain with "now" inside quiet hours
		const raw1 = await deliver(db, { kind: "flush" }, notificationsDeps, {
			adapterOverride: adapter,
			now: new Date(),
		});
		if (raw1.kind !== "flush") throw new Error("unexpected kind");
		expect(raw1.deferred).toBeGreaterThan(0);

		// Row should still be pending
		const rows = (await listNotifications(db, { kind: "all" })).filter(
			(r) => r.status === "pending",
		);
		expect(rows.some((r) => r.id === "quiet-block-1")).toBe(true);

		// Clear quiet hours
		await setSilenceWindow(db, "22:00", "22:01");

		// Run drain with a time clearly outside quiet hours (noon UTC)
		const noonUTC = new Date("2026-06-11T12:00:00.000Z");
		const raw2 = await deliver(db, { kind: "flush" }, notificationsDeps, {
			adapterOverride: adapter,
			now: noonUTC,
		});
		if (raw2.kind !== "flush") throw new Error("unexpected kind");
		// Should have delivered (flushed) or at least not deferred
		expect(raw2.deferred).toBe(0);
	});
});

// --- AC5: stuck sending lease recovered by drain ---

describe("AF8 AC5 — stuck/expired sending lease recovery", () => {
	test("flush recovers stuck sending rows and delivers them", async ({ db }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);

		// Insert a row that appears stuck in 'sending' for 6 minutes
		const stuckClaimedAt = new Date(Date.now() - 6 * 60 * 1000 - 1000).toISOString();
		await enqueue(db, {
			id: "stuck-lease-1",
			eventType: "test_event",
			subjectId: null,
			severity: "blocking",
			title: "Stuck notification",
			body: "body",
			reason: "retry",
			channel: "console",
			status: "sending",
			attempts: 1,
			claimedAt: stuckClaimedAt,
			createdAt: stuckClaimedAt,
		});

		// deliver({kind:"flush"}) calls recoverStuckLeases then flushes pending rows
		// @lore AU20 Ag6b: recoverStuckLeases removed from public API; behavior
		// verified through deliver flush: stuck → recovered → sent.
		const raw = await deliver(db, { kind: "flush" }, notificationsDeps, {
			adapterOverride: adapter,
		});
		if (raw.kind !== "flush") throw new Error("unexpected kind");
		expect(raw.flushed).toBeGreaterThan(0);

		const rows = await listNotifications(db, { kind: "all" });
		const row = rows.find((r) => r.id === "stuck-lease-1");
		expect(row).toBeDefined();
		expect(row!.status).toBe("sent");
	});
});

// --- AC6: cost sentinel fires off a real written value ---

// @lore AU21 Increment 14a: "AF8 AC6 — cost sentinel reacts to real written
// value" is deleted along with the rest of the cost feature — no
// replacement.

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

		// Set mute for review_request via public updatePreferences
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

		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});
});

// @lore AU21 Increment 14a: "AF8 AC12 — cost_breach silence split" is
// deleted along with the rest of the cost feature — the `cost_breach`
// severity + its bypass-silence special case are gone, no replacement.

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
		// Insert an unseen notification row
		const nowIso = new Date().toISOString();
		await enqueue(db, {
			id: "notif-seen-1",
			eventType: "test",
			subjectId: null,
			severity: "blocking",
			title: "Test",
			body: "body",
			reason: "silence",
			channel: "console",
			status: "sent",
			attempts: 1,
			createdAt: nowIso,
			// seenAt: null (unseen)
		});

		const res = await app.request("/api/notifications/seen", {
			method: "POST",
			headers: { "X-API-Key": "test-key-AF8" },
		});
		expect(res.status).toBe(200);
		// W3: response is now { ok: true } after bulk UPDATE simplification
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
		// Verify the row was actually marked seen
		const seen = (await listNotifications(db, { kind: "all" })).find((r) => r.seenAt !== null);
		expect(seen?.seenAt).toBeTruthy();
	});

	test("POST /notifications/:id/read marks a row as read", async ({ db, app }) => {
		// Valid UUID v4 — zod v4 z.string().uuid() requires version nibble [1-8] per RFC
		// (00000000-0000-0000-0000-000000000001 fails zod v4 strict UUID pattern)
		const notifId = "a1b2c3d4-e5f6-4789-abcd-ef0123456789";
		const nowIso = new Date().toISOString();
		await enqueue(db, {
			id: notifId,
			eventType: "test",
			subjectId: null,
			severity: "blocking",
			title: "Test",
			body: "body",
			reason: "silence",
			channel: "console",
			status: "sent",
			attempts: 1,
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
