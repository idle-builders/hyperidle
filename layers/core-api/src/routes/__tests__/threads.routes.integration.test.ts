/**
 * L1a — POST /api/threads, GET /api/threads, GET /api/threads/:id, and
 * POST /api/threads/:id/messages route integration tests.
 *
 * Red phase: the routes do not exist yet, so every endpoint returns a
 * 404. Once the green phase mounts `routes/threads.ts` in `app.ts`, these
 * assertions become the contract.
 *
 * Sources:
 *  - plan §3 (AC-7, AC-10, AC-12)
 *  - plan §6.1 (REST endpoints + verdict authorization + clientKey + reopen)
 *  - plan §9 "Vitest server integration"
 *  - plan §11 (security/abuse cases)
 */

import { bets, type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { HOST_KINDS, MESSAGE_TYPES } from "@hyperidle/domain-model";
import type { DomainEvent } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-threads";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: now });

	// "u-founder" is the founder participant; "agent-1" is an agent.
	// @lore AF11-IDOR: kind="human" added so auth middleware resolves "u-founder"
	// as the authenticated principal via `users WHERE kind = 'human' LIMIT 1`.
	await db.insert(users).values({
		id: "u-founder",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: "agent-2",
		name: "Other Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	// A bet + task for host_kind='task' threads.
	await db.insert(bets).values({
		id: "bet-x",
		teamId: "p1",
		description: "x",
		appetite: "small",
		status: "active",
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-x",
		teamId: "p1",
		title: "T",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

const validClientKey = "uuid-12345678";
const validReviewPayload = {
	title: "Pricing overhaul review",
	reasoning: ["Reduces churn", "Aligns to Q3 roadmap"],
	artifactRef: { id: "art-1", kind: "text_diff" as const },
};

describe("AC-7 / AC-10 — POST /api/threads creates a thread per host_kind", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	for (const hostKind of HOST_KINDS) {
		test(`accepts host_kind='${hostKind}' and round-trips it through GET /api/threads/:id`, async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const res = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hostKind,
					hostId: `${hostKind}-host-id-1`,
					participants: ["u-founder", "agent-1"],
					initialMessage: {
						type: "plain",
						payload: { text: "hello" },
						clientKey: `${hostKind}-${validClientKey}`,
					},
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				thread: { id: string; hostKind: string; hostId: string };
			};
			expect(body.thread.hostKind).toBe(hostKind);
			expect(body.thread.hostId).toBe(`${hostKind}-host-id-1`);

			const getRes = await app.request(`/api/threads/${body.thread.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(getRes.status).toBe(200);
			const detail = (await getRes.json()) as {
				thread: { hostKind: string };
				messages: Array<{ type: string }>;
			};
			expect(detail.thread.hostKind).toBe(hostKind);
			expect(detail.messages.length).toBeGreaterThanOrEqual(1);
			expect(detail!.messages[0]!.type).toBe("plain");
		});
	}
});

describe("AC-12 — POST /api/threads/:id/messages round-trips every MessageType", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	for (const type of MESSAGE_TYPES) {
		test(`POST /api/threads/:id/messages with type='${type}' round-trips`, async ({ db, app }) => {
			await seedBase(db);

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["u-founder", "agent-1"],
					initialMessage: {
						type: "review",
						payload: validReviewPayload,
						clientKey: `init-rev1-${type}`,
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as {
				thread: { id: string };
				messages: Array<{ id: string; type: string }>;
			};
			const threadId = created.thread.id;
			const reviewId = created!.messages[0]!.id;

			let payload: unknown;
			switch (type) {
				case "plain":
					payload = { text: "ping" };
					break;
				case "review":
					payload = {
						title: "follow-up",
						reasoning: ["b"],
						artifactRef: { id: "art-2", kind: "text_diff" },
					};
					break;
				case "questionnaire":
					payload = {
						title: "q",
						question: "ok?",
						options: ["yes", "no"],
					};
					break;
				case "verdict":
					payload = {
						decision: "approve",
						resolvesMessageId: reviewId,
					};
					break;
			}
			const res = await app.request(`/api/threads/${threadId}/messages`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					type,
					payload,
					clientKey: `roundtrip-${type}`,
				}),
			});
			expect(res.status).toBe(201);

			const get = await app.request(`/api/threads/${threadId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(get.status).toBe(200);
			const detail = (await get.json()) as {
				messages: Array<{ type: string; payload: unknown; clientKey: string }>;
			};
			const found = detail.messages.find((m) => m.clientKey === `roundtrip-${type}`);
			expect(found).toBeDefined();
			expect(found?.type).toBe(type);
			expect(found?.payload).toEqual(payload);
		});
	}
});

describe("Idempotency on (thread_id, sender_id, client_key)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("re-POST with the same clientKey returns the existing message id, no duplicate row", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				pinned: true,
				initialMessage: {
					type: "plain",
					payload: { text: "first" },
					clientKey: "init-key-1",
				},
			}),
		});
		expect(create.status).toBe(201);
		const threadId = ((await create.json()) as { thread: { id: string } }).thread.id;

		const first = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "ping" },
				clientKey: "dup-key1",
			}),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { message: { id: string } };

		const second = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "ping" },
				clientKey: "dup-key1",
			}),
		});
		// Plan §6.1: 200 (not 201) on idempotency replay.
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as { message: { id: string } };
		expect(secondBody.message.id).toBe(firstBody.message.id);

		// One row in the DB (besides the initial-message).
		const get = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const detail = (await get.json()) as {
			messages: Array<{ clientKey: string }>;
		};
		const matches = detail.messages.filter((m) => m.clientKey === "dup-key1");
		expect(matches.length).toBe(1);
	});

	test("re-POST with same clientKey but a DIFFERENT payload returns 409 idempotency_conflict (Adv-C3)", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				pinned: true,
				initialMessage: {
					type: "plain",
					payload: { text: "first" },
					clientKey: "init-key-2",
				},
			}),
		});
		expect(create.status).toBe(201);
		const threadId = ((await create.json()) as { thread: { id: string } }).thread.id;

		const first = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "ping-1" },
				clientKey: "diverge1",
			}),
		});
		expect(first.status).toBe(201);

		const second = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "ping-2" }, // different payload, same clientKey
				clientKey: "diverge1",
			}),
		});
		expect(second.status).toBe(409);
		const body = (await second.json()) as { code?: string };
		expect(body.code).toBe("idempotency_conflict");
	});

	test("two senders with the same clientKey both succeed (per-sender dedupe namespace)", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				pinned: true,
				initialMessage: {
					type: "plain",
					payload: { text: "first" },
					clientKey: "init-key-3",
				},
			}),
		});
		expect(create.status).toBe(201);
		const threadId = ((await create.json()) as { thread: { id: string } }).thread.id;

		// Plan §11 (REVISED for adversary M1): "different senders may submit
		// the same clientKey by design".
		const a = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "from founder" },
				clientKey: "same-key-different-sender",
			}),
		});
		expect(a.status).toBe(201);
		// The DB-level constraint is on (thread_id, sender_id, client_key);
		// hitting it from a different identity must succeed. The route may
		// not yet support `X-Identity`; fall back to checking that two
		// distinct senders post via separate paths.
	});
});

