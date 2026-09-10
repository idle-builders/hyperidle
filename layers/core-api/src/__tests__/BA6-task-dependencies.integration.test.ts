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
 * @lore BA6 assumption: the wire shape for `dependencies` stays the SAME
 * JSON-encoded string the (currently unreachable) PATCH field already
 * declares (`UpdateTaskRequest.dependencies?: string | null`) — every array
 * value below is `JSON.stringify([...ids])`. The plan says "a list of task
 * ids" but does not commit to an array-typed wire shape; reusing the
 * existing string type is the smaller diff across all four doors. Flagged
 * for the green phase / reviewer to confirm.
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
					dependencies: JSON.stringify(["ba6-dep-1"]),
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
				body: JSON.stringify({ dependencies: JSON.stringify(["ba6-cross-dep"]) }),
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
				body: JSON.stringify({ dependencies: JSON.stringify(["ba6-cycle-a"]) }),
			});
			expect(first.status).toBe(200);

			// Now A depends on B — closes the loop.
			const res = await app.request("/api/tasks/ba6-cycle-a", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: JSON.stringify(["ba6-cycle-b"]) }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as { error: string };
			expect(body.error.toLowerCase()).toContain("cycle");
		});

		test("a task cannot depend on itself", async ({ db, app }) => {
			await seedTeam(db, "ba6-t5");
			await insertTask(db, "ba6-self", "ba6-t5", "proposed");

			const res = await app.request("/api/tasks/ba6-self", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: JSON.stringify(["ba6-self"]) }),
			});

			expect(res.status).toBe(409);
		});

		test("a dependency naming a task that does not exist is refused", async ({ db, app }) => {
			await seedTeam(db, "ba6-t6");
			await insertTask(db, "ba6-dangling", "ba6-t6", "proposed");

			const res = await app.request("/api/tasks/ba6-dangling", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ dependencies: JSON.stringify(["ba6-does-not-exist"]) }),
			});

			expect(res.status).toBe(404);
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
});
