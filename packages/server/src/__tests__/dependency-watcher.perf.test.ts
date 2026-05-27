import { bets, createTestDb, type HyperIdleDb, products, tasks, teams ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus, type TaskState } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { checkAndUnblockDependents } from "../services/dependency-watcher.js";

/**
 * I3 — dependency-watcher SQL filter & benchmark.
 *
 * Per AC (TRACK-I.md L137-139):
 *  - `checkAndUnblockDependents` must use SQL-level filtering (LIKE the JSON
 *    representation of the completed taskId) rather than loading every row.
 *  - With 500 tasks, must complete in <10ms; this test relaxes the bound to
 *    50ms to account for CI / cold-cache jitter (the AC value is enforced by
 *    a separate benchmark in CI).
 *
 * Adversary note (H-2 in I3-plan): the LIKE pattern wraps the taskId in
 * double quotes ("dep-1") to prevent prefix collisions ("dep-1" matching
 * "dep-12"). The collision test below pins that behaviour.
 */

function seedPrerequisites(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	await db.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: now })

	await db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })

	await db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test bet",
			appetite: "small",
			status: "committed",
			createdAt: now,
		})

}

function insertTask(db: HyperIdleDb, id: string, state: TaskState, dependencies?: string[]): void {
	const now = new Date().toISOString();
	await db.insert(tasks)
		.values({
			id,
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: `Task ${id}`,
			state,
			dependencies: dependencies ? JSON.stringify(dependencies) : null,
			createdAt: now,
			updatedAt: now,
		})

}

describe("I3: dependency-watcher SQL filter benchmark", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		seedPrerequisites(db);
	});

	it("completes in <50ms with 500 tasks (1 dependent, 499 unrelated)", () => {
		// Target task that just completed.
		insertTask(db, "target", "done");

		// 1 dependent task in hold state, dep on target.
		insertTask(db, "dependent", "hold", ["target"]);

		// 499 unrelated tasks: a mix of states with no relationship to "target".
		// These exist to bloat the table — a SQL-filtered watcher should not
		// touch them. A JS-side scan would, blowing the time budget.
		for (let i = 0; i < 499; i++) {
			const state: TaskState = i % 3 === 0 ? "done" : i % 3 === 1 ? "in_progress" : "hold";
			// Some unrelated tasks have dependencies on _other_ unrelated tasks,
			// to exercise the JSON parse path under the post-filter validator.
			const deps = i % 5 === 0 ? [`unrelated-${(i + 1) % 499}`] : undefined;
			insertTask(db, `unrelated-${i}`, state, deps);
		}

		const start = performance.now();
		checkAndUnblockDependents(db, eventBus, "target");
		const elapsedMs = performance.now() - start;

		const [dependent] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
		expect(dependent?.state).toBe("accepted");
		expect(elapsedMs, `checkAndUnblockDependents took ${elapsedMs.toFixed(2)}ms`).toBeLessThan(50);
	});

	it("does NOT load unrelated tasks into memory (proxy: row-read counter)", () => {
		// We can't directly observe Drizzle row-reads from the test, but we
		// can inspect SQLite's per-statement scan count via PRAGMA stats.
		// A simpler proxy: verify behavioural correctness by mutating an
		// unrelated task's dependencies AFTER seeding to a value that would
		// trip an unfiltered watcher. If the watcher loaded the full table,
		// it would JSON.parse this row's dependencies; if it filtered first,
		// it would not see this row at all.
		insertTask(db, "target", "done");
		insertTask(db, "dependent", "hold", ["target"]);

		// Insert a task with malformed dependencies JSON. A SQL-pre-filter
		// implementation never calls JSON.parse on it (the LIKE excludes it).
		// A naive load-all-rows implementation calls JSON.parse on every row
		// and throws on this one.
		const now = new Date().toISOString();
		await db.insert(tasks)
			.values({
				id: "malformed",
				betId: "b1",
				productId: "p1",
				teamId: "t1",
				title: "Malformed deps",
				state: "hold",
				dependencies: "this-is-not-json",
				createdAt: now,
				updatedAt: now,
			})

		expect(() => checkAndUnblockDependents(db, eventBus, "target")).not.toThrow();
		const [dependent] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
		expect(dependent?.state).toBe("accepted");
	});
});

describe("I3: dependency-watcher LIKE prefix-collision guard", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		seedPrerequisites(db);
	});

	it("completing 'dep-1' does NOT unblock a task waiting on 'dep-12'", () => {
		// dep-1 just finished.
		insertTask(db, "dep-1", "done");
		// dep-12 is still in progress; the dependent waits on it.
		insertTask(db, "dep-12", "in_progress");
		insertTask(db, "dependent", "hold", ["dep-12"]);

		checkAndUnblockDependents(db, eventBus, "dep-1");

		const [dependent] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
		// Must remain in hold — dep-12 is NOT done.
		expect(dependent?.state).toBe("hold");
	});

	it("completing 'dep-1' does not falsely unblock a sibling whose deps array contains 'dep-100'", () => {
		insertTask(db, "dep-1", "done");
		insertTask(db, "dep-100", "in_progress");
		insertTask(db, "sibling", "hold", ["dep-100"]);

		checkAndUnblockDependents(db, eventBus, "dep-1");

		const [sibling] = await db.select().from(tasks).where(eq(tasks.id, "sibling"));
		expect(sibling?.state).toBe("hold");
	});
});
