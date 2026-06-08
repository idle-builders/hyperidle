/**
 * V1 — Route integration tests for conversations endpoints.
 *
 * GET  /api/conversations              — list threads
 * GET  /api/conversations/:threadId   — get thread with items
 * POST /api/conversations/items       — create item
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-conversations";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedThread(db: HyperIdleDb): Promise<{ threadId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: "human-1",
		kind: "human",
		name: "Initiator",
		role: "admin",
		status: "active",
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
	await db.insert(threads).values({
		id: "thread-1",
		hostKind: "bet",
		hostId: "bet-1",
		initiatorId: "human-1",
		participants: "[]",
		createdAt: now,
		lastActiveAt: now,
	});
	return { threadId: "thread-1" };
}

describe("conversations routes", () => {
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

	describe("conversations auth", () => {
		it("returns 401 without auth header on GET /api/conversations", async () => {
			const res = await app.request("/api/conversations", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/conversations", () => {
		it("returns 200 with threads and pagination", async () => {
			await seedThread(db);
			const res = await app.request("/api/conversations", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				threads: unknown[];
				pagination: { page: number; limit: number; total: number };
			};
			expect(Array.isArray(body.threads)).toBe(true);
			expect(body.threads).toHaveLength(1);
			expect(typeof body.pagination.total).toBe("number");
		});

		it("returns 200 with empty threads list when none exist", async () => {
			const res = await app.request("/api/conversations", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { threads: unknown[] };
			expect(body.threads).toHaveLength(0);
		});

		it("respects page and limit query params", async () => {
			const res = await app.request("/api/conversations?page=2&limit=5", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { pagination: { page: number; limit: number } };
			expect(body.pagination.page).toBe(2);
			expect(body.pagination.limit).toBe(5);
		});

		it("handles sort=attention_score by falling through to recency", async () => {
			await seedThread(db);
			const res = await app.request("/api/conversations?sort=attention_score", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { threads: unknown[] };
			expect(Array.isArray(body.threads)).toBe(true);
		});
	});

	describe("GET /api/conversations/:threadId", () => {
		it("returns 200 with thread and items", async () => {
			const { threadId } = await seedThread(db);
			const now = new Date().toISOString();
			await db.insert(items).values({
				id: "item-1",
				title: "Test item",
				threadId,
				createdAt: now,
			});

			const res = await app.request(`/api/conversations/${threadId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; items: unknown[] };
			expect(body.id).toBe(threadId);
			expect(body.items).toHaveLength(1);
		});

		it("returns 200 with empty items array for thread with no items", async () => {
			const { threadId } = await seedThread(db);
			const res = await app.request(`/api/conversations/${threadId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[] };
			expect(body.items).toHaveLength(0);
		});

		it("returns 404 for non-existent thread", async () => {
			const res = await app.request("/api/conversations/does-not-exist", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		it("includes empty responses array on each item", async () => {
			const { threadId } = await seedThread(db);
			const now = new Date().toISOString();
			await db.insert(items).values({
				id: "item-1",
				title: "Test item",
				threadId,
				createdAt: now,
			});

			const res = await app.request(`/api/conversations/${threadId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: Array<{ responses: unknown[] }> };
			expect(body.items[0]?.responses).toEqual([]);
		});
	});

	describe("POST /api/conversations/items", () => {
		it("returns 201 with created item on valid input", async () => {
			const { threadId } = await seedThread(db);
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New item", threadId }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; title: string };
			expect(typeof body.id).toBe("string");
			expect(body.title).toBe("New item");
		});

		it("returns 404 when threadId references non-existent thread", async () => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New item", threadId: "non-existent" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 on missing required field (title)", async () => {
			const { threadId } = await seedThread(db);
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ threadId }),
			});
			expect(res.status).toBe(400);
		});

		it("emits item_created event on eventBus", async () => {
			const { threadId } = await seedThread(db);
			const emittedEvents: unknown[] = [];
			eventBus.on("item_created", (e) => {
				emittedEvents.push(e);
			});

			await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Event item", threadId }),
			});

			expect(emittedEvents).toHaveLength(1);
		});
	});
});
