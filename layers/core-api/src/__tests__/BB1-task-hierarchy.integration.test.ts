/**
 * BB1 acceptance criteria:
 *
 * AC1: A task can be created with a `parentTaskId`, and that task can itself
 *      parent another, to at least 4 levels. Reading a root returns its full
 *      subtree in the right shape.
 *
 * AC7: `PATCH /tasks/:id` edits title, description, done condition, owner and
 *      dependencies. The identical request succeeds whether the actor is a
 *      human or an agent. No status gate, no role gate, no approval gate.
 *      Assert an agent may edit a task in a non-`proposed` state.
 */

import { tasks, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "bb1-hierarchy-test-key";
const ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("BB1 — task hierarchy", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// Regression — found by clicking through the real app, not by a test.
	describe("PATCH with an unchanged state is a no-op, not a conflict", () => {
		test("saving a field while resubmitting the current state succeeds", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "bb1-team-nostate", name: "NoState", phase: "build", createdAt: now });
			const created = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "bb1-team-nostate", title: "before" }),
			});
			const task = (await created.json()) as { id: string; state: string };

			// The edit form submits every field it renders, including the state
			// dropdown — so an unchanged state arrives on every save. This used to
			// 409 with `proposed -> proposed`, which killed the whole save.
			const res = await app.request(`/api/tasks/${task.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "after", state: task.state }),
			});
			expect(res.status).toBe(200);
			const updated = (await res.json()) as { title: string; state: string };
			expect(updated.title).toBe("after");
			expect(updated.state).toBe(task.state);
		});

		test("a genuine state change still goes through the state machine", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "bb1-team-realstate", name: "RealState", phase: "build", createdAt: now });
			const created = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "bb1-team-realstate", title: "t" }),
			});
			const task = (await created.json()) as { id: string };

			const ok = await app.request(`/api/tasks/${task.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(ok.status).toBe(200);
			expect(((await ok.json()) as { state: string }).state).toBe("accepted");

			// And an ILLEGAL change is still refused — the no-op shortcut must not
			// have become a way around the machine.
			const bad = await app.request(`/api/tasks/${task.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "killed" }),
			});
			expect(bad.status).toBe(200); // accepted -> killed is legal
			const illegal = await app.request(`/api/tasks/${task.id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "in_progress" }),
			});
			expect(illegal.status).toBe(409); // killed -> in_progress is not
		});
	});

	// AC5 — token rollup, THROUGH THE ROUTE
	//
	// @lore BB1: the service-level AC5 test reimplemented the summation in its
	// own test body, so it stayed green while the shipped route returned null for
	// every real row (`sumTokensActual` summed top-level numbers, but the stored
	// shape is the nested `{byTier:{tier:{prompt,completion}}}` that
	// `work-session-end-reactions.ts` writes). A rollup test that does not call
	// the rollup proves nothing — this one asks the route.
	describe("AC5 — subtree token rollup via GET /tasks/:id/tree", () => {
		test("sums a leaf's real nested TokenUsage onto an ancestor, writing no ancestor row", async ({
			db,
			app,
		}) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "bb1-team-roll", name: "Rollup Team", phase: "build", createdAt: now });
			const post = async (body: Record<string, unknown>): Promise<{ id: string }> => {
				const r = await app.request("/api/tasks", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(body),
				});
				expect(r.status).toBe(201);
				return (await r.json()) as { id: string };
			};
			const root = await post({ teamId: "bb1-team-roll", title: "rollup root" });
			const leaf = await post({ parentTaskId: root.id, title: "rollup leaf" });

			// The exact shape work-session-end-reactions.ts persists.
			await db
				.update(tasks)
				.set({
					tokensActualJson: JSON.stringify({
						byTier: { high: { prompt: 100, completion: 50 } },
					}),
				})
				.where(eq(tasks.id, leaf.id));

			const res = await app.request(`/api/tasks/${root.id}/tree`, { headers: authHeaders() });
			expect(res.status).toBe(200);
			const tree = (await res.json()) as { tokensActualRollup: number | null };
			expect(tree.tokensActualRollup).toBe(150);

			// No ancestor row was written — the total is derived, never stored.
			const [rootRow] = await db
				.select({ tokensActualJson: tasks.tokensActualJson })
				.from(tasks)
				.where(eq(tasks.id, root.id))
				.limit(1);
			expect(rootRow?.tokensActualJson).toBeNull();
		});
	});

	// AC1 — 4-level deep task chain via API; subtree tree read
	// -------------------------------------------------------------------------
	describe("AC1 — 4-level nested tasks, subtree read", () => {
		test("creates 4-deep chain and reads the full subtree from root", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "bb1-team", name: "BB1 Team", phase: "build", createdAt: now });

			// Level 1 — root (no parentTaskId)
			const l1Res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "bb1-team", title: "Level 1 root" }),
			});
			expect(l1Res.status).toBe(201);
			const l1 = (await l1Res.json()) as { id: string };
			expect(l1.id).toBeTruthy();

			// Level 2
			const l2Res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ parentTaskId: l1.id, title: "Level 2 child" }),
			});
			expect(l2Res.status).toBe(201);
			const l2 = (await l2Res.json()) as { id: string };

			// Level 3
			const l3Res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ parentTaskId: l2.id, title: "Level 3 grandchild" }),
			});
			expect(l3Res.status).toBe(201);
			const l3 = (await l3Res.json()) as { id: string };

			// Level 4
			const l4Res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ parentTaskId: l3.id, title: "Level 4 great-grandchild" }),
			});
			expect(l4Res.status).toBe(201);
			const l4 = (await l4Res.json()) as { id: string };

			// Read the full subtree from root
			const treeRes = await app.request(`/api/tasks/${l1.id}/tree`, { headers: authHeaders() });
			expect(treeRes.status).toBe(200);
			const tree = (await treeRes.json()) as {
				task: { id: string };
				ancestors: { id: string }[];
				children: { id: string; children: { id: string; children: { id: string }[] }[] }[];
			};

			// Root task
			expect(tree.task.id).toBe(l1.id);
			// Root has no ancestors
			expect(tree.ancestors).toHaveLength(0);
			// Root has one direct child (level 2)
			expect(tree.children).toHaveLength(1);
			expect(tree.children[0]?.id).toBe(l2.id);
			// Level 2 has one child (level 3)
			expect(tree.children[0]?.children).toHaveLength(1);
			expect(tree.children[0]?.children[0]?.id).toBe(l3.id);
			// Level 3 has one child (level 4)
			expect(tree.children[0]?.children[0]?.children).toHaveLength(1);
			expect(tree.children[0]?.children[0]?.children[0]?.id).toBe(l4.id);
		});

		test("teamId is inherited from parent when omitted", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "bb1-team-inh", name: "Inherit Team", phase: "build", createdAt: now });

			const rootRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "bb1-team-inh", title: "Root" }),
			});
			expect(rootRes.status).toBe(201);
			const root = (await rootRes.json()) as { id: string; teamId: string };

			const childRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ parentTaskId: root.id, title: "Child (no teamId)" }),
			});
			expect(childRes.status).toBe(201);
			const child = (await childRes.json()) as { id: string; teamId: string };
			// Child inherits teamId from root
			expect(child.teamId).toBe("bb1-team-inh");
		});
	});

	// -------------------------------------------------------------------------
	// AC7 — PATCH succeeds for human and agent actors; no state gate
	// -------------------------------------------------------------------------
	describe("AC7 — PATCH /tasks/:id has no actor gate", () => {
		test("human actor can PATCH any editable field", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({ id: "bb1-team-ac7", name: "AC7 Team", phase: "build", createdAt: now });
			await db.insert(tasks).values({
				id: "ac7-task-human",
				parentTaskId: null,
				teamId: "bb1-team-ac7",
				title: "Original",
				description: null,
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			});

			const patchRes = await app.request("/api/tasks/ac7-task-human", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Updated by human",
					description: "Human description",
					doneCondition: "All tests pass",
				}),
			});
			expect(patchRes.status).toBe(200);
			const updated = (await patchRes.json()) as {
				title: string;
				description: string | null;
				doneCondition: string | null;
			};
			expect(updated.title).toBe("Updated by human");
			expect(updated.description).toBe("Human description");
			expect(updated.doneCondition).toBe("All tests pass");
		});

		test("agent actor can PATCH a task even in non-proposed state", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "bb1-team-ac7b",
				name: "AC7 Agent Team",
				phase: "build",
				createdAt: now,
			});
			await db.insert(users).values({
				id: "ast-bb1-agent",
				name: "BB1 Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			});
			// Task is in_progress — a non-proposed state
			await db.insert(tasks).values({
				id: "ac7-task-agent",
				parentTaskId: null,
				teamId: "bb1-team-ac7b",
				title: "Agent edits this",
				description: null,
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			});

			const patchRes = await app.request("/api/tasks/ac7-task-agent", {
				method: "PATCH",
				// Send x-hyperidle-actor-id to act as the agent
				headers: authHeaders({ [ACTOR_OVERRIDE_HEADER]: "ast-bb1-agent" }),
				body: JSON.stringify({
					title: "Updated by agent",
					description: "Agent wrote this",
				}),
			});
			expect(patchRes.status).toBe(200);
			const updated = (await patchRes.json()) as {
				title: string;
				description: string | null;
				state: string;
			};
			expect(updated.title).toBe("Updated by agent");
			expect(updated.description).toBe("Agent wrote this");
			// State is NOT changed by the PATCH — only fields changed
			expect(updated.state).toBe("in_progress");
		});

		test("human and agent actor get identical 200 results for the same PATCH", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db.insert(teams).values({
				id: "bb1-team-ac7c",
				name: "AC7 Both Team",
				phase: "build",
				createdAt: now,
			});
			await db.insert(users).values({
				id: "ast-bb1-agent2",
				name: "BB1 Agent 2",
				role: "builder",
				status: "active",
				createdAt: now,
			});

			// Seed two tasks — one for the human, one for the agent
			await db.insert(tasks).values([
				{
					id: "ac7-task-parity-human",
					parentTaskId: null,
					teamId: "bb1-team-ac7c",
					title: "Human task",
					state: "proposed",
					createdAt: now,
					updatedAt: now,
				},
				{
					id: "ac7-task-parity-agent",
					parentTaskId: null,
					teamId: "bb1-team-ac7c",
					title: "Agent task",
					state: "in_progress",
					createdAt: now,
					updatedAt: now,
				},
			]);

			const patchBody = { title: "Patched title", description: "Patched desc" };

			const humanRes = await app.request("/api/tasks/ac7-task-parity-human", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify(patchBody),
			});
			const agentRes = await app.request("/api/tasks/ac7-task-parity-agent", {
				method: "PATCH",
				headers: authHeaders({ [ACTOR_OVERRIDE_HEADER]: "ast-bb1-agent2" }),
				body: JSON.stringify(patchBody),
			});

			expect(humanRes.status).toBe(200);
			expect(agentRes.status).toBe(200);

			const humanBody = (await humanRes.json()) as { title: string; description: string | null };
			const agentBody = (await agentRes.json()) as { title: string; description: string | null };

			expect(humanBody.title).toBe("Patched title");
			expect(humanBody.description).toBe("Patched desc");
			expect(agentBody.title).toBe("Patched title");
			expect(agentBody.description).toBe("Patched desc");
		});
	});
});
