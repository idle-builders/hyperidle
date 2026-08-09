/**
 * L21 — GET /api/threads/coach endpoint tests (RED phase).
 *
 * Acceptance criteria:
 *   AC-11: GET /api/threads/coach resolves or creates the coach thread.
 *   AC-12: Coach thread has hostKind="user", hostId=<userId>, pinned=true.
 *   AC-13: Coach thread is created when absent (first request).
 *   AC-14: Coach thread is returned (not duplicated) on subsequent requests.
 *   AC-15: X-Identity header controls which user's coach thread is resolved.
 *   AC-16: Response includes thread, messages, headMessageId, identities.
 *   AC-17: identities include agent-coc with name "System Agent".
 *
 * Tests import createTestApp which mounts ALL routes including the new
 * /api/threads/coach route (not yet mounted — will FAIL until green phase).
 */

import { type HyperIdleDb, teamMembers, teams, threads, users } from "@hyperidle/db";
import { classifyThreadConfiguration } from "@hyperidle/domain-model";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-coach";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	// Seed base product/team
	await db.insert(teams).values({ id: "p1", name: "TestProduct", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	// Seed founder user
	await db.insert(users).values({
		id: "u-founder",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});

	// Seed a second user for X-Identity tests
	await db.insert(users).values({
		id: "u-other",
		name: "Other User",
		role: "founder",
		status: "active",
		createdAt: now,
	});

	// Seed seed-agent-cos (well-known system agent ID — the existing seed agent).
	// @lore L21: The architecture plan used "agent-coc" but the actual seed
	// and reviewer feedback use "seed-agent-cos". The coach route constant
	// must match the real seeded agent id.
	await db.insert(users).values({
		id: "seed-agent-cos",
		name: "System Agent",
		role: "assistant",
		status: "active",
		createdAt: now,
	});
}

describe("L21 — GET /api/threads/coach", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("AC-13: creates coach thread when absent", () => {
		test("returns 200 on first call even when no coach thread exists", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		});

		test("returns a thread with hostKind='user' on first call", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { hostKind: string } };
			expect(body.thread.hostKind).toBe("user");
		});

		test("returns a thread with pinned=true on first call", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { pinned: boolean } };
			expect(body.thread.pinned).toBe(true);
		});

		test("returns empty messages array on first call (new thread)", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { messages: unknown[] };
			expect(body.messages).toEqual([]);
		});

		test("response includes headMessageId field", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { headMessageId: string | null };
			expect(body).toHaveProperty("headMessageId");
		});
	});

	describe("AC-12: thread shape validates correctly", () => {
		test("thread hostId matches the authenticated user id", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const body = (await res.json()) as { thread: { hostId: string } };
			expect(body.thread.hostId).toBe("u-founder");
		});

		test("thread participants include both user and seed-agent-cos (system agent)", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const body = (await res.json()) as { thread: { participants: string[] } };
			expect(body.thread.participants).toContain("u-founder");
			expect(body.thread.participants).toContain("seed-agent-cos");
		});

		test("thread resolvedAt is null (coach threads are perpetual)", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { resolvedAt: string | null } };
			expect(body.thread.resolvedAt).toBeNull();
		});
	});

	describe("AC-14: idempotent — does not duplicate on second call", () => {
		test("returns the same thread id on two consecutive calls", async ({ db, app }) => {
			await seedBase(db);
			const first = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const firstBody = (await first.json()) as { thread: { id: string } };

			const second = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const secondBody = (await second.json()) as { thread: { id: string } };

			expect(secondBody.thread.id).toBe(firstBody.thread.id);
		});

		test("does not create a second coach thread for the same user", async ({ db, app }) => {
			await seedBase(db);
			await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});

			// Only one pinned user-hosted thread should exist for u-founder.
			const rows = await db
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, "user"), eq(threads.hostId, "u-founder")));

			// Filter to pinned ones only (the coach thread).
			const pinnedRows = rows.filter((r: { pinned: boolean }) => r.pinned);
			expect(pinnedRows.length).toBe(1);
		});
	});

	// @lore AF11-IDOR: AC-15 rewritten after fixing the X-Identity IDOR hole.
	// The old test expected X-Identity to control which user's thread was resolved —
	// that was the security hole. After the fix, the auth principal (c.get("userId"))
	// controls the thread. X-Identity is ignored for authorization/scoping.
	describe("AC-15: X-Identity header is IGNORED — authenticated principal controls coach thread", () => {
		test("X-Identity header cannot change which coach thread is returned", async ({ db, app }) => {
			await seedBase(db);

			// Both requests use the same auth credential → same auth principal → same thread
			// X-Identity headers differ but are ignored for thread scoping.
			const firstRes = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const secondRes = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-other" }),
			});

			const firstBody = (await firstRes.json()) as { thread: { id: string; hostId: string } };
			const secondBody = (await secondRes.json()) as { thread: { id: string; hostId: string } };

			// Both requests must return the SAME thread (for the auth principal), not different ones
			expect(firstBody.thread.id).toBe(secondBody.thread.id);
			// Neither thread's hostId can be the spoofed X-Identity value
			expect(firstBody.thread.hostId).not.toBe("u-other");
			expect(secondBody.thread.hostId).not.toBe("u-other");
		});
	});

	describe("AC-17: identities include seed-agent-cos (system agent)", () => {
		// @lore AD8a: display name updated from "Chief of Staff" to "System Agent".
		test("identities response contains seed-agent-cos with name 'System Agent'", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};
			expect(body.identities).toHaveProperty("seed-agent-cos");
			const cocIdentity = body.identities["seed-agent-cos"];
			expect(cocIdentity?.name).toBe("System Agent");
		});

		test("identities response contains the user identity", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string }>;
			};
			expect(body.identities).toHaveProperty("u-founder");
		});
	});

	describe("AC-16: full response shape", () => {
		test("response contains thread, messages, headMessageId, and identities keys", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("thread");
			expect(body).toHaveProperty("messages");
			expect(body).toHaveProperty("headMessageId");
			expect(body).toHaveProperty("identities");
		});

		test("messages is an array", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { messages: unknown };
			expect(Array.isArray(body.messages)).toBe(true);
		});
	});

	describe("Coach thread classifies as 'assistant' configuration (AD8b: coach→assistant rename)", () => {
		test("thread with hostKind='user' and pinned=true is classified as 'assistant'", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { hostKind: string; pinned: boolean } };

			// Use the pre-imported classifier from @hyperidle/domain-model.
			// @lore AD8b: "coach" renamed to "assistant" in ThreadConfiguration.
			const configuration = classifyThreadConfiguration({
				id: "test",
				hostKind: body.thread.hostKind as "user",
				hostId: "u-founder",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-coc"],
				pinned: body.thread.pinned,
				resolvedAt: null,
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});
			expect(configuration).toBe("assistant");
		});
	});
});
