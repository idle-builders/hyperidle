/**
 * T5 — Block Discussion Completion: server-side blockId tests (red phase).
 *
 * AC coverage:
 *  - AC-1: blockId persisted in structured, queryable column (not only in JSON payload)
 *  - AC-4: anchored messages outlive their block (no cascade delete)
 *  - AC-5: GET /api/threads/:id?block_id=X filters messages by blockId
 *
 * Tests run against the real server + real PGlite DB (no mocks).
 * These tests FAIL until the implementation adds the `block_id` column and
 * dual-write logic.
 */

import { type HyperIdleDb, messages, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-t5-blockid";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1-t5", name: "T5Team", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: "u-t5-founder",
		kind: "human",
		name: "Founder T5",
		role: "founder",
		status: "active",
		createdAt: now,
	});
}

async function createThread(app: Hono): Promise<string> {
	const create = await app.request("/api/threads", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hostKind: "user",
			hostId: "u-t5-founder",
			participants: ["u-t5-founder"],
			initialMessage: {
				type: "plain",
				payload: { text: "Thread open" },
				clientKey: "t5-append-init",
			},
		}),
	});
	return ((await create.json()) as { thread: { id: string } }).thread.id;
}

async function createFilterThread(app: Hono): Promise<string> {
	const create = await app.request("/api/threads", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hostKind: "user",
			hostId: "u-t5-founder",
			participants: ["u-t5-founder"],
			initialMessage: {
				type: "plain",
				payload: { text: "Block A message 1", blockId: "block-filter-A" },
				clientKey: "t5-filter-init",
			},
		}),
	});
	const threadId = ((await create.json()) as { thread: { id: string } }).thread.id;

	await app.request(`/api/threads/${threadId}/messages`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			type: "plain",
			payload: { text: "Block A message 2", blockId: "block-filter-A" },
			clientKey: "t5-filter-a2",
		}),
	});
	await app.request(`/api/threads/${threadId}/messages`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			type: "plain",
			payload: { text: "Block B message 1", blockId: "block-filter-B" },
			clientKey: "t5-filter-b1",
		}),
	});
	await app.request(`/api/threads/${threadId}/messages`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			type: "plain",
			payload: { text: "Unanchored message 1" },
			clientKey: "t5-filter-u1",
		}),
	});
	await app.request(`/api/threads/${threadId}/messages`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			type: "plain",
			payload: { text: "Unanchored message 2" },
			clientKey: "t5-filter-u2",
		}),
	});

	return threadId;
}

// ── AC-1: blockId persisted in column when creating thread + initial message ──

describe("AC-1 — blockId written to column on POST /api/threads (initial message)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("message row has block_id column populated when blockId is in plain payload", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const blockId = "block-abc123def456";

		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-t5-founder",
				participants: ["u-t5-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Discussing this block", blockId },
					clientKey: "t5-init-blockid-1",
				},
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};

		const messageRows = await db
			.select()
			.from(messages)
			.where(eq(messages.id, body!.messages[0]!.id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]!.blockId).toBe(blockId);
	});

	test("message row has null block_id when no blockId is in payload", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-t5-founder",
				participants: ["u-t5-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "No block anchor here" },
					clientKey: "t5-init-no-blockid",
				},
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			messages: Array<{ id: string }>;
		};

		const messageRows = await db
			.select()
			.from(messages)
			.where(eq(messages.id, body!.messages[0]!.id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]!.blockId).toBeNull();
	});
});

// ── AC-1: blockId persisted in column when appending a message ──

describe("AC-1 — blockId written to column on POST /api/threads/:id/messages (append)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("appended message row has block_id column populated when blockId is in payload", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const threadId = await createThread(app);
		const blockId = "block-append-xyz789";

		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Anchored reply", blockId },
				clientKey: "t5-append-blockid-1",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { message: { id: string } };

		const messageRows = await db.select().from(messages).where(eq(messages.id, body.message.id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]!.blockId).toBe(blockId);
	});

	test("appended message row has null block_id when no blockId is in payload", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const threadId = await createThread(app);
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Plain reply, no anchor" },
				clientKey: "t5-append-no-blockid",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { message: { id: string } };

		const messageRows = await db.select().from(messages).where(eq(messages.id, body.message.id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]!.blockId).toBeNull();
	});
});

// ── AC-5: GET /api/threads/:id?block_id=X filters messages by blockId ──

describe("AC-5 — GET /api/threads/:id?block_id=X returns only matching messages", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET with ?block_id=block-filter-A returns only 2 messages anchored to block-A", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const threadId = await createFilterThread(app);

		const res = await app.request(`/api/threads/${threadId}?block_id=block-filter-A`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			messages: Array<{ payload: { text?: string; blockId?: string } }>;
		};

		expect(body.messages).toHaveLength(2);
		for (const msg of body.messages) {
			expect(msg.payload.blockId).toBe("block-filter-A");
		}
	});

	test("GET without block_id filter returns all 5 messages", async ({ db, app }) => {
		await seedBase(db);
		const threadId = await createFilterThread(app);
		const res = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<unknown> };

		expect(body.messages).toHaveLength(5);
	});

	test("GET with ?block_id=block-filter-B returns only 1 message anchored to block-B", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const threadId = await createFilterThread(app);
		const res = await app.request(`/api/threads/${threadId}?block_id=block-filter-B`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<unknown> };

		expect(body.messages).toHaveLength(1);
	});

	test("GET with ?block_id=block-nonexistent returns 0 messages", async ({ db, app }) => {
		await seedBase(db);
		const threadId = await createFilterThread(app);
		const res = await app.request(`/api/threads/${threadId}?block_id=block-nonexistent`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<unknown> };

		expect(body.messages).toHaveLength(0);
	});

	test("GET with ?block_id= (empty string) returns 400 or ignores the filter (security: rejects empty)", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const threadId = await createFilterThread(app);
		const res = await app.request(`/api/threads/${threadId}?block_id=`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(400);
	});

	test("GET with ?block_id exceeding 128 chars returns 400 (T5 max-length guard)", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const threadId = await createFilterThread(app);
		const oversizedBlockId = "x".repeat(129);
		const res = await app.request(`/api/threads/${threadId}?block_id=${oversizedBlockId}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("validation_error");
	});
});

// ── AC-4: Anchored messages persist independently (no cascade) ──

describe("AC-4 — anchored messages outlive their block (no cascade delete)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("message with blockId persists when the thread is not deleted", async ({ db, app }) => {
		await seedBase(db);
		const blockId = "block-persist-test";

		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-t5-founder",
				participants: ["u-t5-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Anchored message that outlives its block", blockId },
					clientKey: "t5-persist-1",
				},
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { messages: Array<{ id: string }> };
		const messageId = body!.messages[0]!.id;

		const messageRows = await db.select().from(messages).where(eq(messages.id, messageId));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]!.blockId).toBe(blockId);

		const cols = Object.keys(messageRows[0]!);
		expect(cols).toContain("blockId");
	});
});
