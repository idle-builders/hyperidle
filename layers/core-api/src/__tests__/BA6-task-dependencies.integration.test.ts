/**
 * BA6 RED — "Tasks wait for the tasks they depend on, then start themselves".
 *
 * Covers, against the real `{ db, app, eventBus }` fixtures:
 *   - AC1 (human doors): POST /tasks and PATCH /tasks/:id both accept
 *     `dependencies` and validate it on write.
 *   - AC2 (the enforcing half): `transitionTask` itself refuses a move to
 *     `accepted` while an unfinished dependency remains — proven directly
 *     against the function, not only through the route.
 *   - AC5: a dependency cycle, a self-dependency, and a dependency naming a
 *     task that does not exist are all refused with a message identifying
 *     the rule.
 *   - "Decided without asking": a dependency may point at a task under any
 *     root — no restriction.
 *
 * `dependencies` crosses the wire as `string[]` on the request bodies below —
 * storage stays the same JSON-text column, encoded/decoded at the route.
 */

import { type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import { getAgentIdentity } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { requireRunnableAgent } from "@hyperidle/users";
import type { TaskStateMachineDeps } from "@hyperidle/work";
import { transitionTask } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ba6-deps";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const testDeps: TaskStateMachineDeps = {
	workIntents: async () => ({ id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
	taskRunResolver: { requireRunnableAgent, getAgentIdentity },
	teamCapacity: { getByTeamId: (exec, teamId) => getTeam(exec, { id: teamId }) },
};

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: teamId, name: `Team ${teamId}`, phase: "build", createdAt: now });
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	state: TaskState,
	dependencies?: string[],
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
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