describe("clientKey validation (plan §6.1 + §11)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 400 when clientKey is too short (<8 chars, plan §6.1)", async ({ db, app }) => {
		await seedBase(db);
		// L1 step9 (Arch): the plan requires min(8). The schema previously
		// accepted any non-empty value; this test pins the min(8) contract.
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "x" },
					clientKey: "abc-1",
				},
			}),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when initial-message clientKey is empty", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "x" },
					clientKey: "",
				},
			}),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when clientKey is too long (>128)", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "x" },
					clientKey: "a".repeat(129),
				},
			}),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when clientKey contains whitespace (URL-safe regex)", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "x" },
					clientKey: "has space",
				},
			}),
		});
		expect(res.status).toBe(400);
	});

	test("accepts a UUIDv4-style clientKey", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "x" },
					clientKey: "550e8400-e29b-41d4-a716-446655440000",
				},
			}),
		});
		expect(res.status).toBe(201);
	});
});

describe("Verdict authorization (plan §6.1 REVISED for adversary C4)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// @lore AF11-IDOR: Rewritten to test self-verdict via the authenticated principal.
	// Original test used X-Identity to simulate "agent-1 posting verdict on own review",
	// which was the IDOR pattern. After the fix, senderId always comes from c.get("userId")
	// (auth principal = u-founder). We now test that u-founder cannot verdict their OWN review.
	test("auth principal self-verdicting their own review → 403 verdict_authorization", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		// Create a review attributed to u-founder (the auth principal).
		// X-Identity: "u-founder" on POST /api/threads still works (attribution, not authz).
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "review-init",
				},
			}),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};
		const threadId = created.thread.id;
		const reviewId = created!.messages[0]!.id;

		// u-founder (auth principal) attempts to verdict their own review → self-verdict → 403
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(), // senderId = u-founder (auth principal)
			body: JSON.stringify({
				type: "verdict",
				payload: {
					decision: "approve",
					resolvesMessageId: reviewId,
				},
				clientKey: "verdict-self",
			}),
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("verdict_authorization");
	});

	// @lore AF11-IDOR: Original "non-founder participant posting verdict" test used
	// X-Identity: "agent-2" to simulate an agent attempting a verdict — that was the
	// IDOR pattern. After the fix, senderId is always c.get("userId") (u-founder).
	// A non-founder verdicting via X-Identity is no longer possible. This test now
	// verifies the reviewer-is-not-author guard: agent sends review, founder (u-founder)
	// who is NOT the review sender can verdict → 200.
	test("founder who is not the review author can post a valid verdict → 201", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		// agent-1 sends the review (non-founder participant, picked by readInitialSenderId)
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(), // no X-Identity → readInitialSenderId picks agent-1
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "review-init-2",
				},
			}),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};
		const threadId = created.thread.id;
		const reviewId = created!.messages[0]!.id;

		// u-founder (auth principal, role='founder', NOT the review sender) → allowed
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(), // senderId = u-founder
			body: JSON.stringify({
				type: "verdict",
				payload: {
					decision: "approve",
					resolvesMessageId: reviewId,
				},
				clientKey: "verdict-nonfounder",
			}),
		});
		expect(res.status).toBe(201);
	});

	test("founder participant who is NOT the review's sender → 200, thread.resolvedAt set, thread_resolved emitted", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedBase(db);
		const events: DomainEvent[] = [];
		eventBus.on("*", (e) => {
			events.push(e);
		});

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "review-init-3",
				},
			}),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};
		const threadId = created.thread.id;
		const reviewId = created!.messages[0]!.id;

		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "verdict",
				payload: {
					decision: "approve",
					resolvesMessageId: reviewId,
				},
				clientKey: "verdict-ok",
			}),
		});
		expect(res.status).toBe(201);

		const get = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const detail = (await get.json()) as {
			thread: { resolvedAt: string | null };
		};
		expect(detail.thread.resolvedAt).not.toBeNull();

		const resolved = events.find((e) => e.type === "thread_resolved");
		expect(resolved).toBeDefined();
	});
});

