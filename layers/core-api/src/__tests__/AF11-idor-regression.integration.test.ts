/**
 * AF11 — IDOR / authz-bypass regression tests.
 *
 * These tests were written to exercise the live-exploited holes found in the
 * reviewer's pass. Each test proves that spoofing X-Identity is REJECTED after
 * the fixes.
 *
 * AC coverage:
 *   CRITICAL-1: GET /api/threads/assistant IDOR via X-Identity
 *   CRITICAL-1 (sibling): GET /api/threads/coach IDOR via X-Identity
 *   CRITICAL-2: POST /api/threads/:id/messages — non-participant + spoofed sender
 *   WARNING-1: POST /api/users/:id/inbox — spoofed X-Identity header
 *
 * @lore AF11-IDOR: Before the fix, readSenderId() returned
 * `c.req.header("X-Identity") ?? c.get("userId")` — header wins.
 * After the fix these routes derive identity from c.get("userId") exclusively.
 * These tests prove the spoof is rejected by asserting the authenticated
 * principal's data is returned (not the victim's), and that non-participant
 * write attempts are forbidden.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-af11-idor";

/** Auth headers — authenticates as the first-inserted human user. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/**
 * Seed the attacker user as the authenticated principal (inserted first so
 * the auth middleware picks them as the "first human user").
 */
