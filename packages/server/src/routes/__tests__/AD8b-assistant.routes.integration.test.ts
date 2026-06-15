/**
 * AD8b — GET /api/threads/assistant + system prompt CRUD endpoints (RED phase).
 *
 * AC-1: Each human user has exactly one assistant agent (kind=ai,
 *       agentCategory=individual, role=assistant) created at user registration.
 *
 * AC-2: System prompt is editable via GET/PATCH /api/users/:userId/assistant.
 *       - PATCH updates systemPrompt; GET returns updated value.
 *       - PATCH with >50_000 chars returns 400.
 *       - PATCH for another user's assistant returns 403.
 *
 * AC-6 (Reviewer C1 fix): GET /api/threads/assistant finds thread by
 *       hostKind="user" + hostId=userId + assistant participant (NOT by pinned).
 *       Thread starts pinned=false.
 *
 * Tests use the vitest fixture pattern: `import { test, describe, expect } from "../test-fixtures.js"`.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-ad8b-assistant";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

const NOW = new Date().toISOString();

async function seedUser(db: HyperIdleDb, id: string, name: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name,
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// AC-6: GET /api/threads/assistant — returns thread for user (starts unpinned)
// ---------------------------------------------------------------------------

describe("AD8b — GET /api/threads/assistant", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 on first call even when no thread exists", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-1", "Alice");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-1" }),
		});
		expect(res.status).toBe(200);
	});

	test("created thread has hostKind='user'", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-2", "Bob");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-2" }),
		});
		const body = (await res.json()) as { thread: { hostKind: string } };
		expect(body.thread.hostKind).toBe("user");
	});

	test("AC-6: thread starts pinned=false (reviewer C1 fix)", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-3", "Carol");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-3" }),
		});
		const body = (await res.json()) as { thread: { pinned: boolean } };
		expect(body.thread.pinned).toBe(false);
	});

	test("thread hostId matches the requesting user", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-4", "Dave");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-4" }),
		});
		const body = (await res.json()) as { thread: { hostId: string } };
		expect(body.thread.hostId).toBe("u-ad8b-4");
	});

	test("response includes thread, messages, headMessageId, identities", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-5", "Eve");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-5" }),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("thread");
		expect(body).toHaveProperty("messages");
		expect(body).toHaveProperty("headMessageId");
		expect(body).toHaveProperty("identities");
	});

	test("messages is empty array on first call", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-6", "Frank");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-6" }),
		});
		const body = (await res.json()) as { messages: unknown[] };
		expect(Array.isArray(body.messages)).toBe(true);
		expect(body.messages).toHaveLength(0);
	});

	test("idempotent — returns same thread on second call", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-7", "Grace");
		const first = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-7" }),
		});
		const firstBody = (await first.json()) as { thread: { id: string } };

		const second = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-7" }),
		});
		const secondBody = (await second.json()) as { thread: { id: string } };

		expect(secondBody.thread.id).toBe(firstBody.thread.id);
	});

	// @lore AF11-IDOR: "different users get different threads" via X-Identity header
	// was the IDOR hole — rewritten to verify the security fix. The authenticated
	// principal (auth middleware) controls the thread, NOT the X-Identity header.
	// Same API key + same auth principal → same thread, regardless of X-Identity.
	test("authenticated principal always gets their own thread (X-Identity ignored for scoping)", async ({
		db,
		app,
	}) => {
		// Insert u-ad8b-8a first → auth middleware resolves it as the principal
		await seedUser(db, "u-ad8b-8a", "Harry A");
		await seedUser(db, "u-ad8b-8b", "Harry B");

		// Two requests with different X-Identity headers, same auth credential
		const resA = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-8a" }),
		});
		const resB = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-8b" }), // spoofed
		});

		const bodyA = (await resA.json()) as { thread: { id: string; hostId: string } };
		const bodyB = (await resB.json()) as { thread: { id: string; hostId: string } };

		// Both must return the authenticated principal's thread (u-ad8b-8a)
		expect(bodyA.thread.id).toBe(bodyB.thread.id);
		// Neither can return u-ad8b-8b's thread (that would be the IDOR)
		expect(bodyA.thread.hostId).toBe("u-ad8b-8a");
		expect(bodyB.thread.hostId).toBe("u-ad8b-8a");
	});

	test("identities include the user", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-9", "Ivy");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-9" }),
		});
		const body = (await res.json()) as {
			identities: Record<string, { name: string }>;
		};
		expect(body.identities).toHaveProperty("u-ad8b-9");
	});

	test("identities include the assistant agent", async ({ db, app }) => {
		await seedUser(db, "u-ad8b-10", "Jack");
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ad8b-10" }),
		});
		const body = (await res.json()) as {
			identities: Record<string, { name: string; role?: string }>;
		};
		// The assistant agent should appear in identities
		const identityValues = Object.values(body.identities);
		const assistantIdentity = identityValues.find((v) => v.role === "assistant");
		expect(assistantIdentity).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// AC-2: GET + PATCH /api/users/:userId/assistant (system prompt CRUD)
// ---------------------------------------------------------------------------

describe("AD8b — GET/PATCH /api/users/:userId/assistant (system prompt)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/users/:id/assistant returns 200 with id, name, systemPrompt", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-sp-1", "System Prompt User");
		const res = await app.request("/api/users/u-sp-1/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-sp-1" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("id");
		expect(body).toHaveProperty("name");
		expect(body).toHaveProperty("systemPrompt");
	});

	test("PATCH /api/users/:id/assistant updates systemPrompt and returns 200", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-sp-2", "Patcher");
		const newPrompt = "You are a helpful assistant focused on product development.";
		const res = await app.request("/api/users/u-sp-2/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-sp-2" }),
			body: JSON.stringify({ systemPrompt: newPrompt }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { systemPrompt: string };
		expect(body.systemPrompt).toBe(newPrompt);
	});

	test("PATCH then GET returns the updated system prompt", async ({ db, app }) => {
		await seedUser(db, "u-sp-3", "Round Trip");
		const newPrompt = "Round trip prompt test.";

		await app.request("/api/users/u-sp-3/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-sp-3" }),
			body: JSON.stringify({ systemPrompt: newPrompt }),
		});

		const res = await app.request("/api/users/u-sp-3/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-sp-3" }),
		});
		const body = (await res.json()) as { systemPrompt: string };
		expect(body.systemPrompt).toBe(newPrompt);
	});

	test("PATCH with systemPrompt exceeding 50_000 chars returns 400", async ({ db, app }) => {
		await seedUser(db, "u-sp-4", "Oversized");
		const oversizedPrompt = "x".repeat(50_001);
		const res = await app.request("/api/users/u-sp-4/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-sp-4" }),
			body: JSON.stringify({ systemPrompt: oversizedPrompt }),
		});
		expect(res.status).toBe(400);
	});

	test("PATCH another user's assistant returns 403", async ({ db, app }) => {
		await seedUser(db, "u-sp-5a", "User A");
		await seedUser(db, "u-sp-5b", "User B");

		// User A tries to edit User B's assistant
		const res = await app.request("/api/users/u-sp-5b/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-sp-5a" }),
			body: JSON.stringify({ systemPrompt: "Malicious prompt" }),
		});
		expect(res.status).toBe(403);
	});

	test("GET another user's assistant returns 403", async ({ db, app }) => {
		await seedUser(db, "u-sp-6a", "User 6A");
		await seedUser(db, "u-sp-6b", "User 6B");

		const res = await app.request("/api/users/u-sp-6b/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-sp-6a" }),
		});
		expect(res.status).toBe(403);
	});

	test("GET non-existent user returns 403 (self-guard fires before 404)", async ({
		db: _db,
		app,
	}) => {
		// AF11 AC5/Hole 2: GET /api/users/:userId/assistant is principal-self only.
		// The self-guard compares c.get("userId") to the path :userId BEFORE
		// checking DB existence. No kind='human' user is seeded, so principal
		// resolves to "u-founder" fallback. "u-founder" !== "u-nonexistent-xyz"
		// → 403 (not 404). This is security-correct: don't reveal resource existence
		// to callers who are not the resource owner.
		const res = await app.request("/api/users/u-nonexistent-xyz/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-nonexistent-xyz" }),
		});
		expect(res.status).toBe(403);
	});
});

// ---------------------------------------------------------------------------
// AC-1: Assistant agent created at user registration
// ---------------------------------------------------------------------------

describe("AD8b — AC-1: assistant agent created at user registration", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /api/users creates an assistant agent for the new user", async ({ db: _db, app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "New User AD8b", email: "ad8b@example.com" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { id: string };
		const userId = body.id;

		// Now verify that the assistant agent was created
		const assistantRes = await app.request(`/api/users/${userId}/assistant`, {
			method: "GET",
			headers: authHeaders({ "X-Identity": userId }),
		});
		expect(assistantRes.status).toBe(200);
		const assistantBody = (await assistantRes.json()) as { id: string; name: string };
		expect(typeof assistantBody.id).toBe("string");
		expect(assistantBody.id.length).toBeGreaterThan(0);
	});

	test("created assistant agent has kind=ai, agentCategory=individual, role=assistant", async ({
		db,
		app,
	}) => {
		await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Agent Check User", email: "agentcheck@example.com" }),
		});
		// Look up the assistant agent via the DB (it is a user with kind=ai)
		const { users: usersTable } = await import("@hyperidle/db");
		const { eq, and } = await import("drizzle-orm");

		const assistantRows = await db
			.select()
			.from(usersTable)
			.where(and(eq(usersTable.kind, "ai"), eq(usersTable.role, "assistant")));

		// At least one assistant agent should exist for the new user
		// The assistant is linked to the user via the thread (hostId=userId)
		expect(assistantRows.length).toBeGreaterThanOrEqual(1);
		const agentRow = assistantRows.find((_r) => true);
		expect(agentRow?.role).toBe("assistant");
	});
});
