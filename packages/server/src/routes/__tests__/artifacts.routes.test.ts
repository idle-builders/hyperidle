/**
 * V1 — Route integration tests for artifacts endpoints.
 *
 * GET  /api/artifacts         — list artifacts (axis-based)
 * GET  /api/artifacts/:id     — get artifact by id
 * POST /api/artifacts         — create artifact
 * PATCH /api/artifacts/:id/preview — set preview (IMMUTABLE)
 */

import {
	artifacts,
	bets,
	createTestDb,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-artifacts";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<{ taskId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: now });
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
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("artifacts auth", () => {
		it("returns 401 without auth header on GET /api/artifacts", async () => {
			const res = await app.request("/api/artifacts?axis=task&taskId=x", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/artifacts", () => {
		it("returns 400 when axis query param is missing or invalid", async () => {
			const res = await app.request("/api/artifacts", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when axis=task but taskId is missing", async () => {
			const res = await app.request("/api/artifacts?axis=task", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when axis=bet but betId is missing", async () => {
			const res = await app.request("/api/artifacts?axis=bet", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when axis=product but teamId is missing", async () => {
			const res = await app.request("/api/artifacts?axis=product", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		it("returns 200 with empty items when no artifacts exist (axis=task)", async () => {
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

		it("returns 200 with paginated artifacts for axis=task", async () => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(artifacts).values({
				id: "art-1",
				producingTaskId: taskId,
				kind: "verification",
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

		it("returns 400 when limit exceeds HARD_LIMIT_CAP (200)", async () => {
			await seedBase(db);
			const res = await app.request("/api/artifacts?axis=task&taskId=task-1&limit=201", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/artifacts/:id", () => {
		it("returns 200 with artifact and denormalized task title", async () => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(artifacts).values({
				id: "art-1",
				producingTaskId: taskId,
				kind: "verification",
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

		it("returns 404 for non-existent artifact", async () => {
			const res = await app.request("/api/artifacts/does-not-exist", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/artifacts", () => {
		it("returns 201 with created artifact on valid input", async () => {
			const { taskId } = await seedBase(db);
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ producingTaskId: taskId, kind: "verification", preview: null }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; kind: string };
			expect(typeof body.id).toBe("string");
			expect(body.kind).toBe("verification");
		});

		it("returns 400 when producingTaskId references non-existent task", async () => {
			await seedBase(db);
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					producingTaskId: "non-existent",
					kind: "verification",
					preview: null,
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when kind is 'unknown_kind'", async () => {
			const { taskId } = await seedBase(db);
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ producingTaskId: taskId, kind: "unknown_kind", preview: null }),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when kind/preview discriminant mismatches", async () => {
			const { taskId } = await seedBase(db);
			// kind=verification but preview is code_diff (discriminant mismatch)
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					producingTaskId: taskId,
					kind: "verification",
					preview: {
						kind: "code_diff",
						file: "src/main.ts",
						hunks: [{ header: "@@ -1,3 +1,3 @@", lines: [{ kind: "ctx", text: "hello" }] }],
					},
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 on missing required fields (Zod validation)", async () => {
			const res = await app.request("/api/artifacts", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ kind: "verification" }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("PATCH /api/artifacts/:id/preview", () => {
		const validVerificationPreview = {
			kind: "verification",
			suite: "vitest",
			passed: 5,
			failed: 0,
		};

		it("returns 200 on successful preview set (when previewJson IS NULL)", async () => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(artifacts).values({
				id: "art-noprev",
				producingTaskId: taskId,
				kind: "verification",
				previewJson: null,
				createdAt: now,
			});

			const res = await app.request("/api/artifacts/art-noprev/preview", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ preview: validVerificationPreview }),
			});
			expect(res.status).toBe(200);
		});

		it("returns 409 when preview is already set (IMMUTABLE)", async () => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(artifacts).values({
				id: "art-withprev",
				producingTaskId: taskId,
				kind: "verification",
				previewJson: JSON.stringify(validVerificationPreview),
				createdAt: now,
			});

			const res = await app.request("/api/artifacts/art-withprev/preview", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ preview: validVerificationPreview }),
			});
			expect(res.status).toBe(409);
		});

		it("returns 404 for non-existent artifact", async () => {
			const res = await app.request("/api/artifacts/does-not-exist/preview", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ preview: validVerificationPreview }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 on invalid preview body", async () => {
			const { taskId } = await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(artifacts).values({
				id: "art-badprev",
				producingTaskId: taskId,
				kind: "verification",
				previewJson: null,
				createdAt: now,
			});

			const res = await app.request("/api/artifacts/art-badprev/preview", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ notPreview: true }),
			});
			expect(res.status).toBe(400);
		});
	});
});
