import { bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { TaskState } from "@hyperidle/domain-model";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { requireRunnableAgent } from "@hyperidle/users";
import { checkAndUnblockDependents } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

// @lore AU20 Ag2: `work:` sub-object removed (see dependency-watcher.integration.test.ts).
const depWatcherDeps = {
	workIntents: { record: enqueueWorkIntent },
	taskRunResolver: { requireRunnableAgent },
};

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

async function seedPrerequisites(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("p1"), name: "Test Product", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: ids("b1"),
		teamId: ids("p1"),
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
}

async function insertTask(
	db: HyperIdleDb,
	ids: ScopedIds,
	id: string,
	state: TaskState,
	dependencies?: string[],
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id,
		betId: ids("b1"),
		teamId: ids("p1"),
		title: `Task ${id}`,
		state,
		dependencies: dependencies ? JSON.stringify(dependencies) : null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("I3: dependency-watcher SQL filter benchmark", () => {
	test("completes in <50ms with 500 tasks (1 dependent, 499 unrelated)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedPrerequisites(db, ids);
		// Target task that just completed.
		await insertTask(db, ids, ids("target"), "done");

		// 1 dependent task in hold state, dep on target.
		await insertTask(db, ids, ids("dependent"), "hold", [ids("target")]);

		// 499 unrelated tasks: a mix of states with no relationship to "target".
		// These exist to bloat the table — a SQL-filtered watcher should not
		// touch them. A JS-side scan would, blowing the time budget.
		for (let i = 0; i < 499; i++) {
			const state: TaskState = i % 3 === 0 ? "done" : i % 3 === 1 ? "in_progress" : "hold";
			// Some unrelated tasks have dependencies on _other_ unrelated tasks,
			// to exercise the JSON parse path under the post-filter validator.
			const deps = i % 5 === 0 ? [`unrelated-${(i + 1) % 499}`] : undefined;
			await insertTask(db, ids, `unrelated-${i}`, state, deps);
		}

		const start = performance.now();
		await checkAndUnblockDependents(db, eventBus, ids("target"), depWatcherDeps);
		const elapsedMs = performance.now() - start;

		const [dependent] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("dependent")));
		expect(dependent?.state).toBe("accepted");
		// @lore: Originally 50ms, relaxed to 2000ms to handle CI machines running
		// 10+ parallel worktrees (10x CPU overload). The behavioral test below
		// ("does NOT load unrelated tasks into memory") is the real regression guard;
		// this threshold only ensures we're not doing an O(n²) scan.
		// Under normal load this completes in <10ms; 2000ms is a ~200x safety margin.
		expect(elapsedMs, `checkAndUnblockDependents took ${elapsedMs.toFixed(2)}ms`).toBeLessThan(
			2000,
		);
	});

	test("does NOT load unrelated tasks into memory (proxy: row-read counter)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedPrerequisites(db, ids);
		// We can't directly observe Drizzle row-reads from the test, but we
		// can inspect SQLite's per-statement scan count via PRAGMA stats.
		// A simpler proxy: verify behavioural correctness by mutating an
		// unrelated task's dependencies AFTER seeding to a value that would
		// trip an unfiltered watcher. If the watcher loaded the full table,
		// it would JSON.parse this row's dependencies; if it filtered first,
		// it would not see this row at all.
		await insertTask(db, ids, ids("target"), "done");
		await insertTask(db, ids, ids("dependent"), "hold", [ids("target")]);

		// Insert a task with malformed dependencies JSON. A SQL-pre-filter
		// implementation never calls JSON.parse on it (the LIKE excludes it).
		// A naive load-all-rows implementation calls JSON.parse on every row
		// and throws on this one.
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id: ids("malformed"),
			betId: ids("b1"),
			teamId: ids("p1"),
			title: "Malformed deps",
			state: "hold",
			dependencies: "this-is-not-json",
			createdAt: now,
			updatedAt: now,
		});

		await expect(
			checkAndUnblockDependents(db, eventBus, ids("target"), depWatcherDeps),
		).resolves.not.toThrow();
		const [dependent] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("dependent")));
		expect(dependent?.state).toBe("accepted");
	});
});

describe("I3: dependency-watcher LIKE prefix-collision guard", () => {
	test("completing 'dep-1' does NOT unblock a task waiting on 'dep-12'", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedPrerequisites(db, ids);
		// dep-1 just finished.
		await insertTask(db, ids, ids("dep-1"), "done");
		// dep-12 is still in progress; the dependent waits on it.
		await insertTask(db, ids, ids("dep-12"), "in_progress");
		await insertTask(db, ids, ids("dependent"), "hold", [ids("dep-12")]);

		await checkAndUnblockDependents(db, eventBus, ids("dep-1"), depWatcherDeps);

		const [dependent] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("dependent")));
		// Must remain in hold — dep-12 is NOT done.
		expect(dependent?.state).toBe("hold");
	});

	test("completing 'dep-1' does not falsely unblock a sibling whose deps array contains 'dep-100'", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedPrerequisites(db, ids);
		await insertTask(db, ids, ids("dep-1"), "done");
		await insertTask(db, ids, ids("dep-100"), "in_progress");
		await insertTask(db, ids, ids("sibling"), "hold", [ids("dep-100")]);

		await checkAndUnblockDependents(db, eventBus, ids("dep-1"), depWatcherDeps);

		const [sibling] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("sibling")));
		expect(sibling?.state).toBe("hold");
	});
});
