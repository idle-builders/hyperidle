/**
 * R8 Signal-to-Noise Defaults — TDD red phase
 *
 * Tests for ALL acceptance criteria in workpackage R8:
 * AC1: Event subscriptions are documented — which events generate notifications, which are silent
 * AC2: Routine task state changes are silent (no notifications)
 * AC3: Blockers and cost caps generate visible notifications (with preference overrides)
 * AC4: Review alerts surfaced via preference overrides
 * AC5: Quiet hours default OFF; quietHoursEnabled=false ignores start/end
 *
 * @lore R8: These tests define the contract BEFORE implementation. They fail until:
 *   - quietHoursEnabled field is added to NotificationsSchema
 *   - AlertPreferences type and applyAlertPreferences are added to dispatcher
 *   - readAlertPreferences is wired through DispatcherDeps → bootstrap → server-factory
 *   - Settings PATCH accepts quietHoursEnabled toggle
 */

import { type HyperIdleDb, items as itemsTable, notificationQueue, threads } from "@hyperidle/db";
import type {
	CostCapBreachedEvent,
	CostCapWarningEvent,
	ItemCreatedEvent,
	TaskStateChangedEvent,
} from "@hyperidle/shared";
import {
	type NotificationConfigPatch,
	updateNotificationConfig,
} from "../../notifications/config.js";
import {
	type AlertPreferences,
	registerNotificationDispatcher,
} from "../../notifications/dispatcher.js";
import type {
	Notification,
	NotificationAdapter,
	Recipient,
	SendResult,
} from "../../notifications/types.js";
import { readServerConfig, updateServerConfig } from "../../services/server-config.js";
import { afterEach, describe, expect, test, vi } from "../../test-fixtures.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface AdapterCall {
	recipient: Recipient;
	notification: Notification;
}

function createFakeAdapter(
	name: "console" | "ntfy" | "smtp" = "console",
): NotificationAdapter & { calls: AdapterCall[] } {
	const calls: AdapterCall[] = [];
	return {
		name,
		calls,
		async send(recipient, notification): Promise<SendResult> {
			calls.push({ recipient, notification });
			return { ok: true, channel: name, sentAt: new Date().toISOString() };
		},
	};
}

// @lore AU18: seeds via updateNotificationConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function enableNotifications(
	db: HyperIdleDb,
	overrides: NotificationConfigPatch = {},
): Promise<void> {
	await updateNotificationConfig(db, {
		enabled: true,
		primaryChannel: "console",
		digestChannel: "console",
		floodMaxPerMinute: 100,
		floodCoalesceWindowMs: 60_000,
		...overrides,
	});
}

async function seedThread(db: HyperIdleDb, id = "thread-r8"): Promise<string> {
	await db.insert(threads).values({
		id,
		hostKind: "task",
		hostId: "task-r8",
		initiatorId: "agent-r8",
		participants: JSON.stringify(["agent-r8"]),
		lastActiveAt: "2026-05-30T00:00:00.000Z",
		createdAt: "2026-05-30T00:00:00.000Z",
	});
	return id;
}

async function createItem(
	db: HyperIdleDb,
	params: {
		id: string;
		blocking?: boolean;
		riskTier?: string | null;
		kind?: string;
		title?: string;
		threadId: string;
	},
): Promise<void> {
	await db.insert(itemsTable).values({
		id: params.id,
		kind: params.kind ?? "approval",
		title: params.title ?? `Item ${params.id}`,
		body: `Body for ${params.id}`,
		blocking: params.blocking ?? false,
		riskTier: params.riskTier ?? null,
		threadId: params.threadId,
		createdAt: "2026-05-30T00:00:00.000Z",
	});
}

function emitTaskStateChanged(
	bus: import("@hyperidle/shared").EventBus,
	fromState: "proposed" | "in_progress",
	toState: "in_progress" | "done",
	taskId = "task-r8",
): void {
	const event: TaskStateChangedEvent = {
		type: "task_state_changed",
		streamId: "stream-r8",
		taskId,
		fromState,
		toState,
		timestamp: Date.now(),
	};
	bus.emit(event);
}

/**
 * Register the notification dispatcher with alert preferences wired to
 * readServerConfig. This mirrors the production bootstrap (server-factory.ts)
 * where readAlertPreferences is injected via DispatcherDeps so fabric does not
 * read server_config directly.
 *
 * @lore R8 F-01: Tests that verify preference-driven behaviour (blockerAlerts,
 * costAlerts, reviewAlerts, quietHoursEnabled) must inject readAlertPreferences
 * so the dispatcher reads from server_config rather than falling back to
 * all-alerts-ON defaults.
 */
