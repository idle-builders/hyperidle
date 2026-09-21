import { type HyperIdleDb, routines, tasks, teams, threads, users } from "@hyperidle/db";
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

async function seedSessionData(db: HyperIdleDb): Promise<void> {
	// @lore U1: teamId references `teams` domain entity (not teamMembers).
	await db.insert(threads).values({
		id: `thr-${"bet-s"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-s"}`,
		id: "bet-s",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Session bet",
		description: "Session bet",
		state: "in_progress",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});

	await db.insert(threads).values({
		id: `thr-${"task-s"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-s"}`,
		id: "task-s",
		parentTaskId: "bet-s",
		teamId: "prod-1",
		title: "Session task",
		state: "in_progress",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

async function seedRoutineData(db: HyperIdleDb): Promise<void> {
	await db.insert(routines).values({
		id: "routine-1",
		name: "Test routine",
		state: "active",
		ownerAgentId: "agent-1",
		triggerType: "heartbeat",
		triggerConfig: JSON.stringify({ intervalMs: 60000 }),
		autonomyLevel: 2,
		active: true,
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
	// 6. Knowledge
	// -------------------------------------------------------
	// @lore O2: Knowledge routes rewritten. Layer-based URL prefix removed.
	// New URL shape: POST /api/knowledge (create), GET /api/knowledge (list),
	// GET /api/knowledge/:id (get). Search: GET /api/search?scope=document&q=... (AU44 fold, BC4 rename).
	describe("Knowledge", () => {
		test("GET /api/knowledge returns items list", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/knowledge", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[] };
			expect(Array.isArray(body.items)).toBe(true);
		});

		test("POST /api/knowledge creates a knowledge item (O2: no layer prefix)", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Test decision",
					body: "We decided X",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "agent-1",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; version: number };
			expect(body.id).toBeDefined();
			expect(body.version).toBe(1);
		});

		test("GET /api/knowledge/:id returns item by id (O2: no layer prefix)", async ({ db, app }) => {
			await seedBase(db);
			// Create an item first
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Get-by-id test",
					body: "Content",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "agent-1",
				}),
			});
			const created = (await createRes.json()) as { id: string };
			const res = await app.request(`/api/knowledge/${created.id}`, { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; title: string };
			expect(body.id).toBe(created.id);
			expect(body.title).toBe("Get-by-id test");
		});

		// @lore AU44 batch 4: GET /api/knowledge/search folded into GET /api/search?scope=document
		// (BC4: the wire value was scope=knowledge, now scope=document — architecture.md §8.6)
		test("GET /api/search?scope=document&q=test returns search results", async ({ db, app }) => {
			await seedBase(db);
			// First create a knowledge item so search has something to find
			await app.request("/api/knowledge", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Searchable decision",
					body: "This is a test item for search",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "agent-1",
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
	describe("Sessions", () => {
		test("GET /api/sessions returns session list", async ({ db, app }) => {
			await seedBase(db);
			await seedSessionData(db);
			const res = await app.request("/api/sessions", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(Array.isArray(body)).toBe(true);
		});

		// POST /api/sessions (door #114) and PATCH /api/sessions/:id (door #144) deleted.
		// Tests removed with the routes.
	});

	// Status routes (doors #115-118) deleted. Tests removed with the routes.

	// -------------------------------------------------------
	// 11. Routines
	// -------------------------------------------------------
	describe("Routines", () => {
		test("GET /api/routines lists routines", async ({ db, app }) => {
			await seedBase(db);
			await seedRoutineData(db);
			const res = await app.request("/api/routines", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
		});

		test("PATCH /api/routines/:id updates routine", async ({ db, app }) => {
			await seedBase(db);
			await seedRoutineData(db);
			const res = await app.request("/api/routines/routine-1", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { active: boolean };
			expect(body.active).toBe(false);
		});

		// POST /api/routines/:id/retire (door #?) deleted. Tests removed with the route.
	});

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

	// -------------------------------------------------------
	// 15. Validation
	// -------------------------------------------------------
	describe("Request validation", () => {
		// POST /api/sessions (door #114) deleted. Validation test removed with the route.

		test("PATCH /api/routines/:id returns 404 for nonexistent routine", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/routines/nonexistent", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ active: true }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});
});
