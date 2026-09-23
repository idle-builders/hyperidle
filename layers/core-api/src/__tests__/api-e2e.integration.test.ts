import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-e2e";

function auth(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "prod-1",
		name: "E2E Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	});

	await db.insert(users).values([
		{
			id: "agent-1",
			// AF11: kind='human' so auth middleware resolves this user as the principal.
			// GET /api/users/:id/inbox is self-only (AC5); the resolved principal must
			// match the inbox owner. All seedBase tests resolve principal = "agent-1".
			kind: "human",
			name: "Test Agent",
			role: "builder",
			status: "active",
			teamId: "prod-1",
			createdAt: new Date().toISOString(),
		},
		// L1a: synthetic sender for verdict-typed messages emitted by
		// the legacy `POST /responses` route (plan §6.4 wraps the new
		// repo path). The new `messages.sender_id` FK requires the
		// row to exist.
		{
			id: "policy_engine",
			name: "Policy Engine",
			role: "system",
			status: "active",
			createdAt: new Date().toISOString(),
		},
	]);
}

async function seedTaskData(db: HyperIdleDb): Promise<void> {
	// @lore U1: teamId references `teams` domain entity (not teamMembers).
	await db.insert(threads).values({
		id: `thr-${"bet-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-1"}`,
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Test bet",
		description: "Test bet",
		state: "in_progress",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});

	await db.insert(threads).values({
		id: `thr-${"task-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-1"}`,
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "prod-1",
		title: "Task A",
		state: "proposed",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

describe("E2E API Integration (I5)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------
	// 1. Auth enforcement
	// -------------------------------------------------------
	describe("Auth enforcement", () => {
		test("returns 401 when X-API-Key header is missing", async ({ db, requestWithoutAuth }) => {
			await seedBase(db);
			const res = await requestWithoutAuth("/api/actions/search_tasks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(401);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("UNAUTHORIZED");
		});

		test("returns 401 when X-API-Key header is wrong", async ({ db, requestWithoutAuth }) => {
			await seedBase(db);
			const res = await requestWithoutAuth("/api/actions/search_tasks", {
				method: "POST",
				headers: { "X-API-Key": "wrong-key", "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(401);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("UNAUTHORIZED");
		});

		test("allows access with correct API key", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/actions/search_tasks", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
		});
	});

	// -------------------------------------------------------
	// 2. Health
	// -------------------------------------------------------
	describe("Health", () => {
		test("GET /health returns ok without auth (backward compat)", async ({ app }) => {
			const res = await app.request("/health");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});

		test("GET /api/health returns ok without auth", async ({ app }) => {
			const res = await app.request("/api/health");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});
	});

	// -------------------------------------------------------
	// 3. Root Tasks (replaced Bets in BB1) — edit_task/open_task/search_tasks
	// -------------------------------------------------------
	describe("Root Tasks", () => {
		// BB1: bets are now root tasks (parentTaskId=null). Test task creation and listing.
		// the architecture doc §8: the eight-route /api/tasks CRUD surface is
		// deleted — task is an action, POST /api/actions/<name>.
		test("edit_task (no id) creates a root task, and search_tasks lists it", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const createRes = await app.request("/api/actions/edit_task", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ teamId: "prod-1", title: "E2E root task" }),
			});
			expect(createRes.status).toBe(200);
			const createdBody = (await createRes.json()) as {
				ok: boolean;
				data: { task: { id: string; state: string; parentTaskId: string | null } };
			};
			expect(createdBody.ok).toBe(true);
			expect(createdBody.data.task.state).toBe("proposed");
			expect(createdBody.data.task.parentTaskId).toBeNull();

			const listRes = await app.request("/api/actions/search_tasks", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({}),
			});
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as { ok: boolean; data: Array<{ id: string }> };
			expect(listBody.data.some((t) => t.id === createdBody.data.task.id)).toBe(true);
		});

		test("edit_task (no id) is refused when neither teamId nor parentTaskId is supplied", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/actions/edit_task", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ title: "No team no parent" }),
			});
			expect(res.status).toBe(422);
			const body = (await res.json()) as { ok: boolean; problems: Array<{ code: string }> };
			expect(body.ok).toBe(false);
		});

		test("open_task returns 422 with not_found for a nonexistent task", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/actions/open_task", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ id: "nonexistent" }),
			});
			expect(res.status).toBe(422);
			const body = (await res.json()) as { ok: boolean; problems: Array<{ code: string }> };
			expect(body.ok).toBe(false);
			expect(body.problems[0]?.code).toBe("not_found");
		});
	});

	// -------------------------------------------------------
	// 4. Tasks — search_tasks
	// -------------------------------------------------------
	describe("Tasks", () => {
		test("search_tasks lists all tasks", async ({ db, app }) => {
			await seedBase(db);
			await seedTaskData(db);
			const res = await app.request("/api/actions/search_tasks", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; data: Array<{ id: string }> };
			expect(body.data.length).toBeGreaterThanOrEqual(1);
		});

		test("search_tasks filters by parentTaskId", async ({ db, app }) => {
			await seedBase(db);
			await seedTaskData(db);
			const res = await app.request("/api/actions/search_tasks", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ parentTaskId: "bet-1" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; data: Array<{ parentTaskId: string }> };
			expect(body.data.every((t) => t.parentTaskId === "bet-1")).toBe(true);
		});

		// PATCH /api/tasks/:id (door #39) and POST /api/tasks/:id/transition (door #40) deleted.
		// Tests removed with the routes; edit_task covers create+edit+transition together.
	});

	// -------------------------------------------------------
	// 5. Conversations
	// -------------------------------------------------------
	// @lore BC3 architecture.md §5: describe("Conversations") DELETED —
	// GET /api/conversations, POST /api/conversations/items, POST
	// /api/threads, and POST /api/threads/:id/messages are all deleted
	// routes (the `items` table and the old thread routes are both gone;
	// thread reads/writes are actions now — `search_thread`/`open_thread`/
	// `send_message`/`adjust_thread`).

	// -------------------------------------------------------
	// 6. Document search
	// -------------------------------------------------------
	// @lore document-module B20: the CRUD checks that used to live here
	// (create/list/get-by-id over the now-deleted `POST /api/knowledge`) are
	// the seam contract — `document-actions.integration.test.ts` proves them
	// against `POST /api/actions/edit_document` for both the human and agent
	// door. What is left here is what was never about the route: the global
	// search endpoint, seeded through the surviving action door.
	// Search: GET /api/search?scope=document&q=... (AU44 fold; scope was renamed since).
	describe("Document search", () => {
		test("GET /api/search?scope=document&q=test returns search results", async ({ db, app }) => {
			await seedBase(db);
			// First create a document so search has something to find
			await app.request("/api/actions/edit_document", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Searchable decision",
					body: "This is a test item for search",
					format: "markdown",
					scopeKind: "factory",
				}),
			});

			const res = await app.request("/api/search?q=Searchable&scope=document", {
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { results: Array<{ title: string }> };
			expect(Array.isArray(body.results)).toBe(true);
			expect(body.results.length).toBeGreaterThanOrEqual(1);
			expect(body.results.some((r) => r.title === "Searchable decision")).toBe(true);
		});

		test("GET /api/search?scope=document requires query param q", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/search?scope=document", { headers: auth() });
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	// -------------------------------------------------------
	// 7. Agents
	// -------------------------------------------------------
	describe("Agents", () => {
		// @lore AU26 J1: the per-user `activeSessions` count is gone — it was a raw
		// `sessions` read and the list's one consumer is typed `{id,name,role,teamId}`.
		test("GET /api/users lists agents", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string; name: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
			expect(body.some((u) => u.id === "agent-1")).toBe(true);
		});

		test("GET /api/users/:id returns agent detail", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/agent-1", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string };
			expect(body.id).toBe("agent-1");
		});

		test("GET /api/users/:id returns 404 for unknown agent", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/nonexistent", { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		// GET /api/users/:id/inbox (door #92) and POST /api/users/:id/inbox (door #93)
		// deleted. Tests removed with the routes.
	});

	// -------------------------------------------------------
	// 8. Sessions
	// -------------------------------------------------------
	// GET /api/sessions deleted — search_sessions is the door now, proven by
	// the integrate task's seam test, not here.
	// POST /api/sessions (door #114) and PATCH /api/sessions/:id (door #144) deleted.
	// Tests removed with the routes.

	// Status routes (doors #115-118) deleted. Tests removed with the routes.

	// @lore BC5 T7b: 11. Routines — GET/PATCH /api/routines deleted with the
	// routine package; a routine is a subscription now, edited on `edit_user`.

	// -------------------------------------------------------
	// 14. 404 handling
	// -------------------------------------------------------
	describe("404 handling", () => {
		test("returns 404 JSON for unknown /api routes", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/nonexistent", { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		test("returns 404 text for unknown non-/api routes", async ({ app }) => {
			const res = await app.request("/nonexistent");
			expect(res.status).toBe(404);
		});
	});

	// @lore BC5 T7b: section 15 "Request validation" deleted — its two cases
	// (POST /api/sessions door #114, PATCH /api/routines/:id 404) were both
	// removed with their routes, leaving an empty describe vitest refuses to run.
});
