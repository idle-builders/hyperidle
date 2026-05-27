/**
 * Proves the end-to-end scheduled-digest path:
 *  1. Seed a `calendar` routine whose id embeds `daily_digest` and whose
 *     `nextRunAt` is already in the past.
 *  2. Run the scheduler (via `checkAndFireRoutine` directly) and observe
 *     the `routine_fired` event land on the bus.
 *  3. The notification dispatcher's subscriber handles it and marks
 *     every pending `digest` row as `sent` via the adapter.
 *
 * Adversary review #1 flagged the original wiring as dead — this test
 * is the regression guard.
 */

import * as crypto from "node:crypto";
import {
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	notificationQueue,
	products,
	routines,
	tasks,
	teams,
	users,
	type TestDbHandle
} from "@hyperidle/db";
import {
	checkAndFireRoutine,
	type Notification,
	type NotificationAdapter,
	type Recipient,
	registerNotificationDispatcher,
	type SendResult,
} from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function enable(db: HyperIdleDb): Promise<void> {
	const now = "2026-04-18T00:00:00.000Z";
	const pairs: Record<string, string> = {
		"notifications.enabled": "true",
		"notifications.primary_channel": "console",
		"notifications.digest_channel": "console",
	};
	for (const [key, value] of Object.entries(pairs)) {
		await db.insert(factorySettings)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({
				target: factorySettings.key,
				set: { value, updatedAt: now },
			})

	}
}

async function seedFixture(db: HyperIdleDb): Promise<void> {
	const now = "2026-04-18T00:00:00.000Z";
	await db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db.insert(teams)
		.values({
			id: "t1",
			productId: "p1",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})

	await db.insert(users)
		.values({
			id: "agent-cos",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 5,
			createdAt: now,
		})

	await db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "seed",
			appetite: "small",
			status: "shaped",
			createdAt: now,
		})

	await db.insert(tasks)
		.values({
			id: "task-daily-digest",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			ownerAgentId: "agent-cos",
			title: "Digest anchor",
			state: "ready",
			createdAt: now,
			updatedAt: now,
		})

	await db.insert(routines)
		.values({
			id: "routine-daily_digest",
			ownerAgentId: "agent-cos",
			triggerType: "calendar",
			triggerConfig: JSON.stringify({
				cron: "0 8 * * *",
				taskId: "task-daily-digest",
			}),
			active: true,
		})

}

describe("scheduler → routine_fired → daily digest (AC6 end-to-end)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let bus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		bus = new EventBus();
		await seedFixture(db);
		await enable(db);
	});

	it("routine-scheduler emits routine_fired and the dispatcher runs the digest", async () => {
		// Queue one pending digest row.
		await db.insert(notificationQueue)
			.values({
				id: crypto.randomUUID(),
				eventType: "cost_cap_warning",
				subjectId: null,
				severity: "digest",
				title: "warning-held",
				body: "body",
				reason: "digest",
				channel: "console",
				status: "pending",
				attempts: 0,
				createdAt: "2026-04-18T00:00:00.000Z",
			})

		const adapter = createFakeAdapter();
		const dispose = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		// Fire the routine — emits routine_fired on success.
		const [routine] = await db.select().from(routines);
		if (!routine) throw new Error("fixture missing routine");
		const result = await checkAndFireRoutine(db, bus, routine);
		expect(result.fired).toBe(true);

		// The dispatcher's routine_fired handler runs asynchronously via
		// queueMicrotask; wait for the side-effect on the queue.
		await vi.waitFor(async () => {
			const rows = await db.select().from(notificationQueue);
			expect(rows.every((r) => r.status === "sent")).toBe(true);
		});
		expect(adapter.calls.length).toBeGreaterThanOrEqual(1);
		expect(adapter.calls[0].notification.severity).toBe("digest");

		dispose();
	});
});
