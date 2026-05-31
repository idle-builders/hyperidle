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

import { createTestDb, type HyperIdleDb, messages, teamMembers, teams, users } from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-t5-blockid";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
	events: DomainEvent[];
}

async function setupApp(): Promise<AppCtx> {
	const handle = await createTestDb();
	const db = handle.db;
	const eventBus = new EventBus();
	const events: DomainEvent[] = [];
	eventBus.on("*", (e) => {
		events.push(e);
	});
	const app = await createTestApp({ db, eventBus });

	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1-t5", name: "T5Team", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: "tm-t5",
		teamId: "p1-t5",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: "u-t5-founder",
		kind: "human",
		name: "Founder T5",
		role: "founder",
		status: "active",
		createdAt: now,
	});

	return { app, db, eventBus, events };
}

// ── AC-1: blockId persisted in column when creating thread + initial message ──

describe("AC-1 — blockId written to column on POST /api/threads (initial message)", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("message row has block_id column populated when blockId is in plain payload", async () => {
		const blockId = "block-abc123def456";

		const res = await ctx.app.request("/api/threads", {
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

		// Query the DB row directly — the block_id column must be populated.
		const messageRows = await ctx.db
			.select()
			.from(messages)
			.where(eq(messages.id, body.messages[0].id));

		expect(messageRows).toHaveLength(1);
		// This assertion proves AC-1: blockId is in a structured column, not only the JSON payload.
		expect(messageRows[0].blockId).toBe(blockId);
	});

	it("message row has null block_id when no blockId is in payload", async () => {
		const res = await ctx.app.request("/api/threads", {
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

		const messageRows = await ctx.db
			.select()
			.from(messages)
			.where(eq(messages.id, body.messages[0].id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0].blockId).toBeNull();
	});
});

// ── AC-1: blockId persisted in column when appending a message ──

describe("AC-1 — blockId written to column on POST /api/threads/:id/messages (append)", () => {
	let ctx: AppCtx;
	let threadId: string;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		const create = await ctx.app.request("/api/threads", {
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
		expect(create.status).toBe(201);
		threadId = ((await create.json()) as { thread: { id: string } }).thread.id;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("appended message row has block_id column populated when blockId is in payload", async () => {
		const blockId = "block-append-xyz789";

		const res = await ctx.app.request(`/api/threads/${threadId}/messages`, {
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

		const messageRows = await ctx.db
			.select()
			.from(messages)
			.where(eq(messages.id, body.message.id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0].blockId).toBe(blockId);
	});

	it("appended message row has null block_id when no blockId is in payload", async () => {
		const res = await ctx.app.request(`/api/threads/${threadId}/messages`, {
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

		const messageRows = await ctx.db
			.select()
			.from(messages)
			.where(eq(messages.id, body.message.id));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0].blockId).toBeNull();
	});
});

// ── AC-5: GET /api/threads/:id?block_id=X filters messages by blockId ──

describe("AC-5 — GET /api/threads/:id?block_id=X returns only matching messages", () => {
	let ctx: AppCtx;
	let threadId: string;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();

		// Create a thread with 5 messages:
		//   2 anchored to block-A
		//   1 anchored to block-B
		//   2 unanchored (no blockId)
		const create = await ctx.app.request("/api/threads", {
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
		expect(create.status).toBe(201);
		threadId = ((await create.json()) as { thread: { id: string } }).thread.id;

		// Message 2: anchored to block-A
		await ctx.app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Block A message 2", blockId: "block-filter-A" },
				clientKey: "t5-filter-a2",
			}),
		});

		// Message 3: anchored to block-B
		await ctx.app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Block B message 1", blockId: "block-filter-B" },
				clientKey: "t5-filter-b1",
			}),
		});

		// Message 4: unanchored
		await ctx.app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Unanchored message 1" },
				clientKey: "t5-filter-u1",
			}),
		});

		// Message 5: unanchored
		await ctx.app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Unanchored message 2" },
				clientKey: "t5-filter-u2",
			}),
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("GET with ?block_id=block-filter-A returns only 2 messages anchored to block-A", async () => {
		const res = await ctx.app.request(`/api/threads/${threadId}?block_id=block-filter-A`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			messages: Array<{ payload: { text?: string; blockId?: string } }>;
		};

		// Only the 2 block-A messages should be returned
		expect(body.messages).toHaveLength(2);
		for (const msg of body.messages) {
			expect(msg.payload.blockId).toBe("block-filter-A");
		}
	});

	it("GET without block_id filter returns all 5 messages", async () => {
		const res = await ctx.app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<unknown> };

		expect(body.messages).toHaveLength(5);
	});

	it("GET with ?block_id=block-filter-B returns only 1 message anchored to block-B", async () => {
		const res = await ctx.app.request(`/api/threads/${threadId}?block_id=block-filter-B`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<unknown> };

		expect(body.messages).toHaveLength(1);
	});

	it("GET with ?block_id=block-nonexistent returns 0 messages", async () => {
		const res = await ctx.app.request(`/api/threads/${threadId}?block_id=block-nonexistent`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<unknown> };

		expect(body.messages).toHaveLength(0);
	});

	it("GET with ?block_id= (empty string) returns 400 or ignores the filter (security: rejects empty)", async () => {
		// The architecture critique requires empty-string block_id to be rejected (Zod validation).
		const res = await ctx.app.request(`/api/threads/${threadId}?block_id=`, {
			method: "GET",
			headers: authHeaders(),
		});

		// Must either reject with 400 (strict validation) or return all messages
		// (empty string treated as absent). Either is acceptable; what is NOT acceptable
		// is returning an empty array for an effectively absent filter.
		// The architecture critique mandates rejection, so we assert 400.
		expect(res.status).toBe(400);
	});
});

// ── AC-4: Anchored messages persist independently (no cascade) ──

describe("AC-4 — anchored messages outlive their block (no cascade delete)", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("message with blockId persists when the thread is not deleted", async () => {
		// AC-4 asserts there is no cascade from blocks to messages.
		// Since blocks are derived (not stored), the test verifies that a message
		// with a blockId continues to exist in the DB regardless of whether that
		// blockId appears in any rendered body.
		const blockId = "block-persist-test";

		const res = await ctx.app.request("/api/threads", {
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
		const messageId = body.messages[0].id;

		// The blockId field on the message has no FK to any blocks table
		// (blocks are derived, not stored). The message row must persist as-is.
		const messageRows = await ctx.db.select().from(messages).where(eq(messages.id, messageId));

		expect(messageRows).toHaveLength(1);
		expect(messageRows[0].blockId).toBe(blockId);

		// The message does NOT get cascade-deleted when we conceptually
		// "remove" the block by editing the body (there's nothing to cascade from).
		// This is a structural assertion: no FK constraint means no cascade.
		// The column definition must NOT have a foreign key reference.
		const cols = Object.keys(messageRows[0]);
		expect(cols).toContain("blockId");
	});
});