async function seedAttacker(db: HyperIdleDb, attackerId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: attackerId,
			kind: "human",
			name: "Attacker",
			email: "attacker@test.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

/**
 * Seed the victim user. NOT inserted first — the auth middleware will NOT
 * resolve them as the authenticated principal.
 */
async function seedVictim(db: HyperIdleDb, victimId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: victimId,
			kind: "human",
			name: "Victim",
			email: "victim@test.dev",
			role: "member",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

async function seedSystemAgent(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: "seed-agent-cos",
			name: "System Agent",
			role: "assistant",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

// ────────────────────────────────────────────────────────────────────────────
// CRITICAL-1: GET /api/threads/assistant — IDOR via X-Identity
// ────────────────────────────────────────────────────────────────────────────

describe("AF11 CRITICAL-1 — GET /api/threads/assistant IDOR via X-Identity", () => {
	test("spoofed X-Identity header is ignored — returns attacker's own thread, not victim's", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const ATK = "atk-A";
		const VIC = "vic-B";

		// Attacker authenticates first (auth middleware resolves first human user)
		await seedAttacker(db, ATK);
		await seedVictim(db, VIC);
		await seedSystemAgent(db);

		const now = new Date().toISOString();
		const atkAssistantAgent = `seed-agent-assistant-${ATK}`;
		const vicAssistantAgent = `seed-agent-assistant-${VIC}`;

		// Seed the attacker's assistant agent
		await db
			.insert(users)
			.values({
				id: atkAssistantAgent,
				name: "ATK Assistant",
				role: "assistant",
				status: "active",
				createdAt: now,
			})
			.onConflictDoNothing();

		// Seed the victim's assistant agent
		await db
			.insert(users)
			.values({
				id: vicAssistantAgent,
				name: "VIC Assistant",
				role: "assistant",
				status: "active",
				createdAt: now,
			})
			.onConflictDoNothing();

		// Pre-create victim's assistant thread (hostKind="user", hostId=VIC)
		await db.insert(threads).values({
			id: `thr-ast-${VIC}`,
			hostKind: "user",
			hostId: VIC,
			initiatorId: VIC,
			participants: JSON.stringify([VIC, vicAssistantAgent].sort()),
			pinned: false,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		});

		// Attacker requests with spoofed X-Identity: vic-B
		const res = await app.request("/api/threads/assistant", {
			headers: authHeaders({ "X-Identity": VIC }),
		});

		// Must succeed (attacker has a valid auth)
		expect([200, 201]).toContain(res.status);

		const body = (await res.json()) as { thread?: { hostId?: string } };
		// Thread hostId must be ATK (authenticated principal), NOT VIC (spoofed header)
		expect(body.thread?.hostId).toBe(ATK);
		expect(body.thread?.hostId).not.toBe(VIC);

		vi.unstubAllEnvs();
	});
});

// ────────────────────────────────────────────────────────────────────────────
// CRITICAL-1 (sibling): GET /api/threads/coach — IDOR via X-Identity
// ────────────────────────────────────────────────────────────────────────────

describe("AF11 CRITICAL-1 sibling — GET /api/threads/coach IDOR via X-Identity", () => {
	test("spoofed X-Identity header is ignored — returns attacker's own coach thread, not victim's", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const ATK = "atk-A";
		const VIC = "vic-B";

		await seedAttacker(db, ATK);
		await seedVictim(db, VIC);
		await seedSystemAgent(db);

		const now = new Date().toISOString();

		// Pre-create victim's pinned coach thread
		await db.insert(threads).values({
			id: `thr-coach-${VIC}`,
			hostKind: "user",
			hostId: VIC,
			initiatorId: VIC,
			participants: JSON.stringify([VIC, "seed-agent-cos"].sort()),
			pinned: true,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		});

		// Attacker requests with spoofed X-Identity: vic-B
		const res = await app.request("/api/threads/coach", {
			headers: authHeaders({ "X-Identity": VIC }),
		});

		expect([200, 201]).toContain(res.status);

		const body = (await res.json()) as { thread?: { hostId?: string } };
		// Thread hostId must be ATK (authenticated principal), NOT VIC (spoofed header)
		expect(body.thread?.hostId).toBe(ATK);
		expect(body.thread?.hostId).not.toBe(VIC);

		vi.unstubAllEnvs();
	});
});

// ────────────────────────────────────────────────────────────────────────────
// CRITICAL-2: POST /api/threads/:id/messages — non-participant + spoofed sender
// ────────────────────────────────────────────────────────────────────────────

describe("AF11 CRITICAL-2 — POST /api/threads/:id/messages non-participant spoofed sender", () => {
	test("non-participant attacker with spoofed X-Identity is rejected with 403", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const ATK = "atk-A";
		const PART = "part-P"; // legitimate participant
		const now = new Date().toISOString();

		// ATK is the authenticated principal (first human user)
		await seedAttacker(db, ATK);

		// Seed the legitimate participant
		await db
			.insert(users)
			.values({ id: PART, name: "Participant", role: "member", status: "active", createdAt: now })
			.onConflictDoNothing();

		// Create a participant-scope thread (hostKind="user") where ATK is NOT a participant.
		// participant-scope means only listed participants can write (authorizeWrite enforces this).
		// host-scope threads (bet, task) allow any authenticated user to write by design (Hard Rule 5).
		const threadId = "thr-victim-thread-1";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: PART,
			initiatorId: PART,
			participants: JSON.stringify([PART].sort()),
			pinned: false,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		});

		// Attacker sends with spoofed X-Identity: part-P (a real participant)
		// Before fix: senderId=PART (from header) → passes participant check → 201
		// After fix:  senderId=ATK  (from auth)   → ATK not in participants    → 403
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": PART }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Injected message from attacker" },
				clientKey: crypto.randomUUID(),
			}),
		});

		// Must be 403 — ATK is not a participant; spoofing X-Identity cannot bypass the check
		expect(res.status).toBe(403);

		// Verify no message was persisted
		const persisted = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(persisted).toHaveLength(0);

		vi.unstubAllEnvs();
	});

	test("message senderId is the authenticated principal, not the X-Identity header value", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const ATK = "atk-A";
		const NOW = new Date().toISOString();

		// ATK is the authenticated principal AND a legitimate participant
		await seedAttacker(db, ATK);

		const threadId = "thr-atk-own-thread";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: "bet-y",
			initiatorId: ATK,
			participants: JSON.stringify([ATK].sort()),
			pinned: false,
			resolvedAt: null,
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		// ATK sends with a different X-Identity header (trying to forge attribution)
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "some-other-user" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hello from ATK" },
				clientKey: crypto.randomUUID(),
			}),
		});

		// Must succeed (ATK is a participant)
		expect(res.status).toBe(201);

		const body = (await res.json()) as { message?: { senderId?: string } };
		// senderId must be the authenticated principal ATK, NOT the spoofed header value
		expect(body.message?.senderId).toBe(ATK);
		expect(body.message?.senderId).not.toBe("some-other-user");

		vi.unstubAllEnvs();
	});
});

// WARNING-1 (POST /api/users/:id/inbox — door #93) was deleted (dead inbox surface).
// Test removed with the route.
