/**
 * V1 — Route integration tests for artifacts endpoints.
 *
 * GET  /api/artifacts         — list artifacts (axis-based)
 * GET  /api/artifacts/:id     — get artifact by id
 * POST /api/artifacts         — create artifact
 */

import { artifacts, bets, type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-artifacts";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<{ taskId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: "tm-1",
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "team-1",
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		title: "Test task",
		betId: "bet-1",
		teamId: "team-1",
		state: "in_progress",
		ownerAgentId: "agent-1",
		createdAt: now,
		updatedAt: now,
	});
	return { taskId: "task-1" };
}

describe("artifacts routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("artifacts auth", () => {
		test("returns 401 without auth header on GET /api/artifacts", async ({
			requestWithoutAuth,
		}) => {
			const res = await requestWithoutAuth("/api/artifacts?axis=task&taskId=x", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/artifacts", () => {
		test("returns 400 when axis query param is missing or invalid", async ({ app }) => {
			const res = await app.request("/api/artifacts", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when axis=task but taskId is missing", async ({ app }) => {
			const res = await app.request("/api/artifacts?axis=task", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when axis=bet but betId is missing", async ({ app }) => {
			const res = await app.request("/api/artifacts?axis=bet", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when axis=product but teamId is missing", async ({ app }) => {
			const res = await app.request("/api/artifacts?axis=product", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 200 with empty items when no artifacts exist (axis=task)", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/artifacts?axis=task&taskId=task-1", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[]; nextCursor: null };
			expect(Array.isArray(body.items)).toBe(true);
			expect(body.items).toHaveLength(0);
			expect(body.nextCursor).toBeNull();
		});

		test("returns 200 with paginated artifacts for axis=task", async ({ db, app }) => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			// @lore AE6: 'verification' was an old kind; direct DB insert uses any string (bypasses API validation).
			// Using 'data' (the AE6 mapped kind for verification) for clarity.
			await db.insert(artifacts).values({
				id: "art-1",
				producingTaskId: taskId,
				kind: "data",
				previewJson: null,
				createdAt: now,
			});

			const res = await app.request(`/api/artifacts?axis=task&taskId=${taskId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: Array<{ id: string }> };
			expect(body.items).toHaveLength(1);
			expect(body.items[0]?.id).toBe("art-1");
		});

		test("returns 400 when limit exceeds HARD_LIMIT_CAP (200)", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/artifacts?axis=task&taskId=task-1&limit=201", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/artifacts/:id", () => {
		test("returns 200 with artifact and denormalized task title", async ({ db, app }) => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(artifacts).values({
				id: "art-1",
				producingTaskId: taskId,
				kind: "data",
				previewJson: null,
				createdAt: now,
			});

			const res = await app.request("/api/artifacts/art-1", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; producingTaskTitle: string };
			expect(body.id).toBe("art-1");
			expect(body.producingTaskTitle).toBe("Test task");
		});

		test("returns 404 for non-existent artifact", async ({ app }) => {
			const res = await app.request("/api/artifacts/does-not-exist", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/artifacts", () => {
		test("returns 201 with created artifact on valid input", async ({ db, app }) => {
			// @lore AE6: POST only accepts the 6 fundamental kinds.
			const { taskId } = await seedBase(db);
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ producingTaskId: taskId, kind: "data", preview: null }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; kind: string };
			expect(typeof body.id).toBe("string");
			expect(body.kind).toBe("data");
		});

		test("returns 400 when producingTaskId references non-existent task", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					producingTaskId: "non-existent",
					kind: "data",
					preview: null,
				}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when kind is 'unknown_kind' (not a fundamental kind)", async ({
			db,
			app,
		}) => {
			// @lore AE6: 'unknown_kind' is a legacy sentinel — POST rejects it since only
			// the 6 fundamental kinds are accepted at create time.
			const { taskId } = await seedBase(db);
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ producingTaskId: taskId, kind: "unknown_kind", preview: null }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when kind/preview discriminant mismatches", async ({ db, app }) => {
			const { taskId } = await seedBase(db);
			// kind=data but preview is code (discriminant mismatch)
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					producingTaskId: taskId,
					kind: "data",
					preview: {
						kind: "code",
						file: "src/main.ts",
						hunks: [{ header: "@@ -1,3 +1,3 @@", lines: [{ kind: "ctx", text: "hello" }] }],
					},
				}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 on missing required fields (Zod validation)", async ({ app }) => {
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ kind: "data" }),
			});
			expect(res.status).toBe(400);
		});
	});
});
