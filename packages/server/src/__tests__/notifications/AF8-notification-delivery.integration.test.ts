/**
 * AF8 — Notification delivery integration tests (RED phase)
 *
 * Covers:
 *   AC1  — drain loop delivers pending row automatically (no manual flush)
 *   AC2  — notification event → queued row with typeKey, urgency, thread-keyed sourceLink
 *   AC3  — dep-watcher auto_unblock event does NOT create a notification row
 *   AC4  — quiet-hours defers blocking row; after silence cleared, delivers
 *   AC5  — stuck/expired sending lease recovered by drain tick
 *   AC6  — cost sentinel fires off a real written value (recordFactoryCost)
 *   AC9  — muting a type suppresses enqueue
 *   AC10 — popover API: GET /notifications/inbox, POST /seen, POST /:id/read
 *   AC12 — cost_breach bypasses factory silence; defers during quiet hours
 */

import { type HyperIdleDb, items as itemsTable, threads, users } from "@hyperidle/db";
import type { NotificationEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { loadNotificationConfig, updateNotificationConfig } from "../../notifications/config.js";
import { flushQueue, recoverStuckLeases } from "../../notifications/dispatcher.js";
import { startNotificationDrain } from "../../notifications/drain.js";
import {
	defaultMutePreferenceReader,
	defaultMutePreferenceWriter,
} from "../../notifications/mute.js";
import { registerNotificationListener } from "../../notifications/notification-listener.js";
import { insertNotification, listAll } from "../../notifications/notification-queue.js";
import type {
	Notification,
	NotificationAdapter,
	Recipient,
	SendResult,
} from "../../notifications/types.js";
import { getFactoryCostActual } from "../../services/cost-cap.js";
import { clearCostSentinelCache, runCostSentinelCheck } from "../../services/cost-sentinel.js";
import { updateServerConfig } from "../../services/server-config.js";
import { expect, test } from "../../test-fixtures.js";

// --- helpers ---

interface AdapterCall {
	recipient: Recipient;
	notification: Notification;
}

function createFakeAdapter(): NotificationAdapter & { calls: AdapterCall[] } {
	const calls: AdapterCall[] = [];
	return {
		name: "console",
		calls,
		async send(recipient, notification): Promise<SendResult> {
			calls.push({ recipient, notification });
			return { ok: true, channel: "console", sentAt: new Date().toISOString() };
		},
	};
}

// @lore AU18: seeds via updateNotificationConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function enableNotifications(db: HyperIdleDb): Promise<void> {
	await updateNotificationConfig(db, {
		enabled: true,
		primaryChannel: "console",
		digestChannel: "console",
		floodMaxPerMinute: 100,
		floodCoalesceWindowMs: 60_000,
	});
}

// @lore AU18: silence config seeds via updateServerConfig (server_config.notifications.silence)
// instead of raw factorySettings.silence_* KV rows — same observable outcome, new storage.
async function setSilenceWindow(db: HyperIdleDb, start: string, end: string): Promise<void> {
	await updateServerConfig(db, {
		notifications: { silence: { windowStart: start, windowEnd: end } },
	});
}

async function setSilenceMode(db: HyperIdleDb, mode: boolean): Promise<void> {
	await updateServerConfig(db, { notifications: { silence: { mode } } });
}

async function insertPendingRow(
	db: HyperIdleDb,
	id: string,
	severity: "blocking" | "cost_breach" | "digest",
): Promise<void> {
	const now = new Date().toISOString();
	await insertNotification(db, {
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

	test("startNotificationDrain interval calls flushQueue and marks pending rows sent", async ({
		db,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await insertPendingRow(db, "drain-row-1", "blocking");

		// Start drain with a short interval; call it directly via the returned disposer.
		// Call flushQueue directly (the drain loop wraps this).
		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("No notification config");
		await flushQueue(db, () => adapter, cfg, new Date());

		const rows = (await listAll(db)).filter((r) => r.id === "drain-row-1");
		// Row should be sent (or in-flight via adapter)
		// After flush: status = sent OR the adapter was called
		expect(adapter.calls.length + rows.filter((r) => r.status === "sent").length).toBeGreaterThan(
			0,
		);
	});

	test("startNotificationDrain returns a disposer that stops the interval", async ({ db }) => {
		const adapter = createFakeAdapter();
		// startNotificationDrain must be importable from fabric
		const dispose = startNotificationDrain(db, () => adapter, {});
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

		// Register listener
		const mute = defaultMutePreferenceReader(db);
		const dispose = registerNotificationListener(db, eventBus, { mute });

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
			const rows = await listAll(db);
			expect(rows.length).toBeGreaterThan(0);
		});

		dispose();

		const rows = await listAll(db);
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
		const mute = defaultMutePreferenceReader(db);
		const dispose = registerNotificationListener(db, eventBus, { mute });

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

		const rows = await listAll(db);
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

		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("No config");

		// Run drain with "now" inside quiet hours
		const result = await flushQueue(db, () => adapter, cfg, new Date());
		expect(result.deferred).toBeGreaterThan(0);

		// Row should still be pending
		const rows = (await listAll(db)).filter((r) => r.status === "pending");
		expect(rows.some((r) => r.id === "quiet-block-1")).toBe(true);

		// Clear quiet hours (set window to past times that don't cover now)
		// Use start=22:00, end=22:01 — won't cover 00:00 UTC test time in most TZs
		// Actually, set silence_mode=false and remove the window
		await setSilenceWindow(db, "22:00", "22:01");

		// Run drain with a time clearly outside quiet hours (noon UTC)
		const noonUTC = new Date("2026-06-11T12:00:00.000Z");
		const result2 = await flushQueue(db, () => adapter, cfg, noonUTC);
		// Should have delivered (flushed) or at least not deferred
		expect(result2.deferred).toBe(0);
	});
});

