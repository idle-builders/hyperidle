/**
 * H2 Dispatcher integration tests — wired createApp consumes real
 * event-bus events.
 */

import { type HyperIdleDb, items as itemsTable, threads } from "@hyperidle/db";
import type { CostCapBreachedEvent, RoutineFiredEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createApp, disposeApp } from "../../app.js";
import { updateNotificationConfig } from "../../notifications/config.js";
import { registerNotificationDispatcher } from "../../notifications/dispatcher.js";
import { insertNotification, listAll } from "../../notifications/notification-queue.js";
import type {
	Notification,
	NotificationAdapter,
	Recipient,
	SendResult,
} from "../../notifications/types.js";
import { expect, test } from "../../test-fixtures.js";

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
async function enable(db: HyperIdleDb): Promise<void> {
	await updateNotificationConfig(db, {
		enabled: true,
		primaryChannel: "console",
		digestChannel: "console",
		floodMaxPerMinute: 100,
		floodCoalesceWindowMs: 60_000,
	});
}

describe("H2 Dispatcher integration via createApp", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-H2");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("subscribes to item_created and pushes on blocking items", async ({ db, eventBus }) => {
		const adapter = createFakeAdapter();
		const app = await createApp({
			db,
			eventBus,
			// O3: notificationAdapterFactory removed from AppOptions for the dispatcher.
			// Use serviceBootstrap to wire the dispatcher with the fake adapter.
			serviceBootstrap: ({ db: testDb, eventBus: testBus }) => [
				registerNotificationDispatcher(testDb, testBus, {
					adapterFactory: () => adapter,
				}),
			],
		});
		try {
			await enable(db);
			const threadId = "thread-app-1";
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: "2026-04-18T00:00:00.000Z",
				createdAt: "2026-04-18T00:00:00.000Z",
			});

			await db.insert(itemsTable).values({
				id: "it-100",
				kind: "approval",
				title: "Blocking it",
				body: "Body",
				blocking: true,
				threadId,
				createdAt: "2026-04-18T00:00:00.000Z",
			});

			eventBus.emit({
				type: "item_created",
				streamId: "s",
				itemId: "it-100",
				conversationId: threadId,
				kind: "approval",
				timestamp: Date.now(),
			});
			await vi.waitFor(() => expect(adapter.calls.length).toBeGreaterThanOrEqual(1));

			expect(adapter!.calls[0]!.notification.severity).toBe("blocking");
		} finally {
			disposeApp(app);
		}
	});

	test("subscribes to cost_cap_breached and pushes a cost_breach notification", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createApp({
			db,
			eventBus,
			serviceBootstrap: ({ db: testDb, eventBus: testBus }) => [
				registerNotificationDispatcher(testDb, testBus, {
					adapterFactory: () => adapter,
				}),
			],
		});
		try {
			await enable(db);
			const event: CostCapBreachedEvent = {
				type: "cost_cap_breached",
				streamId: "s",
				level: "hard",
				capLevel: "agent",
				entityId: "agent-7",
				spend: 500,
				cap: 100,
				timestamp: Date.now(),
			};
			eventBus.emit(event);
			await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));

			expect(adapter!.calls[0]!.notification.severity).toBe("cost_breach");
		} finally {
			disposeApp(app);
		}
	});

	test("routine_fired with daily_digest marker triggers runDailyDigest", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createApp({
			db,
			eventBus,
			serviceBootstrap: ({ db: testDb, eventBus: testBus }) => [
				registerNotificationDispatcher(testDb, testBus, {
					adapterFactory: () => adapter,
				}),
			],
		});
		try {
			await enable(db);
			const now = "2026-04-18T00:00:00.000Z";
			await insertNotification(db, {
				id: "q-1",
				eventType: "item_created",
				subjectId: "foo",
				severity: "digest",
				title: "Queued digest item",
				body: "body",
				reason: "digest",
				channel: "console",
				status: "pending",
				attempts: 0,
				createdAt: now,
			});

			const event: RoutineFiredEvent = {
				type: "routine_fired",
				streamId: "s",
				routineId: "seed-routine-daily_digest",
				agentId: "cos",
				timestamp: Date.now(),
			};
			eventBus.emit(event);
			await vi.waitFor(async () => {
				const rows = await listAll(db);
				expect(rows[0]!.status).toBe("sent");
			});

			expect(adapter.calls.length).toBeGreaterThanOrEqual(1);
		} finally {
			disposeApp(app);
		}
	});
});