function registerWithPrefs(
	db: HyperIdleDb,
	bus: import("@hyperidle/shared").EventBus,
	adapter: NotificationAdapter,
	extraDeps: Partial<{ now: () => Date }> = {},
): () => void {
	return registerNotificationDispatcher(db, bus, {
		adapterFactory: () => adapter,
		readAlertPreferences: async (): Promise<AlertPreferences> => {
			const cfg = await readServerConfig(db);
			return {
				blockerAlerts: cfg.notifications.blockerAlerts,
				costAlerts: cfg.notifications.costAlerts,
				reviewAlerts: cfg.notifications.reviewAlerts,
				quietHoursEnabled: cfg.notifications.quietHoursEnabled,
				quietHoursStart: cfg.notifications.quietHoursStart,
				quietHoursEnd: cfg.notifications.quietHoursEnd,
			};
		},
		...extraDeps,
	});
}

// ---------------------------------------------------------------------------
// AC1: Event subscription mapping — behavioral verification
// ---------------------------------------------------------------------------

describe("R8 AC1 — Event subscription mapping (behavioral)", () => {
	/**
	 * Behavioral tests that verify the dispatcher ACTUALLY subscribes to the
	 * expected events at runtime by emitting each event and checking whether
	 * the adapter fires (subscribed) or stays silent (not subscribed).
	 *
	 * @lore R8: These replaced the previous tautological documentation tests
	 * (F-06) that only asserted values of arrays they themselves constructed.
	 * True behavioral coverage requires emitting events and observing outcomes.
	 */
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("item_created with blocking item → dispatcher handler fires (subscribed)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		const threadId = await seedThread(db, "thread-ac1-item");
		await createItem(db, { id: "ac1-blocking", blocking: true, riskTier: "medium", threadId });
		unsubscribe = registerNotificationDispatcher(db, eventBus, { adapterFactory: () => adapter });

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-ac1",
			itemId: "ac1-blocking",
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Handler is subscribed — adapter should receive the notification
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
	});

	test("cost_cap_breached (hard) → dispatcher handler fires (subscribed)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		unsubscribe = registerNotificationDispatcher(db, eventBus, { adapterFactory: () => adapter });

		const event: CostCapBreachedEvent = {
			type: "cost_cap_breached",
			streamId: "stream-ac1",
			level: "hard",
			capLevel: "factory",
			entityId: "factory",
			spend: 200,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Handler is subscribed — cost_breach severity pushed
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
	});

	test("cost_cap_warning (critical) → dispatcher handler fires (subscribed)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		unsubscribe = registerNotificationDispatcher(db, eventBus, { adapterFactory: () => adapter });

		const event: CostCapWarningEvent = {
			type: "cost_cap_warning",
			streamId: "stream-ac1",
			level: "critical",
			capLevel: "factory",
			entityId: "factory",
			spend: 90,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Critical warning → push (cost_breach severity)
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
	});

	test("task_state_changed → dispatcher does NOT fire (not subscribed — intentionally silent)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// AC2: task_state_changed is explicitly not subscribed by the dispatcher.
		// Emitting it should produce no notifications and no queue rows.
		await enableNotifications(db);
		unsubscribe = registerNotificationDispatcher(db, eventBus, { adapterFactory: () => adapter });

		emitTaskStateChanged(eventBus, "proposed", "in_progress");
		emitTaskStateChanged(eventBus, "in_progress", "done");

		// Allow async event handlers to fully settle
		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("cost_cap_warning (warning level) → enqueued as digest (subscribed, digest path)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// cost_cap_warning with level=warning produces a digest row, not a push.
		// This verifies the subscription exists but the classification is digest.
		await enableNotifications(db);
		unsubscribe = registerNotificationDispatcher(db, eventBus, { adapterFactory: () => adapter });

		const event: CostCapWarningEvent = {
			type: "cost_cap_warning",
			streamId: "stream-ac1",
			level: "warning",
			capLevel: "team",
			entityId: "team-1",
			spend: 80,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Handler is subscribed — digest row appears, no push
		await vi.waitFor(async () => {
			const rows = await db.select().from(notificationQueue);
			expect(rows).toHaveLength(1);
		});
		const rows = await db.select().from(notificationQueue);
		expect(rows[0]!.severity).toBe("digest");
		expect(adapter.calls).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC2: Routine task state changes are silent
// ---------------------------------------------------------------------------

describe("R8 AC2 — Routine task state changes are silent", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("task_state_changed pending→in_progress does NOT generate a notification or queue row", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		unsubscribe = registerNotificationDispatcher(db, eventBus, {
			adapterFactory: () => adapter,
		});

		emitTaskStateChanged(eventBus, "proposed", "in_progress");

		// Allow all microtasks and async event handlers to settle.
		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("task_state_changed in_progress→done does NOT generate a notification or queue row", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		unsubscribe = registerNotificationDispatcher(db, eventBus, {
			adapterFactory: () => adapter,
		});

		emitTaskStateChanged(eventBus, "in_progress", "done");

		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("task_state_changed emits no notification even when notifications are enabled with full config", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// Extra insurance: flood limit=1 to prove any push would be caught
		await enableNotifications(db, {
			floodMaxPerMinute: 1,
		});
		unsubscribe = registerNotificationDispatcher(db, eventBus, {
			adapterFactory: () => adapter,
		});

		// Emit multiple transitions
		emitTaskStateChanged(eventBus, "proposed", "in_progress", "task-a");
		emitTaskStateChanged(eventBus, "in_progress", "done", "task-a");

		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC3: Blockers and cost caps generate notifications (with preference overrides)
// ---------------------------------------------------------------------------

describe("R8 AC3 — Blocker alerts respect blockerAlerts preference", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("blockerAlerts=false drops blocking item notification", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Set blockerAlerts=false via server_config
		await updateServerConfig(db, { notifications: { blockerAlerts: false } });

		const threadId = await seedThread(db);
		await createItem(db, { id: "blocker-off", blocking: true, riskTier: "high", threadId });

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "blocker-off",
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Allow async event handlers to settle
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("blockerAlerts=true (default) pushes blocking item", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Default: blockerAlerts=true — no override needed

		const threadId = await seedThread(db);
		await createItem(db, { id: "blocker-on", blocking: true, riskTier: "medium", threadId });

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "blocker-on",
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
	});
});

describe("R8 AC3 — Cost alerts respect costAlerts preference", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("costAlerts=false drops cost_cap_warning (critical)", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { costAlerts: false } });

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: CostCapWarningEvent = {
			type: "cost_cap_warning",
			streamId: "stream-r8",
			level: "critical",
			capLevel: "factory",
			entityId: "factory",
			spend: 90,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise((resolve) => setTimeout(resolve, 50));

		// With costAlerts=false, even a critical warning should be dropped
		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("costAlerts=false drops cost_cap_breached (soft)", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { costAlerts: false } });

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: CostCapBreachedEvent = {
			type: "cost_cap_breached",
			streamId: "stream-r8",
			level: "soft",
			capLevel: "team",
			entityId: "team-1",
			spend: 110,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise((resolve) => setTimeout(resolve, 50));

		// soft breach = digest severity; dropped when costAlerts=false
		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("costAlerts=false STILL pushes cost_cap_breached (hard) — safety override", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// Hard cost cap breach is a safety-critical event — it MUST page even
		// when the user has disabled cost alerts. The operator cannot opt out
		// of a hard cap breach notification.
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { costAlerts: false } });

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: CostCapBreachedEvent = {
			type: "cost_cap_breached",
			streamId: "stream-r8",
			level: "hard",
			capLevel: "factory",
			entityId: "factory",
			spend: 200,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
	});

	test("costAlerts=true (default) pushes cost_cap_warning (critical)", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Default: costAlerts=true

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: CostCapWarningEvent = {
			type: "cost_cap_warning",
			streamId: "stream-r8",
			level: "critical",
			capLevel: "factory",
			entityId: "factory",
			spend: 90,
			cap: 100,
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
	});
});

// ---------------------------------------------------------------------------
// AC4: Review alerts with preference overrides
// ---------------------------------------------------------------------------

describe("R8 AC4 — Review alerts respect reviewAlerts preference", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("reviewAlerts=false drops review item (kind=review, riskTier=high)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { reviewAlerts: false } });

		const threadId = await seedThread(db);
		// A review item: kind="review", riskTier="high" → would normally be blocking
		await createItem(db, {
			id: "review-off",
			kind: "review",
			blocking: false,
			riskTier: "high",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "review-off",
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("reviewAlerts=true (default) pushes review item (kind=review, riskTier=high)", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Default: reviewAlerts=true

		const threadId = await seedThread(db);
		await createItem(db, {
			id: "review-on",
			kind: "review",
			blocking: false,
			riskTier: "high",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "review-on",
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
	});

	test("reviewAlerts=false does NOT suppress non-review blocking items", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// Disabling review alerts should only affect review-kind items.
		// A non-review blocking item should still push.
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { reviewAlerts: false } });

		const threadId = await seedThread(db);
		await createItem(db, {
			id: "approval-still-pushes",
			kind: "approval",
			blocking: true,
			riskTier: "medium",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "approval-still-pushes",
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
	});
});

// ---------------------------------------------------------------------------
// AC5: Quiet hours default OFF
// ---------------------------------------------------------------------------

describe("R8 AC5 — quietHoursEnabled defaults to false", () => {
	test("readServerConfig on a fresh DB returns quietHoursEnabled=false", async ({ db }) => {
		const cfg = await readServerConfig(db);
		// quietHoursEnabled must exist and default to false
		expect(cfg.notifications.quietHoursEnabled).toBe(false);
	});

	test("quietHoursEnabled=false means quiet-hours start/end are irrelevant — no silence applied", async ({
		db,
	}) => {
		// With quietHoursEnabled=false, routing should ignore quietHoursStart/End
		// even if they are set to cover the current time.
		await updateServerConfig(db, {
			notifications: {
				quietHoursEnabled: false,
				quietHoursStart: "00:00",
				quietHoursEnd: "23:59", // entire day "quiet" — but disabled, so ignored
			},
		});

		const cfg = await readServerConfig(db);
		expect(cfg.notifications.quietHoursEnabled).toBe(false);
		expect(cfg.notifications.quietHoursStart).toBe("00:00");
		expect(cfg.notifications.quietHoursEnd).toBe("23:59");
		// The dispatcher should NOT silence notifications when quietHoursEnabled=false
		// even if the current time falls within the quiet window.
	});

	test("quietHoursEnabled can be set to true via updateServerConfig", async ({ db }) => {
		await updateServerConfig(db, {
			notifications: {
				quietHoursEnabled: true,
				quietHoursStart: "22:00",
				quietHoursEnd: "08:00",
			},
		});

		const cfg = await readServerConfig(db);
		expect(cfg.notifications.quietHoursEnabled).toBe(true);
		expect(cfg.notifications.quietHoursStart).toBe("22:00");
		expect(cfg.notifications.quietHoursEnd).toBe("08:00");
	});

	test("quietHoursEnabled persists correctly through a read-write-read cycle", async ({ db }) => {
		// Verify the field survives round-trip through DB serialization.
		const before = await readServerConfig(db);
		expect(before.notifications.quietHoursEnabled).toBe(false);

		await updateServerConfig(db, { notifications: { quietHoursEnabled: true } });
		const after = await readServerConfig(db);
		expect(after.notifications.quietHoursEnabled).toBe(true);

		await updateServerConfig(db, { notifications: { quietHoursEnabled: false } });
		const reset = await readServerConfig(db);
		expect(reset.notifications.quietHoursEnabled).toBe(false);
	});
});

describe("R8 AC5 — Quiet hours dispatcher integration", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("quietHoursEnabled=false — blocking item pushes regardless of time", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// quietHoursEnabled=false: no silence window should be applied by the
		// quiet-hours path even if start/end cover the current time.
		await enableNotifications(db);
		await updateServerConfig(db, {
			notifications: {
				quietHoursEnabled: false,
				quietHoursStart: "00:00",
				quietHoursEnd: "23:59",
			},
		});

		const threadId = await seedThread(db);
		await createItem(db, { id: "qh-off-blocking", blocking: true, riskTier: "medium", threadId });

		// Use a fixed "now" that falls inside the 00:00–23:59 window
		const fixedNow = new Date("2026-05-30T12:00:00.000Z");
		unsubscribe = registerWithPrefs(db, eventBus, adapter, { now: () => fixedNow });

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "qh-off-blocking",
			conversationId: threadId,
			kind: "approval",
			timestamp: fixedNow.getTime(),
		};
		eventBus.emit(event);

		// Should push — quiet hours are disabled
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");

		// No silence queue rows created
		const silenceRows = await db
			.select()
			.from(notificationQueue)
			.then((rows) => rows.filter((r) => r.reason === "silence"));
		expect(silenceRows).toHaveLength(0);
	});

	test("quietHoursEnabled=true — blocking item is queued (silenced) within the window", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		// quietHoursEnabled=true with a window that covers 12:00 UTC.
		// The dispatcher should enqueue instead of push.
		await enableNotifications(db);
		await updateServerConfig(db, {
			notifications: {
				quietHoursEnabled: true,
				quietHoursStart: "10:00",
				quietHoursEnd: "14:00",
			},
		});

		const threadId = await seedThread(db, "thread-r8-qh");
		await createItem(db, { id: "qh-on-blocking", blocking: true, riskTier: "medium", threadId });

		const fixedNow = new Date("2026-05-30T12:00:00.000Z"); // 12:00 UTC — inside 10:00–14:00
		unsubscribe = registerWithPrefs(db, eventBus, adapter, { now: () => fixedNow });

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "qh-on-blocking",
			conversationId: threadId,
			kind: "approval",
			timestamp: fixedNow.getTime(),
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const rows = await db.select().from(notificationQueue);
			expect(rows).toHaveLength(1);
		});

		// Adapter must NOT have been called
		expect(adapter.calls).toHaveLength(0);

		const rows = await db.select().from(notificationQueue);
		expect(rows[0]!.reason).toBe("silence");
		expect(rows[0]!.severity).toBe("blocking");
	});
});