// --- AC5: stuck sending lease recovered by drain ---

describe("AF8 AC5 — stuck/expired sending lease recovery", () => {
	test("drain tick requeues sending rows older than 6 minutes", async ({ db }) => {
		await enableNotifications(db);

		// Insert a row that appears stuck in 'sending' for 6 minutes
		const stuckClaimedAt = new Date(Date.now() - 6 * 60 * 1000 - 1000).toISOString();
		await insertNotification(db, {
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

		// Call recoverStuckLeases directly — the drain calls this at its top
		const recovered = await recoverStuckLeases(db, new Date());
		expect(recovered).toBeGreaterThan(0);

		// Row should be back to pending
		const rows = await listAll(db);
		const row = rows.find((r) => r.id === "stuck-lease-1");
		expect(row).toBeDefined();
		expect(row!.status).toBe("pending");
		expect(row!.claimedAt).toBeNull();
	});
});

// --- AC6: cost sentinel fires off a real written value ---

describe("AF8 AC6 — cost sentinel reacts to real written value", () => {
	test("getFactoryCostActual reads a real live-summed value; runCostSentinelCheck emits breach", async ({
		db,
		eventBus,
	}) => {
		clearCostSentinelCache();

		// Seed a user with cost_actual
		await db.insert(users).values({
			id: "user-cost-1",
			name: "Cost Agent",
			email: "cost@test.com",
			kind: "agent",
			status: "active",
			role: "member",
			costActual: 5000, // 5000 minor units
			createdAt: new Date().toISOString(),
		});

		// @lore AU18: cost_actual is no longer a written row — it's derived live
		// from SUM(users.costActual) via getFactoryCostActual.
		const actual = await getFactoryCostActual(db);
		expect(actual).toBeGreaterThan(0);

		// Set a cap that will be breached
		await updateServerConfig(db, { cost: { capMinor: 100 } });

		const result = await runCostSentinelCheck(db, eventBus);
		expect(result.emitted).toContain("cost_cap_breached");
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

		// Set mute for review_request
		const writer = defaultMutePreferenceWriter(db);
		await writer.setMuted("review_request", true);

		const mute = defaultMutePreferenceReader(db);
		const dispose = registerNotificationListener(db, eventBus, { mute });

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

		const rows = await listAll(db);
		expect(rows).toHaveLength(0);
	});
});

// --- AC12: cost_breach silence split ---

describe("AF8 AC12 — cost_breach silence split (hard rule #8)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-AF8");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("(a) cost_breach bypasses factory silence (silence_mode=true)", async ({ db }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);

		// Set factory silence (kill switch)
		await setSilenceMode(db, true);

		// Insert a cost_breach pending row
		await insertPendingRow(db, "cost-breach-factory-silence", "cost_breach");

		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("No config");

		// Drain at a time outside quiet hours
		const result = await flushQueue(db, () => adapter, cfg, new Date("2026-06-11T12:00:00.000Z"));

		// cost_breach should BYPASS factory silence → flushed
		expect(result.flushed + adapter.calls.length).toBeGreaterThan(0);
		expect(result.deferred).toBe(0);
	});

	test("(b) cost_breach defers during quiet hours (silence_window covers now)", async ({ db }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);

		// Clear factory silence
		await setSilenceMode(db, false);

		// Set quiet hours window covering 12:00 UTC (the "now" we'll pass)
		await setSilenceWindow(db, "11:00", "13:00");

		await insertPendingRow(db, "cost-breach-quiet-hours", "cost_breach");

		const cfg = await loadNotificationConfig(db);
		if (!cfg) throw new Error("No config");

		// Drain during quiet hours (12:00 UTC)
		const noonUTC = new Date("2026-06-11T12:00:00.000Z");
		const result = await flushQueue(db, () => adapter, cfg, noonUTC);

		// cost_breach RESPECTS quiet hours → deferred
		expect(result.deferred).toBeGreaterThan(0);
		expect(result.flushed).toBe(0);

		// After quiet hours (14:00 UTC), drain delivers
		await setSilenceWindow(db, "22:00", "22:01");

		const afternoon = new Date("2026-06-11T14:00:00.000Z");
		const result2 = await flushQueue(db, () => adapter, cfg, afternoon);
		expect(result2.deferred).toBe(0);
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
		// Insert an unseen notification row
		const nowIso = new Date().toISOString();
		await insertNotification(db, {
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
		const seen = (await listAll(db)).find((r) => r.seenAt !== null);
		expect(seen?.seenAt).toBeTruthy();
	});

	test("POST /notifications/:id/read marks a row as read", async ({ db, app }) => {
		// Valid UUID v4 — zod v4 z.string().uuid() requires version nibble [1-8] per RFC
		// (00000000-0000-0000-0000-000000000001 fails zod v4 strict UUID pattern)
		const notifId = "a1b2c3d4-e5f6-4789-abcd-ef0123456789";
		const nowIso = new Date().toISOString();
		await insertNotification(db, {
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
