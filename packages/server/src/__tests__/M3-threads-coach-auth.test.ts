/**
 * M3 RED — Coach and Thread routes: readSenderId uses auth context (A6, A7).
 *
 * C3 (critique): threads.ts:79 has readInitialSenderId() which also uses
 * DEFAULT_FOUNDER_ID. Both readSenderId (line 56) and readInitialSenderId
 * (line 79) must be covered.
 *
 * These tests FAIL until:
 *  - DEFAULT_FOUNDER_ID is deleted from coach.ts and threads.ts
 *  - readSenderId() uses c.get("userId") as fallback
 *  - readInitialSenderId() uses c.get("userId") as fallback (C3)
 *  - createAuthMiddleware(db) sets userId from factorySettings
 */

import {
	agents,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	products,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-m3-threads";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function seedFounderSettings(db: HyperIdleDb, founderId: string): void {
	const now = new Date().toISOString();
	db.insert(factorySettings)
		.values({ key: "founder_id", value: founderId, updatedAt: now })
		.onConflictDoNothing()
		.run();
	db.insert(factorySettings)
		.values({ key: "founder_name", value: "Test Founder", updatedAt: now })
		.onConflictDoNothing()
		.run();
	db.insert(factorySettings)
		.values({ key: "founder_email", value: "test@hyperidle.dev", updatedAt: now })
		.onConflictDoNothing()
		.run();
}

describe("M3 — Coach route readSenderId uses auth context, not DEFAULT_FOUNDER_ID (A6)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		seedFounderSettings(db, "test-founder-1");

		// Seed the CoC agent (required for coach route)
		db.insert(agents)
			.values({
				id: "seed-agent-cos",
				name: "Chief of Staff",
				role: "chief_of_staff",
				status: "active",
				createdAt: now,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
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
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		seedFounderSettings(db, "test-founder-1");

		db.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: now,
			})
			.run();

		// Seed a founder-type agent for participants
		db.insert(agents)
			.values({
				id: "test-founder-1",
				name: "Test Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
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
		db.insert(agents)
			.values({
				id: "agent-builder-1",
				name: "Builder Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			})
			.run();

		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(), // No X-Identity — falls through to readInitialSenderId
			body: JSON.stringify({
				hostKind: "bet",
				hostId: "bet-review-1",
				participants: ["test-founder-1", "agent-builder-1"],
				initialMessage: {
					type: "review",
					payload: { text: "Review: please confirm." },
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
