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

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	messages,
	products,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-r4-identity";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
	close: () => Promise<void>;
}

async function setupApp(): Promise<AppCtx> {
	const handle = await createTestDb();
	const db = handle.db;
	const eventBus = new EventBus();
	const app = await createTestApp({ db, eventBus });

	const now = new Date().toISOString();

	await db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now });
	await db.insert(teams).values({
		id: "t1",
		productId: "p1",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

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
		productId: "p1",
		teamId: "t1",
		pitch: "p",
		appetite: "small",
		status: "in_progress",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		productId: "p1",
		teamId: "t1",
		title: "T",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});

	return { app, db, close: handle.close };
}

describe("R4 — GET /api/threads/:id includes identities map", () => {
	let ctx: AppCtx;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = await setupApp();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await ctx.close();
	});

	describe("AC-1: response shape includes identities field", () => {
		it("identities field is present in GET /api/threads/:id response", async () => {
			// Arrange: create a thread with one message from the human user.
			const create = await ctx.app.request("/api/threads", {
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
			const res = await ctx.app.request(`/api/threads/${created.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});

			// Assert
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("identities");
		});

		it("identities is an object (not null, not an array)", async () => {
			const create = await ctx.app.request("/api/threads", {
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

			const res = await ctx.app.request(`/api/threads/${created.thread.id}`, {
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
		it("human sender appears in identities with exact name 'Alice Founder'", async () => {
			// Arrange: human user sends initial message.
			const create = await ctx.app.request("/api/threads", {
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
			const res = await ctx.app.request(`/api/threads/${created.thread.id}`, {
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

	describe("AC-1: AI agent identity has correct name and role", () => {
		it("AI agent sender appears in identities with exact name 'Builder Bot' and role 'builder'", async () => {
			// Arrange: create thread, then have agent-builder post a message.
			const create = await ctx.app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "human creates thread" },
						clientKey: "r4-agent-key-0004",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };
			const threadId = created.thread.id;

			// Agent posts a reply.
			const agentPost = await ctx.app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-builder" }),
				body: JSON.stringify({
					type: "plain",
					payload: { text: "agent reply" },
					clientKey: "r4-agent-reply-0004",
				}),
			});
			expect(agentPost.status).toBe(201);

			// Act
			const res = await ctx.app.request(`/api/threads/${threadId}`, {
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

		it("identities contains both human and agent when both have sent messages", async () => {
			// Arrange: both participants post messages.
			const create = await ctx.app.request("/api/threads", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "u-human" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-human", "agent-builder"],
					initialMessage: {
						type: "plain",
						payload: { text: "human start" },
						clientKey: "r4-both-key-0005",
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as { thread: { id: string } };
			const threadId = created.thread.id;

			await ctx.app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-builder" }),
				body: JSON.stringify({
					type: "plain",
					payload: { text: "agent reply" },
					clientKey: "r4-both-agent-0005",
				}),
			});

			// Act
			const res = await ctx.app.request(`/api/threads/${threadId}`, {
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
		it("thread with zero messages has an empty identities map", async () => {
			// Arrange: insert a thread directly with no messages (cannot do via API
			// since POST /api/threads requires an initial message, so we insert
			// directly into the DB to exercise the zero-message path).
			const now = new Date().toISOString();
			const threadId = "r4-zero-msg-thread";
			await ctx.db.insert(threads).values({
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
			const allMsgs = await ctx.db.select().from(messages);
			const msgCount = allMsgs.filter((m) => m.threadId === threadId);
			expect(msgCount.length).toBe(0);

			// Act
			const res = await ctx.app.request(`/api/threads/${threadId}`, {
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
		it("non-messaging participant is NOT included in identities", async () => {
			// Arrange: u-human sends the only message; agent-builder is a participant
			// but never sends. Only u-human should appear in identities.
			const create = await ctx.app.request("/api/threads", {
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
			const res = await ctx.app.request(`/api/threads/${created.thread.id}`, {
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
		it("every unique senderId in messages array has an entry in identities", async () => {
			// Arrange: both participants post messages.
			const create = await ctx.app.request("/api/threads", {
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

			await ctx.app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-builder" }),
				body: JSON.stringify({
					type: "plain",
					payload: { text: "from agent" },
					clientKey: "r4-coverage-agent-0007",
				}),
			});

			// Act
			const res = await ctx.app.request(`/api/threads/${threadId}`, {
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

		it("identity name is a non-empty string (never 'Unknown' when user exists in db)", async () => {
			const create = await ctx.app.request("/api/threads", {
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

			const res = await ctx.app.request(`/api/threads/${created.thread.id}`, {
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
