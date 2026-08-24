/**
 * R4 — Thread Identity Fix tests.
 *
 * Acceptance criteria:
 *   AC-1: GET /api/threads/:id response includes an identities map matching
 *         the pattern used in the coach endpoint.
 *   AC-2: ThreadShell renders sender names correctly for all messages in any
 *         thread. (Validated server-side: the identities map must contain
 *         correct names and roles for both human users and AI agents.)
 *
 * Validation scenarios:
 *   - Thread with messages from both a human user and an AI agent: response
 *     includes identities for both with correct names and roles.
 *   - Each identity entry has exact name and role values (not just toBeDefined).
 *   - Thread with zero messages returns an empty identities map.
 *   - Human user identity has correct name.
 *   - AI agent identity has correct name and role.
 */

import { bets, type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-r4-identity";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: now });

	// Human founder user
	await db.insert(users).values({
		id: "u-human",
		kind: "human",
		name: "Alice Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});

	// AI agent user
	await db.insert(users).values({
		id: "agent-builder",
		kind: "ai",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		createdAt: now,
	});

	// A bet + task so we can host a thread on a task.
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "p1",
		description: "p",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "p1",
		title: "T",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

describe("R4 — GET /api/threads/:id includes identities map", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("AC-1: response shape includes identities field", () => {
		test("identities field is present in GET /api/threads/:id response", async ({ db, app }) => {
			await seedBase(db);
			// Arrange: create a thread with one message from the human user.
			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "hello" },
						clientKey: "r4-ac1-key-0001",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };

			// Act
			const res = await app.request(`/api/threads/${created.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});

			// Assert
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("identities");
		});

		test("identities is an object (not null, not an array)", async ({ db, app }) => {
			await seedBase(db);
			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "hello" },
						clientKey: "r4-ac1-key-0002",
					},
				}),
			});
			const created = (await create.json()) as { thread: { id: string } };

			const res = await app.request(`/api/threads/${created.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { identities: unknown };

			expect(typeof body.identities).toBe("object");
			expect(body.identities).not.toBeNull();
			expect(Array.isArray(body.identities)).toBe(false);
		});
	});

	describe("AC-1: human user identity has correct name and role", () => {
		test("human sender appears in identities with exact name 'Alice Founder'", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			// Arrange: human user sends initial message.
			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "human message" },
						clientKey: "r4-human-key-0003",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };

			// Act
			const res = await app.request(`/api/threads/${created.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};

			// Assert — exact field-level values, not just toBeDefined
			expect(body.identities["u-human"]).toBeDefined();
			expect(body.identities["u-human"]?.name).toBe("Alice Founder");
			expect(body.identities["u-human"]?.role).toBe("founder");
		});
	});

	// @lore AF11-IDOR: AI agent identity tests rewritten to seed messages via DB
	// rather than API POST requests. After the fix, POST /api/threads/:id/messages
	// always attributes the message to c.get("userId") (the auth principal = u-human),
	// so an AI agent can no longer "send" a message via X-Identity header.
	// The identities map is built from message.senderId rows in the DB, so seeding
	// agent-builder messages directly produces the same observable effect.
	describe("AC-1: AI agent identity has correct name and role", () => {
		test("AI agent sender appears in identities with exact name 'Builder Bot' and role 'builder'", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const now = new Date().toISOString();

			// Arrange: seed thread + messages directly (avoids X-Identity on POST /:id/messages)
			await db.insert(threads).values({
				id: "thr-r4-agent-0004",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-human",
				participants: JSON.stringify(["u-human", "agent-builder"]),
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(messages).values({
				id: "msg-human-0004",
				threadId: "thr-r4-agent-0004",
				senderId: "u-human",
				type: "plain",
				payload: JSON.stringify({ text: "human creates thread" }),
				clientKey: "r4-agent-key-0004",
				createdAt: now,
			});
			// Agent message seeded directly — senderId = "agent-builder" (not via API)
			await db.insert(messages).values({
				id: "msg-agent-0004",
				threadId: "thr-r4-agent-0004",
				senderId: "agent-builder",
				type: "plain",
				payload: JSON.stringify({ text: "agent reply" }),
				clientKey: "r4-agent-reply-0004",
				createdAt: now,
			});

			// Act
			const res = await app.request("/api/threads/thr-r4-agent-0004", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};

			// Assert — exact field-level values for the AI agent
			expect(body.identities["agent-builder"]).toBeDefined();
			expect(body.identities["agent-builder"]?.name).toBe("Builder Bot");
			expect(body.identities["agent-builder"]?.role).toBe("builder");
		});

		test("identities contains both human and agent when both have sent messages", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const now = new Date().toISOString();

			// Arrange: seed thread + messages from both human and agent directly
			await db.insert(threads).values({
				id: "thr-r4-both-0005",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-human",
				participants: JSON.stringify(["u-human", "agent-builder"]),
				lastActiveAt: now,
				createdAt: now,
			});
			await db.insert(messages).values({
				id: "msg-human-0005",
				threadId: "thr-r4-both-0005",
				senderId: "u-human",
				type: "plain",
				payload: JSON.stringify({ text: "human start" }),
				clientKey: "r4-both-key-0005",
				createdAt: now,
			});
			await db.insert(messages).values({
				id: "msg-agent-0005",
				threadId: "thr-r4-both-0005",
				senderId: "agent-builder",
				type: "plain",
				payload: JSON.stringify({ text: "agent reply" }),
				clientKey: "r4-both-agent-0005",
				createdAt: now,
			});

			// Act
			const res = await app.request("/api/threads/thr-r4-both-0005", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};

			// Assert — both participants present with correct values
			expect(body.identities["u-human"]?.name).toBe("Alice Founder");
			expect(body.identities["u-human"]?.role).toBe("founder");
			expect(body.identities["agent-builder"]?.name).toBe("Builder Bot");
			expect(body.identities["agent-builder"]?.role).toBe("builder");
		});
	});

	describe("AC-1 edge case: zero messages returns empty identities", () => {
		test("thread with zero messages has an empty identities map", async ({ db, app }) => {
			await seedBase(db);
			// Arrange: insert a thread directly with no messages (cannot do via API
			// since POST /api/threads requires an initial message, so we insert
			// directly into the DB to exercise the zero-message path).
			const now = new Date().toISOString();
			const threadId = "r4-zero-msg-thread";
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-human",
				participants: JSON.stringify(["u-human"]),
				pinned: false,
				resolvedAt: null,
				lastActiveAt: now,
				createdAt: now,
			});

			// Verify no messages exist for this thread.
			const allMsgs = await db.select().from(messages);
			const msgCount = allMsgs.filter((m) => m.threadId === threadId);
			expect(msgCount.length).toBe(0);

			// Act
			const res = await app.request(`/api/threads/${threadId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};

			// Assert — zero senders means empty identities object
			expect(body).toHaveProperty("identities");
			expect(Object.keys(body.identities).length).toBe(0);
		});
	});

	describe("AC-1: identities only contains senders who have actually messaged", () => {
		test("non-messaging participant is NOT included in identities", async ({ db, app }) => {
			await seedBase(db);
			// Arrange: u-human sends the only message; agent-builder is a participant
			// but never sends. Only u-human should appear in identities.
			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "only me" },
						clientKey: "r4-only-sender-0006",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };

			// Act
			const res = await app.request(`/api/threads/${created.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};

			// Assert — only the actual sender in identities
			expect(body.identities["u-human"]).toBeDefined();
			expect(body.identities["agent-builder"]).toBeUndefined();
		});
	});

	describe("AC-2: identities map supports correct UI display (sender name resolution)", () => {
		test("every unique senderId in messages array has an entry in identities", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			// Arrange: both participants post messages.
			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "from human" },
						clientKey: "r4-coverage-0007",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };
			const threadId = created.thread.id;

			await app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-builder" }),
				body: JSON.stringify({
					type: "plain",
					payload: { text: "from agent" },
					clientKey: "r4-coverage-agent-0007",
				}),
			});

			// Act
			const res = await app.request(`/api/threads/${threadId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				messages: Array<{ senderId: string }>;
				identities: Record<string, { name: string; role?: string }>;
			};

			// Assert — every senderId present in messages has an identity entry
			const senderIds = [...new Set(body.messages.map((m) => m.senderId))];
			for (const id of senderIds) {
				expect(body.identities[id]).toBeDefined();
				expect(typeof body.identities[id]?.name).toBe("string");
				expect(body.identities[id]?.name.length).toBeGreaterThan(0);
			}
		});

		test("identity name is a non-empty string (never 'Unknown' when user exists in db)", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "named sender" },
						clientKey: "r4-named-0008",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };

			const res = await app.request(`/api/threads/${created.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string }>;
			};

			// The sender is "u-human" with name "Alice Founder" — must NOT be "Unknown"
			expect(body.identities["u-human"]?.name).not.toBe("Unknown");
			expect(body.identities["u-human"]?.name).toBe("Alice Founder");
		});
	});
});