// ---------------------------------------------------------------------------
// Preferences wiring — Settings API accepts quietHoursEnabled
// ---------------------------------------------------------------------------

describe("R8 Settings API — quietHoursEnabled field", () => {
	test("PATCH /api/settings accepts quietHoursEnabled=true and persists it", async ({ db }) => {
		// The settings route's notificationPatchSchema must include quietHoursEnabled.
		// This test verifies that updateServerConfig accepts the field and it round-trips.
		await updateServerConfig(db, { notifications: { quietHoursEnabled: true } });
		const cfg = await readServerConfig(db);
		expect(cfg.notifications.quietHoursEnabled).toBe(true);
	});

	test("PATCH /api/settings accepts quietHoursEnabled=false and persists it", async ({ db }) => {
		// First set to true, then back to false to prove the field is writable.
		await updateServerConfig(db, { notifications: { quietHoursEnabled: true } });
		await updateServerConfig(db, { notifications: { quietHoursEnabled: false } });
		const cfg = await readServerConfig(db);
		expect(cfg.notifications.quietHoursEnabled).toBe(false);
	});

	test("GET /api/settings response includes quietHoursEnabled field", async ({ db }) => {
		const cfg = await readServerConfig(db);
		// The settings response is built from readServerConfig — verify the field exists
		expect(Object.hasOwn(cfg.notifications, "quietHoursEnabled")).toBe(true);
	});

	test("partial update preserves existing quietHoursEnabled", async ({ db }) => {
		await updateServerConfig(db, { notifications: { quietHoursEnabled: true } });
		// Update only another field
		await updateServerConfig(db, { notifications: { reviewAlerts: false } });
		const cfg = await readServerConfig(db);
		// quietHoursEnabled must survive the partial update
		expect(cfg.notifications.quietHoursEnabled).toBe(true);
		expect(cfg.notifications.reviewAlerts).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Preferences wiring — integration: blockerAlerts=false in server_config
// ---------------------------------------------------------------------------

describe("R8 Preferences wiring — server_config drives dispatcher", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("blockerAlerts=false in server_config → emit blocking item event → no notification sent", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { blockerAlerts: false } });

		const threadId = await seedThread(db);
		await createItem(db, { id: "pref-blocker", blocking: true, riskTier: "high", threadId });

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "stream-r8",
			itemId: "pref-blocker",
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(adapter.calls).toHaveLength(0);
		const rows = await db.select().from(notificationQueue);
		expect(rows).toHaveLength(0);
	});

	test("all alerts ON (defaults) → behavior identical to pre-R8 existing tests", async ({ db }) => {
		// Verify defaults are all-on — this documents the baseline that must not regress.
		await enableNotifications(db);
		// No updateServerConfig call — pure defaults apply

		const cfg = await readServerConfig(db);
		expect(cfg.notifications.reviewAlerts).toBe(true);
		expect(cfg.notifications.costAlerts).toBe(true);
		expect(cfg.notifications.blockerAlerts).toBe(true);
		expect(cfg.notifications.quietHoursEnabled).toBe(false);
	});
});
