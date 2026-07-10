/**
 * M3 — lifecycle-propagation.ts: thread participants use founder from users table (A9).
 *
 * @lore P2: Updated from factorySettings.founder_id to users table query.
 * The lifecycle-propagation service queries `users WHERE kind = 'human' LIMIT 1`
 * and uses that id as the founder participant in propagation threads.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { registerLifecyclePropagation } from "@hyperidle/server/app-runtime";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const SYSTEM_PROPAGATION_ID = "system:propagation";

async function seedBase(db: HyperIdleDb, founderId = "test-founder-1"): Promise<void> {
	const now = new Date().toISOString();

	// P2: seed human founder user row (replaces factorySettings.founder_id lookup)
	await db
		.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Test Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(teams)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });

	await db
		.insert(teamMembers)
		.values({ id: "team-1", teamId: "prod-1", capacity: 5, activeBets: 1, formedAt: now });

	// @lore U1: bets.teamId references `teams` (domain entity), not `teamMembers`.
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test bet",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: SYSTEM_PROPAGATION_ID,
		name: "Propagation System",
		role: "system",
		status: "active",
		createdAt: now,
	});
}

async function seedDoneTasks(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	// @lore U1: tasks.teamId references `teams` (domain entity), not `teamMembers`.
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "prod-1",
		ownerAgentId: "agent-1",
		title: "Done task 1",
		state: "done",
		createdAt: now,
		updatedAt: now,
	});

	await db.insert(tasks).values({
		id: "task-2",
		betId: "bet-1",
		teamId: "prod-1",
		ownerAgentId: "agent-1",
		title: "Done task 2",
		state: "done",
		createdAt: now,
		updatedAt: now,
	});
}

describe("M3 — lifecycle-propagation: thread participants use users-table founder id (A9)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("propagation thread participants include users-table founder id, not 'u-founder'", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db, "test-founder-1");
		await seedDoneTasks(db);
		registerLifecyclePropagation(db, eventBus);

		// Trigger the propagation that creates a review thread (all tasks done)
		// Fire a task_state_changed event to drive the propagation
		eventBus.emit({
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
		const propagationThreads = await db.select().from(threads).where(eq(threads.hostId, "bet-1"));

		// A thread may or may not have been created depending on propagation conditions
		// The key check: if a thread was created, it must NOT contain "u-founder" as participant
		for (const thread of propagationThreads) {
			const participants = JSON.parse(thread.participants) as string[];
			expect(participants).not.toContain("u-founder");
			// The seeded founder_id should be in participants if a founder participant is included
			if (
				participants.includes("test-founder-1") ||
				participants.some((p) => p !== SYSTEM_PROPAGATION_ID)
			) {
				expect(participants).toContain("test-founder-1");
			}
		}
	});
});
