/**
 * H2 Dispatcher integration tests — wired createApp consumes real
 * event-bus events.
 *
 * @lore AU20 Ag6b: migrated from `registerNotificationDispatcher` +
 * individual dep exports to `installNotifications` + collapsed
 * `notificationsDeps` bag. The `serviceBootstrap` option passes a
 * single disposer returned by `installNotifications`.
 */

import { type HyperIdleDb, items as itemsTable, threads } from "@hyperidle/db";
import {
	enqueue,
	installNotifications,
	listNotifications,
	type Notification,
	type NotificationAdapter,
	updateConfig,
} from "@hyperidle/notifications";
import type { RoutineFiredEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createApp, disposeApp } from "../../app.js";
import { expect, test } from "../../test-fixtures.js";
import { notificationsDeps } from "../notifications-test-deps.js";

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

// @lore AU18: seeds via updateConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function enable(db: HyperIdleDb): Promise<void> {
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
			serviceBootstrap: ({ db: testDb, eventBus: testBus }) => [
				installNotifications(testDb, testBus, notificationsDeps, {
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

	// @lore AU21 Increment 14a: "subscribes to cost_cap_breached and pushes a
	// cost_breach notification" is HARD-DELETED — `cost_cap_breached` and the
	// `cost_breach` notification severity no longer exist, no replacement.

	test("routine_fired with daily_digest marker triggers runDailyDigest", async ({
		db,
		eventBus,
	}) => {
		const adapter = createFakeAdapter();
		const app = await createApp({
			db,
			eventBus,
			serviceBootstrap: ({ db: testDb, eventBus: testBus }) => [
				installNotifications(testDb, testBus, notificationsDeps, {
					adapterFactory: () => adapter,
				}),
			],
		});
		try {
			await enable(db);
			const now = "2026-04-18T00:00:00.000Z";
			await enqueue(db, {
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
				const rows = await listNotifications(db, { kind: "all" });
				expect(rows[0]!.status).toBe("sent");
			});

			expect(adapter.calls.length).toBeGreaterThanOrEqual(1);
		} finally {
			disposeApp(app);
		}
	});
});
