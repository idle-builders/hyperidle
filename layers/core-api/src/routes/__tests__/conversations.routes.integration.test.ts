/**
 * V1 — Route integration tests for conversations endpoints.
 *
 * GET  /api/conversations              — list threads
 * GET  /api/conversations/:threadId   — get thread with items
 * POST /api/conversations/items       — create item
 */

import { bets, type HyperIdleDb, teamMembers, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

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
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// GET /api/conversations (door #72) and GET /api/conversations/:threadId (door #76) deleted.
	// Tests removed with the routes.

	describe("POST /api/conversations/items", () => {
		test("returns 201 with created item on valid input", async ({ db, app }) => {
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

		test("returns 404 when threadId references non-existent thread", async ({ app }) => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New item", threadId: "non-existent" }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 on missing required field (title)", async ({ db, app }) => {
			const { threadId } = await seedThread(db);
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ threadId }),
			});
			expect(res.status).toBe(400);
		});

		test("emits item_created event on eventBus", async ({ db, app, eventBus }) => {
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
