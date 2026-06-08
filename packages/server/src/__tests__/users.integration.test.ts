/**
 * P2: Users endpoint tests (renamed from agents.test.ts).
 *
 * @lore P2: /api/agents → /api/users. agents table → users table.
 * agentSkills table → userSkills table. All endpoint behaviors preserved.
 */

import {
	createTestDb,
	type HyperIdleDb,
	items,
	messages,
	teamMembers,
	teams,
	threads,
	userSkills,
	users,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-users";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("User Endpoints /api/users (E6 — renamed from agents)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		// Seed product and team
		await db.insert(teams).values({
			id: "prod-1",
			name: "Test Product",
			phase: "build",
			createdAt: NOW,
		});

		await db.insert(teamMembers).values({
			id: "team-1",
			teamId: "prod-1",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});

		// Seed AI users (formerly agents)
		await db.insert(users).values([
			{
				id: "agent-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: NOW,
			},
			{
				id: "agent-2",
				kind: "ai",
				name: "Growth Bot",
				role: "growth",
				status: "active",
				teamId: "team-1",
				createdAt: NOW,
			},
		]);

		// Seed user skills (formerly agent skills)
		await db.insert(userSkills).values([
			{ userId: "agent-1", skillId: "coding", autonomyLevel: 2 },
			{ userId: "agent-1", skillId: "testing", autonomyLevel: 3 },
		]);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	// AC1: GET /api/users — list all with status, team, role, current sessions
	describe("AC1: GET /api/users — list all users", () => {
		it("returns all users with activeSessions count", async () => {
			const res = await app.request("/api/users", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(2);
			expect(body[0]).toHaveProperty("activeSessions", 0);
			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("teamId");
			expect(body[0]).toHaveProperty("role");
		});

		it("returns 401 without auth", async () => {
			const res = await app.request("/api/users");
			expect(res.status).toBe(401);
		});
	});

	// AC2: GET /api/users/:id — detail with skills, autonomy levels, cost
	describe("AC2: GET /api/users/:id — user detail", () => {
		it("returns user with skills", async () => {
			const res = await app.request("/api/users/agent-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe("agent-1");
			expect(body.name).toBe("Builder Bot");
			expect(body).toHaveProperty("skills");

			const skills = body.skills as Array<Record<string, unknown>>;
			expect(skills).toHaveLength(2);
			expect(skills[0]).toHaveProperty("autonomyLevel");
		});

		it("returns 404 for unknown user", async () => {
			const res = await app.request("/api/users/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// AC3 + AC15: PATCH /api/users/:id/skills/:skillId — update autonomy level
	describe("AC3/AC15: PATCH /api/users/:id/skills/:skillId — update autonomy", () => {
		it("updates autonomy level", async () => {
			const res = await app.request("/api/users/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.autonomyLevel).toBe(4);
		});

		it("creates review thread when autonomy changes", async () => {
			const emitted: DomainEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			await app.request("/api/users/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});

			// @lore L1a: legacy `kind='review'` projects to host_kind='agent' for an
			// agent-scoped autonomy review (plan §5.3). Find the thread by
			// the agent host and the linked autonomy_change item.
			const allThreads = await db.select().from(threads);
			const reviewThread = allThreads.find((t) => t.hostKind === "agent" && t.hostId === "agent-1");
			expect(reviewThread).toBeDefined();

			// Verify item was created
			const allItems = await db.select().from(items);
			expect(allItems).toHaveLength(1);
			expect(allItems[0].kind).toBe("autonomy_change");

			// Verify event was emitted
			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("item_created");
		});

		it("does NOT create review thread when level unchanged", async () => {
			const emitted: DomainEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			await app.request("/api/users/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 2 }), // same as current
			});

			const allItems = await db.select().from(items);
			expect(allItems).toHaveLength(0);
			expect(emitted).toHaveLength(0);
		});

		it("returns 404 for unknown skill", async () => {
			const res = await app.request("/api/users/agent-1/skills/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 3 }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 for invalid autonomy level", async () => {
			const res = await app.request("/api/users/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 5 }),
			});
			expect(res.status).toBe(400);
		});
	});

	// AC8: GET /api/users/:id/inbox — user's inbox
	describe("AC8: GET /api/users/:id/inbox", () => {
		it("returns messages for the user", async () => {
			// Seed a thread and message
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "agent",
				hostId: "agent-1",
				initiatorId: "agent-2",
				participants: JSON.stringify(["agent-2", "agent-1"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});

			await db.insert(messages).values({
				id: "msg-1",
				senderId: "agent-2",
				threadId: "thread-1",
				type: "plain",
				payload: JSON.stringify({ text: "Hello!" }),
				clientKey: "msg-1",
				createdAt: NOW,
			});

			const res = await app.request("/api/users/agent-1/inbox", { headers: authHeaders() });
			expect(res.status).toBe(200);

			// P2: inbox returns { messages, total } shape
			const body = (await res.json()) as {
				messages: Array<{ payload: string; senderId: string }>;
				total: number;
			};
			expect(body).toHaveProperty("messages");
			expect(body.messages).toHaveLength(1);
			const payload = JSON.parse(body.messages[0].payload) as { text?: string };
			expect(payload.text).toBe("Hello!");
		});

		it("returns 404 for unknown user", async () => {
			const res = await app.request("/api/users/nonexistent/inbox", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});
	});

	// AC9: POST /api/users/:id/inbox — send message to user
	describe("AC9: POST /api/users/:id/inbox — send message", () => {
		it("sends a message and creates thread if needed", async () => {
			const res = await app.request("/api/users/agent-1/inbox", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-2" }),
				body: JSON.stringify({ body: "Hey there!" }),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			// L1a: messages now carry payload (JSON), not body/recipientId.
			expect(typeof body.payload).toBe("string");
			expect(body.senderId).toBe("agent-2");

			// Verify thread was created with the new shape.
			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1);
			expect(allThreads[0].hostKind).toBe("agent");
			expect(allThreads[0].hostId).toBe("agent-1");
		});

		it("reuses existing thread for same sender/recipient pair", async () => {
			// Send first message
			await app.request("/api/users/agent-1/inbox", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-2" }),
				body: JSON.stringify({ body: "First" }),
			});

			// Send second message
			await app.request("/api/users/agent-1/inbox", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-2" }),
				body: JSON.stringify({ body: "Second" }),
			});

			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1); // Still just one thread

			const allMessages = await db.select().from(messages);
			expect(allMessages).toHaveLength(2);
		});

		it("returns 404 for unknown recipient user", async () => {
			const res = await app.request("/api/users/nonexistent/inbox", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-2" }),
				body: JSON.stringify({ body: "Hello" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 for missing body text", async () => {
			const res = await app.request("/api/users/agent-1/inbox", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-2" }),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});

		it("rejects body-supplied senderId — no spoofing", async () => {
			const res = await app.request("/api/users/agent-1/inbox", {
				method: "POST",
				headers: authHeaders({ "X-Identity": "agent-2" }),
				body: JSON.stringify({ senderId: "u-founder", body: "spoof" }),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when X-Identity header is missing", async () => {
			const res = await app.request("/api/users/agent-1/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ body: "no identity" }),
			});
			expect(res.status).toBe(400);
		});
	});
});
