import {
	agentSkills,
	agents,
	createTestDb,
	type HyperIdleDb,
	items,
	messages,
	products,
	teams,
	threads,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-agents";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Agent Endpoints (E6)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed product and team
		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();

		// Seed agents
		db.insert(agents)
			.values([
				{
					id: "agent-1",
					name: "Builder Bot",
					role: "builder",
					status: "idle",
					teamId: "team-1",
					createdAt: new Date().toISOString(),
				},
				{
					id: "agent-2",
					name: "Growth Bot",
					role: "growth",
					status: "active",
					teamId: "team-1",
					createdAt: new Date().toISOString(),
				},
			])
			.run();

		// Seed agent skills
		db.insert(agentSkills)
			.values([
				{ agentId: "agent-1", skillId: "coding", autonomyLevel: 2 },
				{ agentId: "agent-1", skillId: "testing", autonomyLevel: 3 },
			])
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC1: GET /api/agents — list all with status, team, role, current sessions
	describe("AC1: GET /api/agents — list all agents", () => {
		it("returns all agents with activeSessions count", async () => {
			const res = await app.request("/api/agents", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(2);
			expect(body[0]).toHaveProperty("activeSessions", 0);
			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("teamId");
			expect(body[0]).toHaveProperty("role");
		});

		it("returns 401 without auth", async () => {
			const res = await app.request("/api/agents");
			expect(res.status).toBe(401);
		});
	});

	// AC2: GET /api/agents/:id — detail with skills, autonomy levels, cost
	describe("AC2: GET /api/agents/:id — agent detail", () => {
		it("returns agent with skills", async () => {
			const res = await app.request("/api/agents/agent-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe("agent-1");
			expect(body.name).toBe("Builder Bot");
			expect(body).toHaveProperty("skills");

			const skills = body.skills as Array<Record<string, unknown>>;
			expect(skills).toHaveLength(2);
			expect(skills[0]).toHaveProperty("autonomyLevel");
		});

		it("returns 404 for unknown agent", async () => {
			const res = await app.request("/api/agents/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// AC3 + AC15: PATCH /api/agents/:id/skills/:skillId — update autonomy level (creates review thread)
	describe("AC3/AC15: PATCH /api/agents/:id/skills/:skillId — update autonomy", () => {
		it("updates autonomy level", async () => {
			const res = await app.request("/api/agents/agent-1/skills/coding", {
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

			await app.request("/api/agents/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});

			// L1a: legacy `kind='review'` projects to host_kind='agent' for an
			// agent-scoped autonomy review (plan §5.3). Find the thread by
			// the agent host and the linked autonomy_change item.
			const allThreads = db.select().from(threads).all();
			const reviewThread = allThreads.find((t) => t.hostKind === "agent" && t.hostId === "agent-1");
			expect(reviewThread).toBeDefined();

			// Verify item was created
			const allItems = db.select().from(items).all();
			expect(allItems).toHaveLength(1);
			expect(allItems[0].kind).toBe("autonomy_change");

			// Verify event was emitted
			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("item_created");
		});

		it("does NOT create review thread when level unchanged", async () => {
			const emitted: DomainEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			await app.request("/api/agents/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 2 }), // same as current
			});

			const allItems = db.select().from(items).all();
			expect(allItems).toHaveLength(0);
			expect(emitted).toHaveLength(0);
		});

		it("returns 404 for unknown skill", async () => {
			const res = await app.request("/api/agents/agent-1/skills/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 3 }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 for invalid autonomy level", async () => {
			const res = await app.request("/api/agents/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 5 }),
			});
			expect(res.status).toBe(400);
		});
	});

	// AC8: GET /api/agents/:id/inbox — agent's inbox
	describe("AC8: GET /api/agents/:id/inbox", () => {
		it("returns messages for the agent", async () => {
			// Seed a thread and message
			db.insert(threads)
				.values({
					id: "thread-1",
					hostKind: "agent",
					hostId: "agent-1",
					initiatorId: "agent-2",
					participants: JSON.stringify(["agent-2", "agent-1"]),
					lastActiveAt: new Date().toISOString(),
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(messages)
				.values({
					id: "msg-1",
					senderId: "agent-2",
					threadId: "thread-1",
					type: "plain",
					payload: JSON.stringify({ text: "Hello!" }),
					clientKey: "msg-1",
					createdAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request("/api/agents/agent-1/inbox", { headers: authHeaders() });
			expect(res.status).toBe(200);

			// L1a: messages now carry payload (JSON), not body. The route
			// returns the row as-is.
			const body = (await res.json()) as Array<{ payload: string; senderId: string }>;
			expect(body).toHaveLength(1);
			const payload = JSON.parse(body[0].payload) as { text?: string };
			expect(payload.text).toBe("Hello!");
		});

		it("returns 404 for unknown agent", async () => {
			const res = await app.request("/api/agents/nonexistent/inbox", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});
	});

	// AC9: POST /api/agents/:id/inbox — send message to agent
	describe("AC9: POST /api/agents/:id/inbox — send message", () => {
		it("sends a message and creates thread if needed", async () => {
			const res = await app.request("/api/agents/agent-1/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ senderId: "agent-2", body: "Hey there!" }),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			// L1a: messages now carry payload (JSON), not body/recipientId.
			expect(typeof body.payload).toBe("string");
			expect(body.senderId).toBe("agent-2");

			// Verify thread was created with the new shape.
			const allThreads = db.select().from(threads).all();
			expect(allThreads).toHaveLength(1);
			expect(allThreads[0].hostKind).toBe("agent");
			expect(allThreads[0].hostId).toBe("agent-1");
		});

		it("reuses existing thread for same sender/recipient pair", async () => {
			// Send first message
			await app.request("/api/agents/agent-1/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ senderId: "agent-2", body: "First" }),
			});

			// Send second message
			await app.request("/api/agents/agent-1/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ senderId: "agent-2", body: "Second" }),
			});

			const allThreads = db.select().from(threads).all();
			expect(allThreads).toHaveLength(1); // Still just one thread

			const allMessages = db.select().from(messages).all();
			expect(allMessages).toHaveLength(2);
		});

		it("returns 404 for unknown recipient agent", async () => {
			const res = await app.request("/api/agents/nonexistent/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ senderId: "agent-2", body: "Hello" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 for missing body text", async () => {
			const res = await app.request("/api/agents/agent-1/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ senderId: "agent-2" }),
			});
			expect(res.status).toBe(400);
		});
	});
});