describe("BA6: task dependencies — write doors, guard, cycle rejection", () => {
	// ---------------------------------------------------------------------
	// AC1: create door
	// ---------------------------------------------------------------------
	describe("AC1: POST /tasks accepts dependencies", () => {
		test("creates a task carrying dependencies and parks it while the dependency is unfinished", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-t1");
			await insertTask(db, "ba6-dep-1", "ba6-t1", "in_progress");

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "ba6-t1",
					title: "Depends on dep-1",
					dependencies: ["ba6-dep-1"],
				}),
			});

			expect(res.status).toBe(201);
			const created = (await res.json()) as { id: string };
			const [row] = await db.select().from(tasks).where(eq(tasks.id, created.id));
			expect(row?.dependencies).toBe(JSON.stringify(["ba6-dep-1"]));
			expect(row?.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// AC1 (edit door) + "no restriction on where a dependency points"
	// ---------------------------------------------------------------------
	describe("AC1: PATCH /tasks/:id accepts dependencies and parks the task", () => {
		test("a dependency may point at a task under a DIFFERENT root — no restriction", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-t2");
			// Two separate root tasks — different trees.
			await insertTask(db, "ba6-root-a", "ba6-t2", "in_progress");
			await insertTask(db, "ba6-root-b", "ba6-t2", "in_progress");
			// The dependency lives under root-b; the dependent lives under root-a.
			await insertTask(db, "ba6-cross-dep", "ba6-t2", "in_progress");
			await insertTask(db, "ba6-dependent", "ba6-t2", "proposed");

			const res = await app.request("/api/tasks/ba6-dependent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-cross-dep"] }),
			});

			expect(res.status).toBe(200);
			const updated = (await res.json()) as { state: string; dependencies: string | null };
			expect(updated.dependencies).toBe(JSON.stringify(["ba6-cross-dep"]));
			expect(updated.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// AC2: the enforcing half — direct against transitionTask
	// ---------------------------------------------------------------------
	describe("AC2: transitionTask refuses accepted while a dependency is unfinished", () => {
		test("hold -> accepted is refused while a named dependency is not done", async ({
			db,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-t3");
			await insertTask(db, "ba6-guard-dep", "ba6-t3", "in_progress");
			await insertTask(db, "ba6-guard-dependent", "ba6-t3", "hold", ["ba6-guard-dep"]);

			await expect(
				transitionTask(db, eventBus, "ba6-guard-dependent", "accepted", testDeps),
			).rejects.toThrow();

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-guard-dependent"));
			expect(row?.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// AC5: cycle / self-dependency / dangling dependency rejection
	// ---------------------------------------------------------------------
	describe("AC5: dependency cycles and invalid dependencies are refused", () => {
		test("a cycle (A depends on B, B depends on A) is refused with a message naming the rule", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-t4");
			await insertTask(db, "ba6-cycle-a", "ba6-t4", "proposed");
			await insertTask(db, "ba6-cycle-b", "ba6-t4", "proposed");

			// B depends on A first — legal on its own.
			const first = await app.request("/api/tasks/ba6-cycle-b", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-cycle-a"] }),
			});
			expect(first.status).toBe(200);

			// Now A depends on B — closes the loop.
			const res = await app.request("/api/tasks/ba6-cycle-a", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-cycle-b"] }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as { error: string; code: string };
			expect(body.error.toLowerCase()).toContain("cycle");
			expect(body.code).toBe("TASK_CYCLE");
		});

		test("a task cannot depend on itself", async ({ db, app }) => {
			await seedTeam(db, "ba6-t5");
			await insertTask(db, "ba6-self", "ba6-t5", "proposed");

			const res = await app.request("/api/tasks/ba6-self", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-self"] }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("TASK_CYCLE");
		});

		test("a dependency naming a task that does not exist is refused", async ({ db, app }) => {
			await seedTeam(db, "ba6-t6");
			await insertTask(db, "ba6-dangling", "ba6-t6", "proposed");

			const res = await app.request("/api/tasks/ba6-dangling", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-does-not-exist"] }),
			});

			expect(res.status).toBe(404);
		});
	});

	// ---------------------------------------------------------------------
	// "Decided without asking": dependencies gate being picked up; a task
	// already in progress is not rewound by a later dependencies write.
	// ---------------------------------------------------------------------
	describe("a task already in_progress is not rewound by a later dependencies write", () => {
		test("PATCH dependencies on an in_progress task leaves it in_progress", async ({ db, app }) => {
			await seedTeam(db, "ba6-t8");
			await insertTask(db, "ba6-unfinished-dep", "ba6-t8", "in_progress");
			await insertTask(db, "ba6-running", "ba6-t8", "in_progress");

			const res = await app.request("/api/tasks/ba6-running", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-unfinished-dep"] }),
			});

			expect(res.status).toBe(200);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-running"));
			expect(row?.state).toBe("in_progress");
			expect(row?.dependencies).toBe(JSON.stringify(["ba6-unfinished-dep"]));
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
			await seedTeam(db, "ba6-t7");
			await insertTask(db, "ba6-killable", "ba6-t7", "in_progress");
			await insertTask(db, "ba6-still-unfinished", "ba6-t7", "in_progress");
			await insertTask(db, "ba6-dependent-of-killed", "ba6-t7", "hold", [
				"ba6-killable",
				"ba6-still-unfinished",
			]);

			const res = await app.request("/api/tasks/ba6-killable", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "killed" }),
			});
			expect(res.status).toBe(200);

			const [dependent] = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, "ba6-dependent-of-killed"));
			expect(dependent?.state).toBe("proposed");
			expect(JSON.parse(dependent?.dependencies ?? "[]")).toEqual(["ba6-still-unfinished"]);
		});
	});

	// ---------------------------------------------------------------------
	// B1 (fix round) — the edit panel's PATCH body always includes `state`,
	// set to the task's OWN current value (the form submits every field it
	// renders, including the unchanged state dropdown). Parking must not
	// require `state` to be absent — only that it isn't an actual CHANGE.
	// ---------------------------------------------------------------------
	describe("B1: the edit-panel PATCH body (state included, unchanged) still parks", () => {
		test("PATCH carrying the SAME state plus an unfinished dependency parks the task", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-b1a");
			await insertTask(db, "ba6-b1a-dep", "ba6-b1a", "proposed");
			await insertTask(db, "ba6-b1a-dependent", "ba6-b1a", "proposed");

			// Exactly what WorkTaskPage's edit panel sends: every field it
			// renders, including `state` set to the value it already has.
			const res = await app.request("/api/tasks/ba6-b1a-dependent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "proposed", dependencies: ["ba6-b1a-dep"] }),
			});

			expect(res.status).toBe(200);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b1a-dependent"));
			expect(row?.state).toBe("hold");
		});
	});

	// ---------------------------------------------------------------------
	// B1 (fix round), second half — the guard must also cover `-> in_progress`,
	// not only `-> accepted`. A task can reach `accepted` still carrying an
	// unfinished dependency (e.g. dependencies added to an already-`accepted`
	// task), and `accepted -> in_progress` is otherwise a legal edge.
	// ---------------------------------------------------------------------
	describe("B1: transitionTask also refuses accepted -> in_progress while a dependency is unfinished", () => {
		test("an accepted task holding an unfinished dependency cannot move to in_progress", async ({
			db,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-b1b");
			await insertTask(db, "ba6-b1b-dep", "ba6-b1b", "proposed");
			// Directly seeded `accepted` carrying an unfinished dependency — the
			// state the reviewer showed is reachable despite the parking guard
			// (e.g. a race, or dependencies attached while already accepted).
			await insertTask(db, "ba6-b1b-dependent", "ba6-b1b", "accepted", ["ba6-b1b-dep"]);

			await expect(
				transitionTask(db, eventBus, "ba6-b1b-dependent", "in_progress", testDeps),
			).rejects.toThrow();

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b1b-dependent"));
			expect(row?.state).toBe("accepted");
		});
	});

	// ---------------------------------------------------------------------
	// B2 (fix round) — a dependent that is NOT in `hold` still carries the
	// killed dependency's id forever under the old `state = 'hold'`-only
	// filter, which permanently bricks it (the next `-> accepted` throws
	// `Invalid transition`, since the guard above now also checks the stale
	// id). The id must be dropped from a dependent in ANY state.
	// ---------------------------------------------------------------------
	describe("B2: a killed dependency drops its id from a dependent that is NOT in hold", () => {
		test("a `proposed` dependent loses the killed id and stays acceptable afterward", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-b2");
			await insertTask(db, "ba6-b2-killable", "ba6-b2", "done");
			// F: proposed, not hold — created after E already finished, so it was
			// never parked; it still carries E's id.
			await insertTask(db, "ba6-b2-dependent", "ba6-b2", "proposed", ["ba6-b2-killable"]);

			const res = await app.request("/api/tasks/ba6-b2-killable", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "killed" }),
			});
			expect(res.status).toBe(200);

			const [dependent] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b2-dependent"));
			// Not rewound — it was never waiting.
			expect(dependent?.state).toBe("proposed");
			// The stale id is gone, not left behind to brick every future accept.
			expect(JSON.parse(dependent?.dependencies ?? "[]")).toEqual([]);

			// Proof it isn't bricked: accepting it now succeeds.
			await expect(
				transitionTask(db, eventBus, "ba6-b2-dependent", "accepted", testDeps),
			).resolves.not.toThrow();
		});
	});

	// ---------------------------------------------------------------------
	// B1 (second fix round) — the killed-dependency rule was only implemented
	// for one ordering: kill a task dependents already point at, and the
	// cleanup runs. Point a NEW dependency at a task that is ALREADY killed
	// and nothing catches it. Refused at write time, on both doors.
	// ---------------------------------------------------------------------
	describe("B1: a dependency naming an already-killed task is refused on both doors", () => {
		test("POST /tasks refuses a dependency naming an already-killed task", async ({ db, app }) => {
			await seedTeam(db, "ba6-b1c-post");
			await insertTask(db, "ba6-b1c-post-dead", "ba6-b1c-post", "killed");

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "ba6-b1c-post",
					title: "Depends on a corpse",
					dependencies: ["ba6-b1c-post-dead"],
				}),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as { error: string; code: string };
			expect(body.error.toLowerCase()).toContain("killed");
			expect(body.code).toBe("TASK_DEPENDENCY_KILLED");
		});

		test("PATCH /tasks/:id refuses a dependency naming an already-killed task", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-b1c-patch");
			await insertTask(db, "ba6-b1c-patch-dead", "ba6-b1c-patch", "killed");
			await insertTask(db, "ba6-b1c-patch-dependent", "ba6-b1c-patch", "proposed");

			const res = await app.request("/api/tasks/ba6-b1c-patch-dependent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: ["ba6-b1c-patch-dead"] }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as { error: string; code: string };
			expect(body.error.toLowerCase()).toContain("killed");
			expect(body.code).toBe("TASK_DEPENDENCY_KILLED");

			// Refused — the dependent must not have been parked on the dead id.
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b1c-patch-dependent"));
			expect(row?.state).toBe("proposed");
			expect(row?.dependencies).toBeNull();
		});

		test("depending on an already-done task stays legal (only killed is refused)", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-b1c-done");
			await insertTask(db, "ba6-b1c-done-finished", "ba6-b1c-done", "done");

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "ba6-b1c-done",
					title: "Depends on a finished task",
					dependencies: ["ba6-b1c-done-finished"],
				}),
			});

			expect(res.status).toBe(201);
			const created = (await res.json()) as { id: string; state: string };
			// A finished dependency does not park the task.
			expect(created.state).toBe("proposed");
		});
	});

	// ---------------------------------------------------------------------
	// B2 (second fix round) — the guard refused `-> in_progress` from ANY
	// source while a dependency was unfinished, including `blocked`. That is a
	// genuine resume, not a pick-up, and must be unaffected by a dependency
	// that was already there when the task was first accepted. `review` was
	// ALSO exempted in that same round — wrongly, per the B1 fix (round 3):
	// `review` is reachable from `proposed`/`accepted`/`hold`, none of which
	// prove the task was ever worked, so it stays gated like `accepted`. Only
	// `blocked` (reachable exclusively from `in_progress`) proves a genuine
	// prior pick-up.
	// ---------------------------------------------------------------------
	describe("B2: the dependency guard narrows to the genuine pick-up path only", () => {
		test("blocked -> in_progress is allowed while a dependency is unfinished", async ({
			db,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-b2b-blocked");
			await insertTask(db, "ba6-b2b-blocked-dep", "ba6-b2b-blocked", "proposed");
			await insertTask(db, "ba6-b2b-blocked-task", "ba6-b2b-blocked", "blocked", [
				"ba6-b2b-blocked-dep",
			]);

			await expect(
				transitionTask(db, eventBus, "ba6-b2b-blocked-task", "in_progress", testDeps),
			).resolves.not.toThrow();

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b2b-blocked-task"));
			expect(row?.state).toBe("in_progress");
		});

		// @lore BA6 (fix round 2, B1): this test used to assert the OPPOSITE —
		// "review -> in_progress is allowed while a dependency is unfinished" —
		// which encoded the hole itself as intended behaviour. `review` is
		// reachable from `proposed`, `accepted` AND `hold` (see
		// `TASK_STATE_TRANSITIONS`), none of which prove the task was ever
		// worked, unlike `blocked` (reachable only from `in_progress`). Corrected
		// to assert the refusal; see the live-route walk below for the door this
		// closes end to end.
		test("review -> in_progress is refused while a dependency is unfinished", async ({
			db,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-b2b-review");
			await insertTask(db, "ba6-b2b-review-dep", "ba6-b2b-review", "proposed");
			await insertTask(db, "ba6-b2b-review-task", "ba6-b2b-review", "review", [
				"ba6-b2b-review-dep",
			]);

			await expect(
				transitionTask(db, eventBus, "ba6-b2b-review-task", "in_progress", testDeps),
			).rejects.toThrow(/unfinished dependency/);

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b2b-review-task"));
			expect(row?.state).toBe("review");
		});

		test("-> accepted is still refused with a message naming the dependency", async ({
			db,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-b2b-accepted");
			await insertTask(db, "ba6-b2b-accepted-dep", "ba6-b2b-accepted", "proposed");
			await insertTask(db, "ba6-b2b-accepted-task", "ba6-b2b-accepted", "hold", [
				"ba6-b2b-accepted-dep",
			]);

			await expect(
				transitionTask(db, eventBus, "ba6-b2b-accepted-task", "accepted", testDeps),
			).rejects.toThrow(/unfinished dependency/);
		});

		test("accepted -> in_progress is still refused with a message naming the dependency", async ({
			db,
			eventBus,
		}) => {
			await seedTeam(db, "ba6-b2b-accepted2");
			await insertTask(db, "ba6-b2b-accepted2-dep", "ba6-b2b-accepted2", "proposed");
			await insertTask(db, "ba6-b2b-accepted2-task", "ba6-b2b-accepted2", "accepted", [
				"ba6-b2b-accepted2-dep",
			]);

			await expect(
				transitionTask(db, eventBus, "ba6-b2b-accepted2-task", "in_progress", testDeps),
			).rejects.toThrow(/unfinished dependency/);
		});
	});

	// ---------------------------------------------------------------------
	// B1 (fix round 3) — the live route walk. Two clicks in the shipped state
	// dropdown (`hold -> review`, then `review -> in_progress`) reached
	// `in_progress` with an unfinished dependency, because `review ->
	// in_progress` was unguarded. Drives the real PATCH door end to end rather
	// than calling `transitionTask` directly, since a direct-call test alone
	// would not have caught this — the hole was two hops from `hold`, not one.
	// ---------------------------------------------------------------------
	describe("B1 (fix round 3): the hold -> review -> in_progress door is closed", () => {
		test("hold -> review succeeds, then review -> in_progress is refused, dependency still unfinished", async ({
			db,
			app,
		}) => {
			await seedTeam(db, "ba6-b1c3");
			await insertTask(db, "ba6-b1c3-dep", "ba6-b1c3", "proposed");
			await insertTask(db, "ba6-b1c3-task", "ba6-b1c3", "hold", ["ba6-b1c3-dep"]);

			const toReview = await app.request("/api/tasks/ba6-b1c3-task", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "review" }),
			});
			expect(toReview.status).toBe(200);

			const toInProgress = await app.request("/api/tasks/ba6-b1c3-task", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "in_progress" }),
			});
			expect(toInProgress.status).toBe(409);
			const body = (await toInProgress.json()) as { code?: string };
			expect(body.code).toBe("TASK_DEPENDENCY_BLOCKED");

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "ba6-b1c3-task"));
			expect(row?.state).toBe("review");
		});
	});
});
