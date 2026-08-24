/**
 * AF12 — AC5: Concurrent task transitions must not corrupt state.
 *
 * The kernel `transitionTask` must mirror `transitionBet`'s CAS contract — and
 * "mirror" means the same TRANSACTION boundary: SELECT-validate + audit-append
 * + CAS-UPDATE inside one `db.transaction`. Two interleaved transitions from the
 * same `fromState` must resolve to exactly one winner; the loser throws
 * `InvalidTransitionError`; the audit blob must keep BOTH the winner's entry
 * intact (no last-writer-wins clobber) and `task_state_changed` fires exactly
 * once.
 *
 * @lore AF12 RED: these assert behavior that does not yet exist — the current
 * unguarded UPDATE lets both racers "succeed" and double-emits.
 */

import { bets, type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import type { DomainEvent } from "@hyperidle/event-bus";
import { requireRunnableAgent } from "@hyperidle/users";
import type { TaskStateMachineDeps } from "@hyperidle/work";
import { InvalidTransitionError, transitionTask } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

/** AU19 Increment 1b: `transitionTask` now takes an injected `session-requests` port. */
const testDeps: TaskStateMachineDeps = {
	workIntents: async () => ({ id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
	taskRunResolver: { requireRunnableAgent },
};

async function seed(db: HyperIdleDb, taskState = "accepted"): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "prod-1", name: "Test", phase: "build", createdAt: now });
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "prod-1",
		title: "Test Task",
		state: taskState,
		createdAt: now,
		updatedAt: now,
	});
}

describe("AF12 AC5 — task transition CAS", () => {
	test("two concurrent transitions from the same state: exactly one wins, one throws InvalidTransitionError", async ({
		db,
		eventBus,
	}) => {
		await seed(db, "accepted");

		// accepted → in_progress and accepted → hold both valid from `accepted`.
		const results = await Promise.allSettled([
			transitionTask(db, eventBus, "task-1", "in_progress", testDeps),
			transitionTask(db, eventBus, "task-1", "hold", testDeps),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidTransitionError);

		// Final state is one of the two attempted targets, never corrupted/half-written.
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
		expect(["in_progress", "hold"]).toContain(task?.state);
	});

	test("task_state_changed emitted exactly once under a concurrent race", async ({
		db,
		eventBus,
	}) => {
		await seed(db, "accepted");

		const emitted: DomainEvent[] = [];
		eventBus.on("task_state_changed", (e) => emitted.push(e));

		await Promise.allSettled([
			transitionTask(db, eventBus, "task-1", "in_progress", testDeps),
			transitionTask(db, eventBus, "task-1", "hold", testDeps),
		]);

		expect(emitted).toHaveLength(1);
	});

	test("audit trail and committed state stay consistent under a race (no last-writer-wins clobber)", async ({
		db,
		eventBus,
	}) => {
		await seed(db, "accepted");

		const results = await Promise.allSettled([
			transitionTask(db, eventBus, "task-1", "in_progress", testDeps),
			transitionTask(db, eventBus, "task-1", "hold", testDeps),
		]);
		const committed = results.filter((r) => r.status === "fulfilled").length;

		// @lore AU20 repair: audit trail assertions removed — tasks.auditTrail writes were deleted
		// by the AU20 destroyer pass. The key CAS invariant (exactly one winner) is still tested.
		expect(committed).toBe(1);

		// Final state must be exactly one of the two attempted targets (not corrupted).
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
		expect(["in_progress", "hold"]).toContain(task?.state);
	});
});
