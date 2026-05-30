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
	routines,
	tasks,
	teamMembers,
	teams,
	users,
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

function enable(db: HyperIdleDb): void {
	const now = "2026-04-18T00:00:00.000Z";
	const pairs: Record<string, string> = {
		"notifications.enabled": "true",
		"notifications.primary_channel": "console",
		"notifications.digest_channel": "console",
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

function seedFixture(db: HyperIdleDb): void {
	const now = "2026-04-18T00:00:00.000Z";
	db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	// @lore U1: teamMembers.teamId references teams.id (domain entity, formerly productId)
	db.insert(teamMembers)
		.values({
			id: "t1",
			teamId: "p1",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.run();
	db.insert(users)
		.values({
			id: "agent-cos",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 5,
			createdAt: now,
		})
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			// @lore U1: bets.teamId references teams.id (domain entity = "p1"), not teamMembers.id
			teamId: "p1",
			// @lore U1: pitch renamed to description, shaped renamed to draft
			description: "seed",
			appetite: "small",
			status: "draft",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-daily-digest",
			betId: "b1",
			// @lore U1: tasks.teamId references teams.id (domain entity = "p1"), not teamMembers.id
			teamId: "p1",
			ownerAgentId: "agent-cos",
			title: "Digest anchor",
			// @lore U1: "ready" is not a valid task state; use "accepted" for not-yet-started
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(routines)
		.values({
			id: "routine-daily_digest",
			ownerAgentId: "agent-cos",
			triggerType: "calendar",
			triggerConfig: JSON.stringify({
				cron: "0 8 * * *",
				taskId: "task-daily-digest",
			}),
			active: 1,
		})
		.run();
}

describe("scheduler → routine_fired → daily digest (AC6 end-to-end)", () => {
	let db: HyperIdleDb;
	let bus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		bus = new EventBus();
		seedFixture(db);
		enable(db);
	});

	it("routine-scheduler emits routine_fired and the dispatcher runs the digest", async () => {
		// Queue one pending digest row.
		db.insert(notificationQueue)
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
			.run();

		const adapter = createFakeAdapter();
		const dispose = registerNotificationDispatcher(db, bus, {
			adapterFactory: () => adapter,
		});

		// Fire the routine — emits routine_fired on success.
		const routine = db.select().from(routines).get();
		if (!routine) throw new Error("fixture missing routine");
		const result = await checkAndFireRoutine(db, bus, routine);
		expect(result.fired).toBe(true);

		// The dispatcher's routine_fired handler runs asynchronously via
		// queueMicrotask; wait for the side-effect on the queue.
		await vi.waitFor(() => {
			const rows = db.select().from(notificationQueue).all();
			expect(rows.every((r) => r.status === "sent")).toBe(true);
		});
		expect(adapter.calls.length).toBeGreaterThanOrEqual(1);
		expect(adapter.calls[0].notification.severity).toBe("digest");

		dispose();
	});
});
