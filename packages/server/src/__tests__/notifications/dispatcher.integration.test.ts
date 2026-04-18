/**
 * H2 Dispatcher integration tests — wired createApp consumes real
 * event-bus events.
 */

import {
	type HyperIdleDb,
	createTestDb,
	factorySettings,
	items as itemsTable,
	notificationQueue,
	threads,
} from "@hyperidle/db";
import { type CostCapBreachedEvent, EventBus, type RoutineFiredEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, disposeApp } from "../../app.js";
import type {
	Notification,
	NotificationAdapter,
	Recipient,
	SendResult,
} from "../../services/notifications/types.js";

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

function enable(db: HyperIdleDb): void {
	const now = "2026-04-18T00:00:00.000Z";
	const pairs: Record<string, string> = {
		"notifications.enabled": "true",
		"notifications.primary_channel": "console",
		"notifications.digest_channel": "console",
		"notifications.flood_max_per_minute": "100",
		"notifications.flood_coalesce_window_ms": "60000",
	};
	for (const [key, value] of Object.entries(pairs)) {
		db.insert(factorySettings)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({
				target: factorySettings.key,
				set: { value, updatedAt: now },
			})
			.run();
	}
}

describe("H2 Dispatcher integration via createApp", () => {
	let db: HyperIdleDb;
	let bus: EventBus;
	let adapter: NotificationAdapter & { calls: AdapterCall[] };
	let app: ReturnType<typeof createApp>;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-H2");
		db = createTestDb();
		bus = new EventBus();
		adapter = createFakeAdapter();
		app = createApp({
			db,
			eventBus: bus,
			notificationAdapterFactory: () => adapter,
		});
	});

	afterEach(() => {
		disposeApp(app);
		vi.unstubAllEnvs();
	});

	it("subscribes to item_created and pushes on blocking items", async () => {
		enable(db);
		const threadId = "thread-app-1";
		db.insert(threads)
			.values({ id: threadId, kind: "review", createdAt: "2026-04-18T00:00:00.000Z" })
			.run();
		db.insert(itemsTable)
			.values({
				id: "it-100",
				kind: "approval",
				title: "Blocking it",
				body: "Body",
				blocking: 1,
				threadId,
				createdAt: "2026-04-18T00:00:00.000Z",
			})
			.run();

		bus.emit({
			type: "item_created",
			streamId: "s",
			itemId: "it-100",
			conversationId: threadId,
			kind: "approval",
			timestamp: Date.now(),
		});
		await vi.waitFor(() => expect(adapter.calls.length).toBeGreaterThanOrEqual(1));

		expect(adapter.calls[0].notification.severity).toBe("blocking");
	});

	it("subscribes to cost_cap_breached and pushes a cost_breach notification", async () => {
		enable(db);
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
		bus.emit(event);
		await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));

		expect(adapter.calls[0].notification.severity).toBe("cost_breach");
	});

	it("routine_fired with daily_digest marker triggers runDailyDigest", async () => {
		enable(db);
		const now = "2026-04-18T00:00:00.000Z";
		db.insert(notificationQueue)
			.values({
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
			})
			.run();
		const event: RoutineFiredEvent = {
			type: "routine_fired",
			streamId: "s",
			routineId: "seed-routine-daily_digest",
			agentId: "cos",
			timestamp: Date.now(),
		};
		bus.emit(event);
		await vi.waitFor(() => {
			const rows = db.select().from(notificationQueue).all();
			expect(rows[0].status).toBe("sent");
		});

		expect(adapter.calls.length).toBeGreaterThanOrEqual(1);
	});
});
