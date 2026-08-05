/**
 * P2: Users endpoint tests (renamed from agents.test.ts).
 *
 * @lore P2: /api/agents → /api/users. agents table → users table.
 * agentSkills table → userSkills table. All endpoint behaviors preserved.
 */

import {
	type HyperIdleDb,
	items,
	messages,
	teamMembers,
	teams,
	threads,
	userSkills,
	users,
} from "@hyperidle/db";
import type { DomainEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-users";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
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

	// Seed AI users (formerly agents).
	// AF11: agent-1 is kind='human' so auth middleware resolves it as the principal.
	// GET /api/users/:id/inbox is principal-self only (AC5 AF11); the resolved
	// principal must match the inbox owner. All seedBase tests resolve principal = "agent-1".
	await db.insert(users).values([
		{
			id: "agent-1",
			kind: "human",
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
}

describe("User Endpoints /api/users (E6 — renamed from agents)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC1: GET /api/users — list all with status, team, role.
	// @lore AU26 J1: the `activeSessions` count is gone (see
	// `AU26-J1-run-read-deletions.integration.test.ts`) — the run count was a raw
	// `sessions` read serving a consumer typed `{id,name,role,teamId}`.
	describe("AC1: GET /api/users — list all users", () => {
		test("returns all users with their identity fields", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(2);
			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("teamId");
			expect(body[0]).toHaveProperty("role");
		});

		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/users");
			expect(res.status).toBe(401);
		});
	});

	// AC2: GET /api/users/:id — detail with skills, autonomy levels, cost
	describe("AC2: GET /api/users/:id — user detail", () => {
		test("returns user with skills", async ({ db, app }) => {
			await seedBase(db);
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

		test("returns 404 for unknown user", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// AC3 + AC15: PATCH /api/users/:id/skills/:skillId — update autonomy level
	describe("AC3/AC15: PATCH /api/users/:id/skills/:skillId — update autonomy", () => {
		test("updates autonomy level", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/agent-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.autonomyLevel).toBe(4);
		});

		test("creates review thread when autonomy changes", async ({ db, app, eventBus }) => {
			await seedBase(db);
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
			expect(allItems[0]!.kind).toBe("autonomy_change");

			// Verify event was emitted
			expect(emitted).toHaveLength(1);
			expect(emitted[0]!.type).toBe("item_created");
		});

		test("does NOT create review thread when level unchanged", async ({ db, app, eventBus }) => {
			await seedBase(db);
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

		test("returns 404 for unknown skill", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/agent-1/skills/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 3 }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 for invalid autonomy level", async ({ db, app }) => {
			await seedBase(db);
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
		test("returns messages for the user", async ({ db, app }) => {
			await seedBase(db);
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
			const payload = JSON.parse(body!.messages[0]!.payload) as { text?: string };
			expect(payload.text).toBe("Hello!");
		});

		test("returns 403 for unknown user (self-guard fires before 404)", async ({ app }) => {
			// AF11 AC5: GET /:id/inbox is principal-self only. The self-guard
			// compares c.get("userId") to the path :id BEFORE checking DB existence.
			// A non-existent path user can never equal the real principal, so the
			// 403 fires first (security-correct: don't reveal resource existence).
			// Without seedBase, principal resolves to "u-founder" fallback.
			// "u-founder" !== "nonexistent" → 403, not 404.
			const res = await app.request("/api/users/nonexistent/inbox", { headers: authHeaders() });
			expect(res.status).toBe(403);
		});
	});

	// AC9: POST /api/users/:id/inbox — send message to user
	// @lore AF11-IDOR: senderId now comes from c.get("userId") (auth principal = "agent-1")
	// rather than the X-Identity header. Tests updated to reflect the fixed behavior.
	describe("AC9: POST /api/users/:id/inbox — send message", () => {
		test("sends a message and creates thread if needed", async ({ db, app }) => {
			await seedBase(db);
			// Agent-2 (ai, not human) receives the inbox message.
			// Agent-1 (the auth principal, kind='human') is the sender.
			const res = await app.request("/api/users/agent-2/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ body: "Hey there!" }),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			// L1a: messages now carry payload (JSON), not body/recipientId.
			expect(typeof body.payload).toBe("string");
			// AF11-IDOR: senderId is the authenticated principal (agent-1), never the header
			expect(body.senderId).toBe("agent-1");

			// Verify thread was created with the new shape.
			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1);
			// findOrCreateDirectThread defaults recipientKind="agent" for DM threads
			expect(allThreads[0]!.hostKind).toBe("agent");
			expect(allThreads[0]!.hostId).toBe("agent-2");
		});

		test("reuses existing thread for same sender/recipient pair", async ({ db, app }) => {
			await seedBase(db);
			// Send first message
			await app.request("/api/users/agent-2/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ body: "First" }),
			});

			// Send second message
			await app.request("/api/users/agent-2/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ body: "Second" }),
			});

			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1); // Still just one thread

			const allMessages = await db.select().from(messages);
			expect(allMessages).toHaveLength(2);
		});

		test("returns 404 for unknown recipient user", async ({ app }) => {
			const res = await app.request("/api/users/nonexistent/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ body: "Hello" }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 for missing body text", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/users/agent-2/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});

		test("rejects body-supplied senderId — no spoofing via body", async ({ db, app }) => {
			await seedBase(db);
			// schema is strict() — extra field senderId in body → 400 validation error
			const res = await app.request("/api/users/agent-2/inbox", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ senderId: "u-founder", body: "spoof" }),
			});
			expect(res.status).toBe(400);
		});

		// AF11-IDOR: Removed "returns 400 when X-Identity header is missing" —
		// after the fix, the X-Identity header is no longer used for senderId.
		// Missing header is NOT an error; auth principal is used instead.
		test("missing X-Identity header is accepted — senderId comes from auth", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/users/agent-2/inbox", {
				method: "POST",
				headers: authHeaders(), // No X-Identity — this is now fine
				body: JSON.stringify({ body: "auth-only sender" }),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			// senderId must be the auth principal, not a fallback error
			expect(body.senderId).toBe("agent-1");
		});
	});
});
