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
 *   AC-17: identities include agent-coc with name "Chief of Staff".
 *
 * Tests import createTestApp which mounts ALL routes including the new
 * /api/threads/coach route (not yet mounted — will FAIL until green phase).
 */

import { createTestDb, type HyperIdleDb, teamMembers, teams, threads, users } from "@hyperidle/db";
import { classifyThreadConfiguration, EventBus } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-coach";

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
	eventBus: EventBus;
}

function setupApp(): AppCtx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const app = createTestApp({ db, eventBus });

	const now = new Date().toISOString();

	// Seed base product/team
	db.insert(teams).values({ id: "p1", name: "TestProduct", phase: "build", createdAt: now }).run();
	db.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();

	// Seed founder user
	db.insert(users)
		.values({ id: "u-founder", name: "Founder", role: "founder", status: "active", createdAt: now })
		.run();

	// Seed a second user for X-Identity tests
	db.insert(users)
		.values({
			id: "u-other",
			name: "Other User",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.run();

	// Seed seed-agent-cos (well-known CoC agent ID — the existing seed agent).
	// @lore L21: The architecture plan used "agent-coc" but the actual seed
	// and reviewer feedback use "seed-agent-cos". The coach route constant
	// must match the real seeded agent id.
	db.insert(users)
		.values({
			id: "seed-agent-cos",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			createdAt: now,
		})
		.run();

	return { app, db, eventBus };
}

describe("L21 — GET /api/threads/coach", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("AC-13: creates coach thread when absent", () => {
		it("returns 200 on first call even when no coach thread exists", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		});

		it("returns a thread with hostKind='user' on first call", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { hostKind: string } };
			expect(body.thread.hostKind).toBe("user");
		});

		it("returns a thread with pinned=true on first call", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { pinned: boolean } };
			expect(body.thread.pinned).toBe(true);
		});

		it("returns empty messages array on first call (new thread)", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { messages: unknown[] };
			expect(body.messages).toEqual([]);
		});

		it("response includes headMessageId field", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { headMessageId: string | null };
			expect(body).toHaveProperty("headMessageId");
		});
	});

	describe("AC-12: thread shape validates correctly", () => {
		it("thread hostId matches the authenticated user id", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const body = (await res.json()) as { thread: { hostId: string } };
			expect(body.thread.hostId).toBe("u-founder");
		});

		it("thread participants include both user and seed-agent-cos (CoC agent)", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const body = (await res.json()) as { thread: { participants: string[] } };
			expect(body.thread.participants).toContain("u-founder");
			expect(body.thread.participants).toContain("seed-agent-cos");
		});

		it("thread resolvedAt is null (coach threads are perpetual)", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { resolvedAt: string | null } };
			expect(body.thread.resolvedAt).toBeNull();
		});
	});

	describe("AC-14: idempotent — does not duplicate on second call", () => {
		it("returns the same thread id on two consecutive calls", async () => {
			const first = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const firstBody = (await first.json()) as { thread: { id: string } };

			const second = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const secondBody = (await second.json()) as { thread: { id: string } };

			expect(secondBody.thread.id).toBe(firstBody.thread.id);
		});

		it("does not create a second coach thread for the same user", async () => {
			await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});

			// Only one pinned user-hosted thread should exist for u-founder.
			const rows = ctx.db
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, "user"), eq(threads.hostId, "u-founder")))
				.all();

			// Filter to pinned ones only (the coach thread).
			const pinnedRows = rows.filter(
				(r: { pinned: number | boolean }) => r.pinned === 1 || r.pinned === true,
			);
			expect(pinnedRows.length).toBe(1);
		});
	});

	describe("AC-15: X-Identity header selects the correct user's coach thread", () => {
		it("returns different coach threads for different users", async () => {
			const founderRes = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-founder" }),
			});
			const otherRes = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders({ "X-Identity": "u-other" }),
			});

			const founderBody = (await founderRes.json()) as { thread: { id: string; hostId: string } };
			const otherBody = (await otherRes.json()) as { thread: { id: string; hostId: string } };

			expect(founderBody.thread.id).not.toBe(otherBody.thread.id);
			expect(founderBody.thread.hostId).toBe("u-founder");
			expect(otherBody.thread.hostId).toBe("u-other");
		});
	});

	describe("AC-17: identities include seed-agent-cos (CoC agent)", () => {
		it("identities response contains seed-agent-cos with name 'Chief of Staff'", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as {
				identities: Record<string, { name: string; role?: string }>;
			};
			expect(body.identities).toHaveProperty("seed-agent-cos");
			const cocIdentity = body.identities["seed-agent-cos"];
			expect(cocIdentity?.name).toBe("Chief of Staff");
		});

		it("identities response contains the user identity", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
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
		it("response contains thread, messages, headMessageId, and identities keys", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("thread");
			expect(body).toHaveProperty("messages");
			expect(body).toHaveProperty("headMessageId");
			expect(body).toHaveProperty("identities");
		});

		it("messages is an array", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { messages: unknown };
			expect(Array.isArray(body.messages)).toBe(true);
		});
	});

	describe("Coach thread classifies as 'coach' configuration", () => {
		it("thread with hostKind='user' and pinned=true is classified as 'coach'", async () => {
			const res = await ctx.app.request("/api/threads/coach", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { thread: { hostKind: string; pinned: boolean } };

			// Use the pre-imported classifier from shared.
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
			expect(configuration).toBe("coach");
		});
	});
});
