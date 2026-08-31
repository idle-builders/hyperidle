/**
 * BB1 AC12 — Sibling ordering
 *
 * position is assigned on create (append), settable via PATCH /api/tasks/:id,
 * reassigned on reparent, and reachable through the edit_task agent tool.
 *
 * Each test here calls the REAL route — not a reimplemented copy of the logic.
 *
 * PROVE-CAN-FAIL notes are inline per test.
 */

import { tasks, teams } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "bb1-ordering-test-key";
const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("BB1 AC12 — sibling ordering", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// AC12-1: three siblings created in sequence → positions 0, 1, 2
	//
	// PROVE-CAN-FAIL: remove the position-assignment from the POST handler so
	// every task defaults to 0. The test fails on `expect(positions).toEqual([0,1,2])`.
	// -------------------------------------------------------------------------
	describe("create three siblings → positions 0, 1, 2", () => {
		test("each new subtask appends — position increases by one per sibling", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-create",
				name: "AC12 Create",
				phase: "build",
				createdAt: now,
			});

			const post = async (body: Record<string, unknown>): Promise<{ id: string; position: number }> => {
				const r = await app.request("/api/tasks", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(body),
				});
				expect(r.status).toBe(201);
				return (await r.json()) as { id: string; position: number };
			};

			const root = await post({ teamId: "ac12-team-create", title: "Root" });
			const a = await post({ parentTaskId: root.id, title: "Child A" });
			const b = await post({ parentTaskId: root.id, title: "Child B" });
			const c = await post({ parentTaskId: root.id, title: "Child C" });

			expect(a.position).toBe(0);
			expect(b.position).toBe(1);
			expect(c.position).toBe(2);

			// Also verify reads come back in position order via GET /tasks?parent_id=
			const listRes = await app.request(`/api/tasks?parent_id=${root.id}`, {
				headers: authHeaders(),
			});
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as Array<{ id: string; position: number }>;
			const ids = list.map((t) => t.id);
			expect(ids).toEqual([a.id, b.id, c.id]);
		});
	});

	// -------------------------------------------------------------------------
	// AC12-2: move the last sibling to position 0 → clean 0,1,2 renumber
	//
	// PROVE-CAN-FAIL: remove the renumber logic so moving a task just sets its
	// own position column without touching siblings. The sequence ends up with
	// collisions/gaps, and the id-order assertion fails.
	// -------------------------------------------------------------------------
	describe("move last sibling to position 0 → renumber to clean 0,1,2", () => {
		test("PATCH position renumbers all siblings with no gaps", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-reorder",
				name: "AC12 Reorder",
				phase: "build",
				createdAt: now,
			});

			const post = async (body: Record<string, unknown>): Promise<{ id: string; position: number }> => {
				const r = await app.request("/api/tasks", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(body),
				});
				expect(r.status).toBe(201);
				return (await r.json()) as { id: string; position: number };
			};

			const root = await post({ teamId: "ac12-team-reorder", title: "Root" });
			const a = await post({ parentTaskId: root.id, title: "Child A" });
			const b = await post({ parentTaskId: root.id, title: "Child B" });
			const c = await post({ parentTaskId: root.id, title: "Child C" });
			// a=0, b=1, c=2

			// Move C (last, position 2) to position 0
			const patchRes = await app.request(`/api/tasks/${c.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ position: 0 }),
			});
			expect(patchRes.status).toBe(200);
			const patched = (await patchRes.json()) as { id: string; position: number };
			expect(patched.position).toBe(0);

			// Read sibling list — must come back C, A, B (c first, then a, then b)
			const listRes = await app.request(`/api/tasks?parent_id=${root.id}`, {
				headers: authHeaders(),
			});
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as Array<{ id: string; position: number }>;
			expect(list.map((t) => t.id)).toEqual([c.id, a.id, b.id]);
			// Positions are a clean 0..2 sequence
			expect(list.map((t) => t.position)).toEqual([0, 1, 2]);
		});
	});

	// -------------------------------------------------------------------------
	// AC12-3: reparent a task → lands last under new parent, no collision
	//
	// PROVE-CAN-FAIL: remove the "assign last position on reparent" logic so
	// the task keeps its old position. If the old position collides with an
	// existing sibling, the `noCollision` assertion (unique positions) fails.
	// -------------------------------------------------------------------------
	describe("reparent → task lands last under new parent, no collision", () => {
		test("moved task has position > every existing sibling in new parent", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-reparent",
				name: "AC12 Reparent",
				phase: "build",
				createdAt: now,
			});

			const post = async (body: Record<string, unknown>): Promise<{ id: string; position: number }> => {
				const r = await app.request("/api/tasks", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(body),
				});
				expect(r.status).toBe(201);
				return (await r.json()) as { id: string; position: number };
			};

			// Parent A with two children (positions 0, 1)
			const parentA = await post({ teamId: "ac12-team-reparent", title: "Parent A" });
			const a1 = await post({ parentTaskId: parentA.id, title: "A-Child 1" });
			const a2 = await post({ parentTaskId: parentA.id, title: "A-Child 2" });
			expect(a1.position).toBe(0);
			expect(a2.position).toBe(1);

			// Parent B with one child (position 0)
			const parentB = await post({ teamId: "ac12-team-reparent", title: "Parent B" });
			const b1 = await post({ parentTaskId: parentB.id, title: "B-Child 1" });
			expect(b1.position).toBe(0);

			// Reparent a1 from Parent A → Parent B
			const patchRes = await app.request(`/api/tasks/${a1.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ parentTaskId: parentB.id }),
			});
			expect(patchRes.status).toBe(200);
			const moved = (await patchRes.json()) as { id: string; position: number; parentTaskId: string };
			expect(moved.parentTaskId).toBe(parentB.id);

			// The moved task must be last under Parent B
			const bListRes = await app.request(`/api/tasks?parent_id=${parentB.id}`, {
				headers: authHeaders(),
			});
			expect(bListRes.status).toBe(200);
			const bList = (await bListRes.json()) as Array<{ id: string; position: number }>;
			const bPositions = bList.map((t) => t.position);
			const movedRow = bList.find((t) => t.id === a1.id);
			expect(movedRow).toBeDefined();
			// No two siblings share the same position
			const unique = new Set(bPositions);
			expect(unique.size).toBe(bList.length);
			// The moved task has the highest position (it's last)
			expect(movedRow!.position).toBe(Math.max(...bPositions));
		});
	});

	// -------------------------------------------------------------------------
	// AC12-4: an agent setting `position` through PATCH produces the identical
	// result as a human
	//
	// PROVE-CAN-FAIL: gate position writes on a role check so agents get 403.
	// The agentPatch.status assertion fails.
	// -------------------------------------------------------------------------
	describe("agent position via PATCH — same door, same result", () => {
		test("agent PATCH with position produces identical renumber as human PATCH", async ({
			db,
			app,
		}) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-agent",
				name: "AC12 Agent",
				phase: "build",
				createdAt: now,
			});

			const post = async (body: Record<string, unknown>): Promise<{ id: string; position: number }> => {
				const r = await app.request("/api/tasks", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(body),
				});
				expect(r.status).toBe(201);
				return (await r.json()) as { id: string; position: number };
			};

			// Group 1: human reorders — create three siblings, move the last to front
			const rH = await post({ teamId: "ac12-team-agent", title: "Human Root" });
			await post({ parentTaskId: rH.id, title: "H-A" }); // position 0
			await post({ parentTaskId: rH.id, title: "H-B" }); // position 1
			const hC = await post({ parentTaskId: rH.id, title: "H-C" }); // position 2

			// Group 2: agent reorders — identical shape
			const rAg = await post({ teamId: "ac12-team-agent", title: "Agent Root" });
			await post({ parentTaskId: rAg.id, title: "Ag-A" }); // position 0
			await post({ parentTaskId: rAg.id, title: "Ag-B" }); // position 1
			const agC = await post({ parentTaskId: rAg.id, title: "Ag-C" }); // position 2

			// Human moves hC to position 0
			const humanPatch = await app.request(`/api/tasks/${hC.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ position: 0 }),
			});
			expect(humanPatch.status).toBe(200);

			// Agent (actor-override header) moves agC to position 0
			const agentPatch = await app.request(`/api/tasks/${agC.id}`, {
				method: "PATCH",
				headers: authHeaders({ [ACTOR_OVERRIDE_HEADER]: "agent-user-ac12" }),
				body: JSON.stringify({ position: 0 }),
			});
			expect(agentPatch.status).toBe(200);

			// Read both lists and assert identical position sequences
			const humanListRes = await app.request(`/api/tasks?parent_id=${rH.id}`, { headers: authHeaders() });
			const humanList = (await humanListRes.json()) as Array<{ id: string; position: number }>;
			const agentListRes = await app.request(`/api/tasks?parent_id=${rAg.id}`, { headers: authHeaders() });
			const agentList = (await agentListRes.json()) as Array<{ id: string; position: number }>;

			// Human: [hC, hA, hB] at positions [0, 1, 2]
			expect(humanList.map((t) => t.position)).toEqual([0, 1, 2]);
			expect(humanList[0]?.id).toBe(hC.id);

			// Agent: same relative order [agC, agA, agB] at positions [0, 1, 2]
			expect(agentList.map((t) => t.position)).toEqual([0, 1, 2]);
			expect(agentList[0]?.id).toBe(agC.id);
		});
	});

	// -------------------------------------------------------------------------
	// AC12-5: reads come back in position order
	//
	// PROVE-CAN-FAIL: remove the position column from the ORDER BY clause in
	// list(). The order falls through to createdAt, which is all the same
	// timestamp in tests that seed via direct DB insert (not real). For API-
	// created tasks it becomes creation order anyway, so to prove orderBy is
	// position-driven: set positions out of creation order via DB and verify.
	// -------------------------------------------------------------------------
	describe("reads are ordered by position", () => {
		test("direct-DB position assignment determines list order", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-order",
				name: "AC12 Order",
				phase: "build",
				createdAt: now,
			});

			// Seed a root with three children whose positions are out of insertion order
			await db.insert(tasks).values({
				id: "ac12-order-root",
				parentTaskId: null,
				teamId: "ac12-team-order",
				title: "Root",
				state: "proposed",
				position: 0,
				createdAt: now,
				updatedAt: now,
			});
			// Insert in reversed position order to prove ORDER BY position, not insertion
			await db.insert(tasks).values([
				{
					id: "ac12-order-c",
					parentTaskId: "ac12-order-root",
					teamId: "ac12-team-order",
					title: "C",
					state: "proposed",
					position: 2,
					createdAt: now,
					updatedAt: now,
				},
				{
					id: "ac12-order-a",
					parentTaskId: "ac12-order-root",
					teamId: "ac12-team-order",
					title: "A",
					state: "proposed",
					position: 0,
					createdAt: now,
					updatedAt: now,
				},
				{
					id: "ac12-order-b",
					parentTaskId: "ac12-order-root",
					teamId: "ac12-team-order",
					title: "B",
					state: "proposed",
					position: 1,
					createdAt: now,
					updatedAt: now,
				},
			]);

			const listRes = await app.request(`/api/tasks?parent_id=ac12-order-root`, {
				headers: authHeaders(),
			});
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as Array<{ id: string }>;
			expect(list.map((t) => t.id)).toEqual(["ac12-order-a", "ac12-order-b", "ac12-order-c"]);
		});
	});

	// -------------------------------------------------------------------------
	// needsReview field tests
	//
	// PROVE-CAN-FAIL: remove `needsReview` from patchTaskSchema so the PATCH
	// returns 400 (strict schema rejects unknown key). The flip test fails.
	// -------------------------------------------------------------------------
	describe("needsReview field — settable on create and via PATCH, same door for agent and human", () => {
		test("task created with needsReview: true reads back true", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-nr-create",
				name: "NeedsReview Create",
				phase: "build",
				createdAt: now,
			});
			const createRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "ac12-team-nr-create", title: "Review task", needsReview: true }),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string; needsReview: boolean };
			expect(created.needsReview).toBe(true);

			// And false by default
			const createDefaultRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "ac12-team-nr-create", title: "Default task" }),
			});
			expect(createDefaultRes.status).toBe(201);
			const defaultTask = (await createDefaultRes.json()) as { needsReview: boolean };
			expect(defaultTask.needsReview).toBe(false);
		});

		test("PATCH flips needsReview both ways and persists", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-nr-patch",
				name: "NeedsReview Patch",
				phase: "build",
				createdAt: now,
			});
			const createRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "ac12-team-nr-patch", title: "Flip task" }),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string; needsReview: boolean };
			expect(created.needsReview).toBe(false);

			// Flip to true
			const patchTrueRes = await app.request(`/api/tasks/${created.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ needsReview: true }),
			});
			expect(patchTrueRes.status).toBe(200);
			const afterTrue = (await patchTrueRes.json()) as { needsReview: boolean };
			expect(afterTrue.needsReview).toBe(true);

			// Flip back to false
			const patchFalseRes = await app.request(`/api/tasks/${created.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ needsReview: false }),
			});
			expect(patchFalseRes.status).toBe(200);
			const afterFalse = (await patchFalseRes.json()) as { needsReview: boolean };
			expect(afterFalse.needsReview).toBe(false);
		});

		test("agent PATCH needsReview produces same result as human PATCH", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "ac12-team-nr-agent",
				name: "NeedsReview Agent",
				phase: "build",
				createdAt: now,
			});
			const post = async (body: Record<string, unknown>): Promise<{ id: string }> => {
				const r = await app.request("/api/tasks", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(body),
				});
				expect(r.status).toBe(201);
				return (await r.json()) as { id: string };
			};

			const humanTask = await post({ teamId: "ac12-team-nr-agent", title: "Human NR task" });
			const agentTask = await post({ teamId: "ac12-team-nr-agent", title: "Agent NR task" });

			// Human sets needsReview: true
			const humanPatch = await app.request(`/api/tasks/${humanTask.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ needsReview: true }),
			});
			expect(humanPatch.status).toBe(200);
			const humanResult = (await humanPatch.json()) as { needsReview: boolean };
			expect(humanResult.needsReview).toBe(true);

			// Agent sets needsReview: true (actor-override header simulates agent)
			const agentPatch = await app.request(`/api/tasks/${agentTask.id}`, {
				method: "PATCH",
				headers: authHeaders({ [ACTOR_OVERRIDE_HEADER]: "agent-user-nr" }),
				body: JSON.stringify({ needsReview: true }),
			});
			expect(agentPatch.status).toBe(200);
			const agentResult = (await agentPatch.json()) as { needsReview: boolean };
			expect(agentResult.needsReview).toBe(true);
		});
	});
});
