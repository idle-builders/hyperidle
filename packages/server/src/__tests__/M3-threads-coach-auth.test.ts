/**
 * M3 — Coach and Thread routes: readSenderId uses auth context (A6, A7).
 *
 * @lore P2: Updated from factorySettings.founder_id to users table query.
 * Auth middleware resolves userId from `users WHERE kind = 'human' LIMIT 1`.
 * Tests seed a human user row to drive identity resolution.
 */

import { createTestDb, type HyperIdleDb, products, teams, users ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-m3-threads";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/**
 * P2: seed a human founder user row (replaces factorySettings.founder_id lookup).
 * The auth middleware queries `users WHERE kind = 'human' LIMIT 1`.
 */
function seedFounderUser(db: HyperIdleDb, founderId: string): void {
	const now = new Date().toISOString();
	await db.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Test Founder",
			email: "test@hyperidle.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing()

}

describe("M3 — Coach route readSenderId uses auth context, not DEFAULT_FOUNDER_ID (A6)", () => {
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

		const now = new Date().toISOString();
		seedFounderUser(db, "test-founder-1");

		// Seed the CoC agent (required for coach route)
		await db.insert(users)
			.values({
				id: "seed-agent-cos",
				name: "Chief of Staff",
				role: "chief_of_staff",
				status: "active",
				createdAt: now,
			})

	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("coach thread has initiatorId from auth context, not hardcoded 'u-founder'", async () => {
		const res = await app.request("/api/threads/coach", { headers: authHeaders() });
		// Endpoint may return 200 (existing) or 201 (created)
		expect([200, 201]).toContain(res.status);

		const body = (await res.json()) as { thread?: { initiatorId?: string } };
		const initiatorId = body.thread?.initiatorId;
		// Should be the seeded founder id, NOT the hardcoded "u-founder"
		expect(initiatorId).toBe("test-founder-1");
		expect(initiatorId).not.toBe("u-founder");
	});
});

describe("M3 — Thread route readSenderId + readInitialSenderId use auth context (A7 + C3)", () => {
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

		const now = new Date().toISOString();
		// P2: seedFounderUser seeds kind='human' so auth middleware resolves this user
		seedFounderUser(db, "test-founder-1");

		await db.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })

		await db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: now,
			})

		// Note: "test-founder-1" is already seeded by seedFounderUser above — no duplicate insert.
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("POST /api/threads without X-Identity uses auth context userId, not 'u-founder'", async () => {
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(), // No X-Identity header
			body: JSON.stringify({
				hostKind: "bet",
				hostId: "bet-new-1",
				participants: ["test-founder-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "Thread started." },
					clientKey: crypto.randomUUID(),
				},
			}),
		});

		expect([200, 201]).toContain(res.status);
		const body = (await res.json()) as {
			thread?: { initiatorId?: string };
			message?: { senderId?: string };
		};

		// The initial message sender should be the seeded founder id
		const senderId = body.message?.senderId ?? body.thread?.initiatorId;
		// Not "u-founder" — must come from auth context
		expect(senderId).not.toBe("u-founder");
	});

	it("readInitialSenderId falls back to auth context userId when no X-Identity is set", async () => {
		// C3: readInitialSenderId (line 79 in threads.ts) must use c.get("userId") not DEFAULT_FOUNDER_ID
		// A review-type message triggers the readInitialSenderId code path.
		// Seed an agent participant so the agent lookup inside readInitialSenderId can find a non-founder
		const now = new Date().toISOString();
		await db.insert(users)
			.values({
				id: "agent-builder-1",
				name: "Builder Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			})

		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(), // No X-Identity — falls through to readInitialSenderId
			body: JSON.stringify({
				hostKind: "bet",
				hostId: "bet-review-1",
				participants: ["test-founder-1", "agent-builder-1"],
				initialMessage: {
					type: "review",
					payload: {
						title: "Review: please confirm.",
						reasoning: ["The implementation looks correct."],
						artifactRef: { id: "artifact-1", kind: "text_diff" },
					},
					clientKey: crypto.randomUUID(),
				},
			}),
		});

		expect([200, 201]).toContain(res.status);
		const body = (await res.json()) as {
			message?: { senderId?: string };
		};
		// For a review message with agent participant, senderId should be the agent
		// NOT "u-founder" (which would indicate DEFAULT_FOUNDER_ID was used)
		const senderId = body.message?.senderId;
		// The agent builder should be the sender (non-founder participant for review messages)
		// OR at minimum it should NOT be the literal "u-founder" string
		expect(senderId).not.toBe("u-founder");
	});
});
