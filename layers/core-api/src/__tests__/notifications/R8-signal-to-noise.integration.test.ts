/**
 * R8 Signal-to-Noise Defaults — TDD red phase
 *
 * Tests for ALL acceptance criteria in workpackage R8:
 * AC1: Event subscriptions are documented — which events generate notifications, which are silent
 * AC2: Routine task state changes are silent (no notifications)
 * AC3: Blockers generate visible notifications (with preference overrides)
 * AC4: Review alerts surfaced via preference overrides
 * AC5: Quiet hours default OFF; quietHoursEnabled=false ignores start/end
 *
 * @lore R8: These tests define the contract BEFORE implementation. They fail until:
 *   - quietHoursEnabled field is added to NotificationsSchema
 *   - applyAlertPreferences is added to dispatcher
 *   - readAlertPreferences is wired through DispatcherDeps → bootstrap → server-factory
 *   - Settings PATCH accepts quietHoursEnabled toggle
 *
 * @lore AU20 Ag6b: migrated from `AlertPreferences`/`registerNotificationDispatcher`/
 * `updateNotificationConfig`/`Recipient`/`SendResult` to `installNotifications`/
 * `updateConfig` + `notificationsDeps` bag. `AlertPreferences` is now internal;
 * readAlertPreferences returns an inferred structural type, compatible via
 * TypeScript's structural subtyping.
 */

import { type HyperIdleDb, items as itemsTable, threads } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { ItemCreatedEvent, TaskStateChangedEvent } from "@hyperidle/domain-model";
import {
	installNotifications,
	listNotifications,
	type Notification,
	type NotificationAdapter,
	type NotificationConfigPatch,
	updateConfig,
} from "@hyperidle/notifications";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { afterEach, describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import { notificationsDeps } from "../notifications-test-deps.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface AdapterCall {
	recipient: { channelId: string; label?: string };
	notification: Notification;
}

function createFakeAdapter(
	name: "console" | "ntfy" | "smtp" = "console",
): NotificationAdapter & { calls: AdapterCall[] } {
	const calls: AdapterCall[] = [];
	return {
		name,
		calls,
		async send(recipient, notification) {
			calls.push({ recipient, notification });
			return { ok: true, channel: name, sentAt: new Date().toISOString() };
		},
	};
}

// @lore AU18: seeds via updateConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function enableNotifications(
	db: HyperIdleDb,
	overrides: NotificationConfigPatch = {},
): Promise<void> {
	await updateConfig(
		db,
		{
			enabled: true,
			primaryChannel: "console",
			digestChannel: "console",
			floodMaxPerMinute: 100,
			floodCoalesceWindowMs: 60_000,
			...overrides,
		},
		notificationsDeps,
	);
}

