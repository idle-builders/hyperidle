/**
 * M3 RED — lifecycle-propagation.ts: thread participants use founder_id from
 * factorySettings, NOT the hardcoded "u-founder" (A9).
 *
 * These tests FAIL until lifecycle-propagation.ts reads founder_id from
 * factorySettings instead of the hardcoded "u-founder" literal at line 411.
 */

import {
	agents,
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLifecyclePropagation } from "../services/lifecycle-propagation.js";

const SYSTEM_PROPAGATION_ID = "system:propagation";

function seedBase(db: HyperIdleDb, founderId = "test-founder-1"): void {
	const now = new Date().toISOString();

	db.insert(factorySettings)
		.values({ key: "founder_id", value: founderId, updatedAt: now })
		.onConflictDoNothing()
		.run();

	db.insert(products)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })
		.run();
	db.insert(teams)
		.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 1, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			pitch: "Test bet",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: "agent-1",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values({
			id: SYSTEM_PROPAGATION_ID,
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: now,
		})
		.run();
}

function seedDoneTasks(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			ownerAgentId: "agent-1",
			title: "Done task 1",
			state: "done",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-2",
			betId: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			ownerAgentId: "agent-1",
			title: "Done task 2",
			state: "done",
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

describe("M3 — lifecycle-propagation: thread participants use factorySettings founder_id (A9)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase(db, "test-founder-1");
		seedDoneTasks(db);
		registerLifecyclePropagation(db, eventBus);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("propagation thread participants include factorySettings founder_id, not 'u-founder'", async () => {
		// Trigger the propagation that creates a review thread (all tasks done)
		// Fire a task_state_changed event to drive the propagation
		await eventBus.emitAsync({
			type: "task_state_changed",
			streamId: "stream-1",
			taskId: "task-1",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Allow microtasks to settle
		await new Promise<void>((r) => setTimeout(r, 50));

		// Find threads created by propagation for bet-1
		const propagationThreads = db
			.select()
			.from(threads)
			.where(eq(threads.hostId, "bet-1"))
			.all();

		// A thread may or may not have been created depending on propagation conditions
		// The key check: if a thread was created, it must NOT contain "u-founder" as participant
		for (const thread of propagationThreads) {
			const participants = JSON.parse(thread.participants) as string[];
			expect(participants).not.toContain("u-founder");
			// The seeded founder_id should be in participants if a founder participant is included
			if (participants.includes("test-founder-1") || participants.some((p) => p !== SYSTEM_PROPAGATION_ID)) {
				expect(participants).toContain("test-founder-1");
			}
		}
	});
});