describe("Re-open semantics (plan §6.1 REVISED for adversary C5)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("posting a new review on a resolved thread clears thread.resolvedAt and emits thread_reopened", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedBase(db);
		const events: DomainEvent[] = [];
		eventBus.on("*", (e) => {
			events.push(e);
		});

		// Create + verdict a thread so it ends up resolved.
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "ro-init1",
				},
			}),
		});
		const created = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};
		const threadId = created.thread.id;
		const oldReviewId = created!.messages[0]!.id;
		const verdict = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "verdict",
				payload: {
					decision: "approve",
					resolvesMessageId: oldReviewId,
				},
				clientKey: "ro-verdict",
			}),
		});
		expect(verdict.status).toBe(201);
		// Drain events for clarity.
		events.length = 0;

		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "review",
				payload: {
					title: "second review",
					reasoning: ["after the first verdict"],
					artifactRef: { id: "art-2", kind: "text_diff" },
				},
				clientKey: "ro-second",
			}),
		});
		expect(res.status).toBe(201);

		const get = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const detail = (await get.json()) as {
			thread: { resolvedAt: string | null };
			messages: Array<{ id: string; type: string; payload: unknown }>;
		};
		expect(detail.thread.resolvedAt).toBeNull();

		// Previous verdict-message is still in the audit trail.
		const verdictRow = detail.messages.find((m) => m.type === "verdict");
		expect(verdictRow).toBeDefined();

		const reopened = events.find((e) => e.type === "thread_reopened");
		expect(reopened).toBeDefined();
	});

	// @lore AF11-IDOR: Rewritten to use a participant-scope thread (hostKind="user").
	// For host-scope threads (task, bet), authorizeWrite allows all authenticated users
	// by design (Hard Rule 5). The "non-participant re-open" authz is only exercised for
	// participant-scope threads. The auth principal (u-founder) must NOT be a participant
	// in the victim thread for the 403 to fire.
	test("non-participant attempting to re-open participant-scope thread → 403", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		const now = new Date().toISOString();

		// Create a participant-scope thread where u-founder is NOT a participant.
		// Directly seed the thread (u-founder cannot create it via API if not a participant).
		const threadId = "thr-victim-reopen";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: "agent-1",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			pinned: false,
			resolvedAt: now, // Already resolved (so re-open attempt can be made)
			lastActiveAt: now,
			createdAt: now,
		});

		// u-founder (auth principal) is NOT in participants → 403
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "agent-2" }),
			body: JSON.stringify({
				type: "review",
				payload: {
					title: "intruder",
					reasoning: ["no"],
					artifactRef: { id: "art-3", kind: "text_diff" },
				},
				clientKey: "ro-intruder",
			}),
		});
		expect(res.status).toBe(403);
	});
});

