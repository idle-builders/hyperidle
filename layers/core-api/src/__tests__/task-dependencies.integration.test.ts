/**
 * "Tasks wait for the tasks they depend on, then start themselves".
 *
 * re-pointed off the deleted `POST/PATCH /tasks` routes and the deleted
 * `transitionTask` — everything here now goes through `POST
 * /api/actions/edit_task`, human and direct alike. A refusal is `422
 * { ok: false, problems }`, never a distinct HTTP status per rule.
 *
 * Covers, against the real `{ db, app, eventBus }` fixtures:
 *   - AC1 (human doors): `edit_task` accepts `dependencies` on create and edit,
 *     and validates it on write.
 *   - AC2 (the enforcing half): `edit_task` itself refuses a move to
 *     `accepted` while an unfinished dependency remains.
 *   - AC5: a dependency cycle, a self-dependency, and a dependency naming a
 *     task that does not exist are all refused with a problem identifying
 *     the rule.
 *   - "Decided without asking": a dependency may point at a task under any
 *     root — no restriction.
 */

import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-task-deps";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

interface EditTaskResult {
	readonly ok: boolean;
	readonly data?: { readonly task: { readonly id: string; readonly state: string } };
	readonly problems?: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

async function editTask(
	app: Hono,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly json: EditTaskResult }> {
	const res = await app.request("/api/actions/edit_task", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(body),
	});
	return { status: res.status, json: (await res.json()) as EditTaskResult };
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: `Team ${teamId}`, createdAt: now });
	// `changes.actor` FKs to `users` — API-key auth with no seeded human row
	// falls back to the literal "u-founder", and the dependency watcher's own
	// edit_task calls (dependency-killed cleanup) write as "system:propagation".
	await db
		.insert(users)
		.values([
			{
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "system:propagation",
				name: "Propagation System",
				role: "system",
				status: "active",
				createdAt: now,
			},
		])
		.onConflictDoNothing();
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	state: TaskState,
	dependencies?: string[],
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id: `thr-${id}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${id}`,
		id,
		parentTaskId: null,
		teamId,
		title: `Task ${id}`,
		state,
		dependencies: dependencies ? JSON.stringify(dependencies) : null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("task dependencies — the edit_task door, the guard, cycle rejection", () => {
	// ---------------------------------------------------------------------
	// AC1: create
	// ---------------------------------------------------------------------
	describe("AC1: edit_task (create) accepts dependencies", () => {
		test("creates a task carrying dependencies and parks it while the dependency is unfinished", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-t1");
			await insertTask(db, "dep-dep-1", "dep-t1", "in_progress");

			const { status, json } = await editTask(app, {
				teamId: "dep-t1",
				title: "Depends on dep-1",
				dependencies: ["dep-dep-1"],
			});

			expect(status).toBe(200);
			expect(json.ok).toBe(true);
			const created = json.data?.task;
			const [row] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, created?.id ?? ""));
			expect(row?.dependencies).toBe(JSON.stringify(["dep-dep-1"]));
			expect(row?.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// AC1 (edit) + "no restriction on where a dependency points"
	// ---------------------------------------------------------------------
	describe("AC1: edit_task (existing) accepts dependencies and parks the task", () => {
		test("a dependency may point at a task under a DIFFERENT root — no restriction", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-t2");
			await insertTask(db, "dep-root-a", "dep-t2", "in_progress");
			await insertTask(db, "dep-root-b", "dep-t2", "in_progress");
			await insertTask(db, "dep-cross-dep", "dep-t2", "in_progress");
			await insertTask(db, "dep-dependent", "dep-t2", "proposed");

			const { status, json } = await editTask(app, {
				id: "dep-dependent",
				dependencies: ["dep-cross-dep"],
			});

			expect(status).toBe(200);
			const task = json.data?.task;
			expect(task?.state).toBe("hold");
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-dependent"));
			expect(row?.dependencies).toBe(JSON.stringify(["dep-cross-dep"]));
		});
	});

	// ---------------------------------------------------------------------
	// AC2: the enforcing half — direct against edit_task
	// ---------------------------------------------------------------------
	describe("AC2: edit_task refuses accepted while a dependency is unfinished", () => {
		test("hold -> accepted is refused while a named dependency is not done", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-t3");
			await insertTask(db, "dep-guard-dep", "dep-t3", "in_progress");
			await insertTask(db, "dep-guard-dependent", "dep-t3", "hold", ["dep-guard-dep"]);

			const { status, json } = await editTask(app, {
				id: "dep-guard-dependent",
				state: "accepted",
			});

			expect(status).toBe(422);
			expect(json.ok).toBe(false);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-guard-dependent"));
			expect(row?.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// AC5: cycle / self-dependency / dangling dependency rejection
	// ---------------------------------------------------------------------
	describe("AC5: dependency cycles and invalid dependencies are refused", () => {
		test("a cycle (A depends on B, B depends on A) is refused with a problem naming the rule", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-t4");
			await insertTask(db, "dep-cycle-a", "dep-t4", "proposed");
			await insertTask(db, "dep-cycle-b", "dep-t4", "proposed");

			const first = await editTask(app, { id: "dep-cycle-b", dependencies: ["dep-cycle-a"] });
			expect(first.status).toBe(200);

			const { status, json } = await editTask(app, {
				id: "dep-cycle-a",
				dependencies: ["dep-cycle-b"],
			});

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("cycle");
		});

		test("a task cannot depend on itself", async ({ db, app }) => {
			await seedTeam(db, "dep-t5");
			await insertTask(db, "dep-self", "dep-t5", "proposed");

			const { status, json } = await editTask(app, { id: "dep-self", dependencies: ["dep-self"] });

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("cycle");
		});

		test("a dependency naming a task that does not exist is refused", async ({ db, app }) => {
			await seedTeam(db, "dep-t6");
			await insertTask(db, "dep-dangling", "dep-t6", "proposed");

			const { status, json } = await editTask(app, {
				id: "dep-dangling",
				dependencies: ["dep-does-not-exist"],
			});

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("dependency_not_found");
		});
	});

	// ---------------------------------------------------------------------
	// "Decided without asking": dependencies gate being picked up; a task
	// already in progress is not rewound by a later dependencies write.
	// ---------------------------------------------------------------------
	describe("a task already in_progress is not rewound by a later dependencies write", () => {
		test("edit_task setting dependencies on an in_progress task leaves it in_progress", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-t8");
			await insertTask(db, "dep-unfinished-dep", "dep-t8", "in_progress");
			await insertTask(db, "dep-running", "dep-t8", "in_progress");

			const { status } = await editTask(app, {
				id: "dep-running",
				dependencies: ["dep-unfinished-dep"],
			});

			expect(status).toBe(200);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-running"));
			expect(row?.state).toBe("in_progress");
			expect(row?.dependencies).toBe(JSON.stringify(["dep-unfinished-dep"]));
		});
	});

	// ---------------------------------------------------------------------
	// AC6: a killed dependency sends its dependents back to `proposed` and
	// drops the killed id from their dependency list.
	// ---------------------------------------------------------------------
	describe("AC6: a killed dependency resets its dependents", () => {
		test("dependent returns to proposed and the killed id is dropped from its list", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-t7");
			await insertTask(db, "dep-killable", "dep-t7", "in_progress");
			await insertTask(db, "dep-still-unfinished", "dep-t7", "in_progress");
			await insertTask(db, "dep-dependent-of-killed", "dep-t7", "hold", [
				"dep-killable",
				"dep-still-unfinished",
			]);

			const { status } = await editTask(app, { id: "dep-killable", state: "killed" });
			expect(status).toBe(200);

			const [dependent] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, "dep-dependent-of-killed"));
			expect(dependent?.state).toBe("proposed");
			expect(JSON.parse(dependent?.dependencies ?? "[]")).toEqual(["dep-still-unfinished"]);
		});
	});

	// ---------------------------------------------------------------------
	// The edit panel's write always includes `state`, set to the task's OWN
	// current value. Parking must not require `state` to be absent — only
	// that it isn't an actual CHANGE.
	// ---------------------------------------------------------------------
	describe("edit_task carrying the SAME state plus an unfinished dependency still parks", () => {
		test("edit_task with unchanged state and a new unfinished dependency parks the task", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b1a");
			await insertTask(db, "dep-b1a-dep", "dep-b1a", "proposed");
			await insertTask(db, "dep-b1a-dependent", "dep-b1a", "proposed");

			const { status } = await editTask(app, {
				id: "dep-b1a-dependent",
				state: "proposed",
				dependencies: ["dep-b1a-dep"],
			});

			expect(status).toBe(200);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-b1a-dependent"));
			expect(row?.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// The guard must also cover `-> in_progress`, not only `-> accepted`.
	// ---------------------------------------------------------------------
	describe("edit_task also refuses accepted -> in_progress while a dependency is unfinished", () => {
		test("an accepted task holding an unfinished dependency cannot move to in_progress", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b1b");
			await insertTask(db, "dep-b1b-dep", "dep-b1b", "proposed");
			await insertTask(db, "dep-b1b-dependent", "dep-b1b", "accepted", ["dep-b1b-dep"]);

			const { status, json } = await editTask(app, {
				id: "dep-b1b-dependent",
				state: "in_progress",
			});

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("dependency_blocked");
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-b1b-dependent"));
			expect(row?.state).toBe("accepted");
		});
	});

	// ---------------------------------------------------------------------
	// A dependent that is NOT in `hold` still carries the killed dependency's
	// id — must be dropped from a dependent in ANY state.
	// ---------------------------------------------------------------------
	describe("a killed dependency drops its id from a dependent that is NOT in hold", () => {
		test("a `proposed` dependent loses the killed id and stays acceptable afterward", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b2");
			await insertTask(db, "dep-b2-killable", "dep-b2", "done");
			await insertTask(db, "dep-b2-dependent", "dep-b2", "proposed", ["dep-b2-killable"]);

			const kill = await editTask(app, { id: "dep-b2-killable", state: "killed" });
			expect(kill.status).toBe(200);

			const [dependent] = await db.select().from(tasks).where(eq(tasks.id, "dep-b2-dependent"));
			expect(dependent?.state).toBe("proposed");
			expect(JSON.parse(dependent?.dependencies ?? "[]")).toEqual([]);

			const accept = await editTask(app, { id: "dep-b2-dependent", state: "accepted" });
			expect(accept.status).toBe(200);
		});
	});

	// ---------------------------------------------------------------------
	// Pointing a NEW dependency at a task that is ALREADY killed must be
	// refused too, on create and on edit.
	// ---------------------------------------------------------------------
	describe("a dependency naming an already-killed task is refused on both doors", () => {
		test("edit_task (create) refuses a dependency naming an already-killed task", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b1c-post");
			await insertTask(db, "dep-b1c-post-dead", "dep-b1c-post", "killed");

			const { status, json } = await editTask(app, {
				teamId: "dep-b1c-post",
				title: "Depends on a corpse",
				dependencies: ["dep-b1c-post-dead"],
			});

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("dependency_killed");
		});

		test("edit_task (existing) refuses a dependency naming an already-killed task", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b1c-patch");
			await insertTask(db, "dep-b1c-patch-dead", "dep-b1c-patch", "killed");
			await insertTask(db, "dep-b1c-patch-dependent", "dep-b1c-patch", "proposed");

			const { status, json } = await editTask(app, {
				id: "dep-b1c-patch-dependent",
				dependencies: ["dep-b1c-patch-dead"],
			});

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("dependency_killed");

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-b1c-patch-dependent"));
			expect(row?.state).toBe("proposed");
			expect(row?.dependencies).toBeNull();
		});

		test("depending on an already-done task stays legal (only killed is refused)", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b1c-done");
			await insertTask(db, "dep-b1c-done-finished", "dep-b1c-done", "done");

			const { status, json } = await editTask(app, {
				teamId: "dep-b1c-done",
				title: "Depends on a finished task",
				dependencies: ["dep-b1c-done-finished"],
			});

			expect(status).toBe(200);
			expect(json.data?.task.state).toBe("proposed");
		});
	});

	// ---------------------------------------------------------------------
	// `blocked -> in_progress` is a genuine resume, not a pick-up, and must
	// be unaffected by a dependency that was already there when the task was
	// first accepted.
	// ---------------------------------------------------------------------
	describe("the dependency guard narrows to the genuine pick-up path only", () => {
		test("blocked -> in_progress is allowed while a dependency is unfinished", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b2b-blocked");
			await insertTask(db, "dep-b2b-blocked-dep", "dep-b2b-blocked", "proposed");
			await insertTask(db, "dep-b2b-blocked-task", "dep-b2b-blocked", "blocked", [
				"dep-b2b-blocked-dep",
			]);

			const { status } = await editTask(app, {
				id: "dep-b2b-blocked-task",
				state: "in_progress",
			});

			expect(status).toBe(200);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-b2b-blocked-task"));
			expect(row?.state).toBe("in_progress");
		});

		test("review -> in_progress is refused while a dependency is unfinished", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b2b-review");
			await insertTask(db, "dep-b2b-review-dep", "dep-b2b-review", "proposed");
			await insertTask(db, "dep-b2b-review-task", "dep-b2b-review", "review", [
				"dep-b2b-review-dep",
			]);

			const { status, json } = await editTask(app, {
				id: "dep-b2b-review-task",
				state: "in_progress",
			});

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("dependency_blocked");
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-b2b-review-task"));
			expect(row?.state).toBe("review");
		});

		// @lore fixture injection doesn't compose with `test.each` (vitest) — see
		// AN1-connections.integration.test.ts's own note — so each transition
		// gets its own `test`, sharing one assertion helper instead of a table.
		async function expectStillRefused(
			db: HyperIdleDb,
			app: Hono,
			fromState: TaskState,
			toState: TaskState,
		): Promise<void> {
			const teamId = `dep-b2b-${fromState}-${toState}`;
			await seedTeam(db, teamId);
			await insertTask(db, `${teamId}-dep`, teamId, "proposed");
			await insertTask(db, `${teamId}-task`, teamId, fromState, [`${teamId}-dep`]);

			const { status, json } = await editTask(app, { id: `${teamId}-task`, state: toState });

			expect(status).toBe(422);
			expect(json.problems?.[0]?.code).toBe("dependency_blocked");
		}

		test("hold -> accepted is still refused with a problem naming the dependency", async ({
			db,
			app,
		}) => {
			await expectStillRefused(db, app, "hold", "accepted");
		});

		test("accepted -> in_progress is still refused with a problem naming the dependency", async ({
			db,
			app,
		}) => {
			await expectStillRefused(db, app, "accepted", "in_progress");
		});
	});

	// ---------------------------------------------------------------------
	// The live route walk. Two calls (`hold -> review`, then `review ->
	// in_progress`) must not reach `in_progress` with an unfinished
	// dependency still attached.
	// ---------------------------------------------------------------------
	describe("the hold -> review -> in_progress door is closed", () => {
		test("hold -> review succeeds, then review -> in_progress is refused, dependency still unfinished", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "dep-b1c3");
			await insertTask(db, "dep-b1c3-dep", "dep-b1c3", "proposed");
			await insertTask(db, "dep-b1c3-task", "dep-b1c3", "hold", ["dep-b1c3-dep"]);

			const toReview = await editTask(app, { id: "dep-b1c3-task", state: "review" });
			expect(toReview.status).toBe(200);

			const toInProgress = await editTask(app, { id: "dep-b1c3-task", state: "in_progress" });
			expect(toInProgress.status).toBe(422);
			expect(toInProgress.json.problems?.[0]?.code).toBe("dependency_blocked");

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "dep-b1c3-task"));
			expect(row?.state).toBe("review");
		});
	});
});