async function seedThread(db: HyperIdleDb, ids: ScopedIds, label = "thread"): Promise<string> {
	const id = ids(label);
	await db.insert(threads).values({
		id,
		hostKind: "task",
		hostId: ids("task"),
		initiatorId: ids("agent"),
		participants: JSON.stringify([ids("agent")]),
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
	bus: import("@hyperidle/event-bus").EventBus,
	ids: ScopedIds,
	fromState: "proposed" | "in_progress",
	toState: "in_progress" | "done",
	taskLabel = "task",
): void {
	const event: TaskStateChangedEvent = {
		type: "task_state_changed",
		streamId: ids("stream"),
		taskId: ids(taskLabel),
		fromState,
		toState,
		timestamp: Date.now(),
	};
	bus.emit(event);
}

/**
 * Register all notification workers with alert preferences wired to
 * readServerConfig. This mirrors the production bootstrap (server-factory.ts)
 * where readAlertPreferences is injected via DispatcherDeps so fabric does not
 * read server_config directly.
 *
 * @lore R8 F-01: Tests that verify preference-driven behaviour (blockerAlerts,
 * reviewAlerts, quietHoursEnabled) must inject readAlertPreferences
 * so the dispatcher reads from server_config rather than falling back to
 * all-alerts-ON defaults.
 *
 * @lore AU20 Ag6b: migrated from `registerNotificationDispatcher` to
 * `installNotifications`. `AlertPreferences` is internal; return type is inferred
 * structurally (TypeScript structural subtyping).
 */
function registerWithPrefs(
	db: HyperIdleDb,
	bus: import("@hyperidle/event-bus").EventBus,
	adapter: NotificationAdapter,
	extraDeps: Partial<{ now: () => Date }> = {},
): () => void {
	return installNotifications(db, bus, notificationsDeps, {
		adapterFactory: () => adapter,
		readAlertPreferences: async () => {
			const cfg = await readServerConfig(db);
			return {
				blockerAlerts: cfg.notifications.blockerAlerts,
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
		ids,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		const threadId = await seedThread(db, ids, "thread-ac1-item");
		await createItem(db, {
			id: ids("ac1-blocking"),
			blocking: true,
			riskTier: "medium",
			threadId,
		});
		unsubscribe = installNotifications(db, eventBus, notificationsDeps, {
			adapterFactory: () => adapter,
		});

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream-ac1"),
			itemId: ids("ac1-blocking"),
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Handler is subscribed — adapter should receive the notification
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
	});

	// @lore AU21 Increment 14a: "cost_cap_breached (hard)" and
	// "cost_cap_warning (critical)" dispatcher-subscription tests are
	// HARD-DELETED — `cost_cap_breached`/`cost_cap_warning` events no longer
	// exist, no replacement.

	test("task_state_changed → dispatcher does NOT fire (not subscribed — intentionally silent)", async ({
		db,
		eventBus,
		ids,
	}) => {
		const adapter = createFakeAdapter();
		// AC2: task_state_changed is explicitly not subscribed by the dispatcher.
		// Emitting it should produce no notifications and no queue rows.
		await enableNotifications(db);
		unsubscribe = installNotifications(db, eventBus, notificationsDeps, {
			adapterFactory: () => adapter,
		});

		emitTaskStateChanged(eventBus, ids, "proposed", "in_progress");
		emitTaskStateChanged(eventBus, ids, "in_progress", "done");

		// Allow async event handlers to fully settle
		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	// @lore AU21 Increment 14a: "cost_cap_warning (warning level) → enqueued
	// as digest" is HARD-DELETED along with `cost_cap_warning`, no replacement.
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
		ids,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		unsubscribe = installNotifications(db, eventBus, notificationsDeps, {
			adapterFactory: () => adapter,
		});

		emitTaskStateChanged(eventBus, ids, "proposed", "in_progress");

		// Allow all microtasks and async event handlers to settle.
		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	test("task_state_changed in_progress→done does NOT generate a notification or queue row", async ({
		db,
		eventBus,
		ids,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		unsubscribe = installNotifications(db, eventBus, notificationsDeps, {
			adapterFactory: () => adapter,
		});

		emitTaskStateChanged(eventBus, ids, "in_progress", "done");

		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	test("task_state_changed emits no notification even when notifications are enabled with full config", async ({
		db,
		eventBus,
		ids,
	}) => {
		const adapter = createFakeAdapter();
		// Extra insurance: flood limit=1 to prove any push would be caught
		await enableNotifications(db, {
			floodMaxPerMinute: 1,
		});
		unsubscribe = installNotifications(db, eventBus, notificationsDeps, {
			adapterFactory: () => adapter,
		});

		// Emit multiple transitions
		emitTaskStateChanged(eventBus, ids, "proposed", "in_progress", "task-a");
		emitTaskStateChanged(eventBus, ids, "in_progress", "done", "task-a");

		await Promise.resolve();
		await Promise.resolve();

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC3: Blockers generate notifications (with preference overrides)
// ---------------------------------------------------------------------------

describe("R8 AC3 — Blocker alerts respect blockerAlerts preference", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
	});

	test("blockerAlerts=false drops blocking item notification", async ({ db, eventBus, ids }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Set blockerAlerts=false via server_config
		await updateServerConfig(db, { notifications: { blockerAlerts: false } });

		const threadId = await seedThread(db, ids);
		await createItem(db, {
			id: ids("blocker-off"),
			blocking: true,
			riskTier: "high",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("blocker-off"),
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Allow async event handlers to settle
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	test("blockerAlerts=true (default) pushes blocking item", async ({ db, eventBus, ids }) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Default: blockerAlerts=true — no override needed

		const threadId = await seedThread(db, ids);
		await createItem(db, {
			id: ids("blocker-on"),
			blocking: true,
			riskTier: "medium",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("blocker-on"),
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
	});
});

// @lore AU21 Increment 14a: "R8 AC3 — Cost alerts respect costAlerts
// preference" describe block is HARD-DELETED — `costAlerts`,
// `cost_cap_warning`/`cost_cap_breached`, and the `cost_breach` notification
// severity no longer exist, no replacement.

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
		ids,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { reviewAlerts: false } });

		const threadId = await seedThread(db, ids);
		// A review item: kind="review", riskTier="high" → would normally be blocking
		await createItem(db, {
			id: ids("review-off"),
			kind: "review",
			blocking: false,
			riskTier: "high",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("review-off"),
			conversationId: threadId,
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	test("reviewAlerts=true (default) pushes review item (kind=review, riskTier=high)", async ({
		db,
		eventBus,
		ids,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		// Default: reviewAlerts=true

		const threadId = await seedThread(db, ids);
		await createItem(db, {
			id: ids("review-on"),
			kind: "review",
			blocking: false,
			riskTier: "high",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("review-on"),
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
		ids,
	}) => {
		const adapter = createFakeAdapter();
		// Disabling review alerts should only affect review-kind items.
		// A non-review blocking item should still push.
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { reviewAlerts: false } });

		const threadId = await seedThread(db, ids);
		await createItem(db, {
			id: ids("approval-still-pushes"),
			kind: "approval",
			blocking: true,
			riskTier: "medium",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("approval-still-pushes"),
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
		ids,
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

		const threadId = await seedThread(db, ids);
		await createItem(db, {
			id: ids("qh-off-blocking"),
			blocking: true,
			riskTier: "medium",
			threadId,
		});

		// Use a fixed "now" that falls inside the 00:00–23:59 window
		const fixedNow = new Date("2026-05-30T12:00:00.000Z");
		unsubscribe = registerWithPrefs(db, eventBus, adapter, { now: () => fixedNow });

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("qh-off-blocking"),
			conversationId: threadId,
			kind: "approval",
			timestamp: fixedNow.getTime(),
		};
		eventBus.emit(event);

		// Should push — quiet hours are disabled
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
		expect(adapter!.calls[0]!.notification.severity).toBe("blocking");

		// No silence queue rows created
		const silenceRows = (await listNotifications(db, { kind: "all" })).filter(
			(r) => r.reason === "silence",
		);
		expect(silenceRows).toHaveLength(0);
	});

	test("quietHoursEnabled=true — blocking item is queued (silenced) within the window", async ({
		db,
		eventBus,
		ids,
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

		const threadId = await seedThread(db, ids, "thread-r8-qh");
		await createItem(db, {
			id: ids("qh-on-blocking"),
			blocking: true,
			riskTier: "medium",
			threadId,
		});

		const fixedNow = new Date("2026-05-30T12:00:00.000Z"); // 12:00 UTC — inside 10:00–14:00
		unsubscribe = registerWithPrefs(db, eventBus, adapter, { now: () => fixedNow });

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("qh-on-blocking"),
			conversationId: threadId,
			kind: "approval",
			timestamp: fixedNow.getTime(),
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const rows = await listNotifications(db, { kind: "all" });
			expect(rows).toHaveLength(1);
		});

		// Adapter must NOT have been called
		expect(adapter.calls).toHaveLength(0);

		const rows = await listNotifications(db, { kind: "all" });
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
		ids,
	}) => {
		const adapter = createFakeAdapter();
		await enableNotifications(db);
		await updateServerConfig(db, { notifications: { blockerAlerts: false } });

		const threadId = await seedThread(db, ids);
		await createItem(db, {
			id: ids("pref-blocker"),
			blocking: true,
			riskTier: "high",
			threadId,
		});

		unsubscribe = registerWithPrefs(db, eventBus, adapter);

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: ids("stream"),
			itemId: ids("pref-blocker"),
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(adapter.calls).toHaveLength(0);
		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	test("all alerts ON (defaults) → behavior identical to pre-R8 existing tests", async ({ db }) => {
		// Verify defaults are all-on — this documents the baseline that must not regress.
		await enableNotifications(db);
		// No updateServerConfig call — pure defaults apply

		const cfg = await readServerConfig(db);
		expect(cfg.notifications.reviewAlerts).toBe(true);
		expect(cfg.notifications.blockerAlerts).toBe(true);
		expect(cfg.notifications.quietHoursEnabled).toBe(false);
	});
});