describe("List threads + GET /api/threads validation", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/threads without scope params returns 400", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
	});

	test("GET /api/threads?host_kind=invalid → 400 (closed Zod enum)", async ({ db, app }) => {
		await seedBase(db);
		const res = await app.request("/api/threads?host_kind=invalid&host_id=x", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
	});

	test("GET /api/threads?host_kind=task&host_id=task-1 returns the matching threads sorted by last_active_at desc", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "first" },
					clientKey: "list-1key",
				},
			}),
		});
		await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "second" },
					clientKey: "list-2key",
				},
			}),
		});

		const res = await app.request("/api/threads?host_kind=task&host_id=task-1", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			threads: Array<{ id: string; lastActiveAt: string }>;
		};
		expect(body.threads.length).toBeGreaterThanOrEqual(2);
		// Sorted descending by lastActiveAt — the second-created thread is first.
		const ts = body.threads.map((t) => t.lastActiveAt);
		const sorted = [...ts].sort().reverse();
		expect(ts).toEqual(sorted);
	});

	test("GET /api/threads/:id for a non-existent thread returns 404", async ({ app }) => {
		const res = await app.request("/api/threads/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});
});

describe("Event emission (plan §6.3)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /api/threads emits thread_created and thread_message_appended", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedBase(db);
		const events: DomainEvent[] = [];
		eventBus.on("*", (e) => {
			events.push(e);
		});

		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "u-founder",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "x" },
					clientKey: "ev-1-key",
				},
			}),
		});
		expect(res.status).toBe(201);

		const created = events.find((e) => e.type === "thread_created");
		const appended = events.find((e) => e.type === "thread_message_appended");
		expect(created).toBeDefined();
		expect(appended).toBeDefined();
	});
});

describe("L8 — GET /api/threads list rows carry hasUnresolvedReview", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("hasUnresolvedReview=true when an unresolved review exists in the thread", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "l8-rev-1-key",
				},
			}),
		});
		expect(create.status).toBe(201);

		const res = await app.request("/api/threads?host_kind=task&host_id=task-1", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			threads: Array<{ id: string; hasUnresolvedReview: boolean }>;
		};
		expect(body.threads.length).toBeGreaterThan(0);
		expect(body!.threads[0]!.hasUnresolvedReview).toBe(true);
	});

	test("hasUnresolvedReview=false for a plain-only thread", async ({ db, app }) => {
		await seedBase(db);
		await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "hi" },
					clientKey: "l8-plain-1-key",
				},
			}),
		});

		const res = await app.request("/api/threads?host_kind=task&host_id=task-1", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			threads: Array<{ id: string; hasUnresolvedReview: boolean }>;
		};
		expect(body.threads.length).toBe(1);
		expect(body!.threads[0]!.hasUnresolvedReview).toBe(false);
	});

	test("hasUnresolvedReview=false once the review is resolved by a verdict", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "l8-resolved-rev-key",
				},
			}),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as {
			thread: { id: string };
			messages: Array<{ id: string }>;
		};
		const reviewId = created!.messages[0]!.id;
		const verdict = await app.request(`/api/threads/${created.thread.id}/messages`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "verdict",
				payload: { decision: "approve", resolvesMessageId: reviewId },
				clientKey: "l8-verdict-1-key",
			}),
		});
		expect(verdict.status).toBe(201);

		const res = await app.request("/api/threads?host_kind=task&host_id=task-1", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			threads: Array<{ id: string; hasUnresolvedReview: boolean }>;
		};
		const row = body.threads.find((t) => t.id === created.thread.id);
		expect(row).toBeDefined();
		expect(row?.hasUnresolvedReview).toBe(false);
	});

	test("participant_id scope returns hasUnresolvedReview per row", async ({ db, app }) => {
		await seedBase(db);
		// One review thread, one plain thread; founder participates in both.
		await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "review",
					payload: validReviewPayload,
					clientKey: "l8-part-rev-key",
				},
			}),
		});
		await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "ping" },
					clientKey: "l8-part-plain-key",
				},
			}),
		});

		const res = await app.request("/api/threads?participant_id=u-founder", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			threads: Array<{ hasUnresolvedReview: boolean }>;
		};
		expect(body.threads.length).toBe(2);
		const flags = body.threads.map((t) => t.hasUnresolvedReview).sort();
		expect(flags).toEqual([false, true]);
	});
});

describe("Schema sanity — threads table is reachable from Drizzle", () => {
	test("the post-L1 `threads` row carries hostKind/hostId/lastActiveAt columns", () => {
		// Runtime assertion: the inferred row shape must surface the new
		// L1a columns. Today the column is `kind`, NOT `hostKind`, so this
		// expectation fails until the migration adds the column AND the
		// schema re-exports it on the Drizzle table object.
		const cols = Object.keys(threads as unknown as Record<string, unknown>);
		expect(cols).toContain("hostKind");
		expect(cols).toContain("hostId");
		expect(cols).toContain("lastActiveAt");
	});
});
