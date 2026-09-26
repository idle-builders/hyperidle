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
		createdAt: new Date().toISOString(),
	});

	await db.insert(users).values([
		{
			id: "agent-1",
			// kind='human' so auth middleware resolves this user as the principal.
			// GET /api/users/:id/inbox is self-only; the resolved principal must
			// match the inbox owner. All seedBase tests resolve principal = "agent-1".
			kind: "human",
			name: "Test Agent",
			role: "builder",
			status: "active",
			teamId: "prod-1",
			createdAt: new Date().toISOString(),
		},
		// A synthetic sender for verdict-typed messages emitted by the legacy
		// `POST /responses` route — `messages.sender_id` FK requires the row
		// to exist.
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
	// teamId references the `teams` domain entity (not teamMembers).
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

describe("E2E API integration", () => {
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
	// 3. Root Tasks — edit_task/open_task/search_tasks
	// -------------------------------------------------------
	describe("Root Tasks", () => {
		// A root task is a task with parentTaskId=null. There is no separate
		// CRUD route surface — task is an action, POST /api/actions/<name>.
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
	});

	// The document/user/thread/session/routine CRUD routes this file used to
	// exercise are gone — those doors are actions now
	// (edit_document/edit_task/search_users/send_message/edit_user), proven
	// in document-actions/task-actions/user-actions/thread-actions. What
	// remains here is what was never about a CRUD route: the global search
	// endpoint and 404 handling.
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
});
