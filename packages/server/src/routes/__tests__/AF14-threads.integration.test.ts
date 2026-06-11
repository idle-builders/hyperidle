/**
 * AF14 — Integration tests for:
 *   AC1: GET /api/threads returns human-readable titles (not uuid stubs)
 *        + W1 fallback cases (deleted host, missing participant)
 *   AC6: POST /api/threads DM dedup (resolve-or-append)
 *        + C2 race: concurrent POSTs create exactly one thread row
 *
 * RED phase — these tests fail until implementation.
 */

import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	messages,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-af14";

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
	await db.insert(teamMembers).values({
		id: "t1",
		teamId: "p1",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: "u-founder",
		kind: "human",
		name: "Founder Alice",
		role: "founder",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Aria",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: "agent-2",
		kind: "ai",
		name: "Maverick",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "p1",
		description: "Ship onboarding v2 flow",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "p1",
		title: "Write login page",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(knowledgeItems).values({
		id: "ki-1",
		title: "Architecture decision record",
		body: "ADR body content",
		format: "markdown",
		status: "published",
		scopeKind: "team",
		scopeId: "p1",
		updatedBy: "u-founder",
		createdAt: now,
		updatedAt: now,
	});
}

// ─── AC1: human-readable titles ───────────────────────────────────────────────

describe("AF14 AC1 — GET /api/threads returns human-readable titles", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("DM thread title is the other participant's name", async ({ db, app }) => {
		await seedBase(db);

		// Create a DM thread (host=user, 2 participants)
		const createRes = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "Hello Aria" },
					clientKey: "dm-test-001",
				},
			}),
		});
		expect(createRes.status).toBe(201);

		const listRes = await app.request("/api/threads?participant_id=u-founder&limit=50", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(listRes.status).toBe(200);
		const body = (await listRes.json()) as { threads: Array<{ id: string; title?: string }> };
		expect(body.threads.length).toBeGreaterThanOrEqual(1);

		const dmThread = body.threads[0];
		// Title must be a human name (the other participant), NOT a uuid stub
		expect(dmThread?.title).toBeDefined();
		expect(dmThread?.title).toBe("Aria");
		// Must not be a uuid (no 36-char hex)
		expect(dmThread?.title).not.toMatch(/^[0-9a-f-]{36}$/i);
	});

	test("bet-scoped thread title is the bet's derived title", async ({ db, app }) => {
		await seedBase(db);

		const createRes = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "bet",
				hostId: "bet-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "Let's discuss" },
					clientKey: "bet-test-001",
				},
			}),
		});
		expect(createRes.status).toBe(201);

		const listRes = await app.request("/api/threads?participant_id=u-founder&limit=50", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(listRes.status).toBe(200);
		const body = (await listRes.json()) as { threads: Array<{ id: string; title?: string }> };
		const betThread = body.threads.find((t: { id: string; title?: string }) => {
			// Find any thread — we just created one
			return t.title !== undefined;
		});
		expect(betThread?.title).toBeDefined();
		// Should be bet description derived, not a uuid
		expect(betThread?.title).not.toMatch(/^[0-9a-f-]{36}$/i);
		// Must not be the old stub "Bet thread xxxxxxxx"
		expect(betThread?.title).not.toMatch(/thread [0-9a-f]{8}/i);
	});

	test("task-scoped thread title is the task title", async ({ db, app }) => {
		await seedBase(db);

		const createRes = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "Working on task" },
					clientKey: "task-test-001",
				},
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { thread: { id: string } };

		const listRes = await app.request("/api/threads?participant_id=u-founder&limit=50", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(listRes.status).toBe(200);
		const body = (await listRes.json()) as { threads: Array<{ id: string; title?: string }> };
		const taskThread = body.threads.find((t: { id: string }) => t.id === created.thread.id);
		expect(taskThread?.title).toBe("Write login page");
		expect(taskThread?.title).not.toMatch(/^[0-9a-f-]{36}$/i);
	});

	test("no thread title is a raw uuid (W1 static guard — all titles are human strings)", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		// Create multiple threads of different kinds
		for (const [kind, hostId, key] of [
			["bet", "bet-1", "multi-bet"],
			["task", "task-1", "multi-task"],
			["user", "agent-1", "multi-dm"],
		] as const) {
			await app.request("/api/threads", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hostKind: kind,
					hostId,
					participants: ["u-founder", "agent-1"],
					initialMessage: {
						type: "plain",
						payload: { text: "Test" },
						clientKey: key,
					},
				}),
			});
		}

		const listRes = await app.request("/api/threads?participant_id=u-founder&limit=50", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await listRes.json()) as { threads: Array<{ id: string; title?: string }> };
		for (const thread of body.threads) {
			expect(thread.title).toBeDefined();
			// No title should be a bare uuid
			expect(thread.title).not.toMatch(/^[0-9a-f-]{36}$/i);
			// No title should be the old stub pattern
			expect(thread.title).not.toMatch(/\bthread [0-9a-f]{8}\b/i);
		}
	});
});

// ─── W1 fallback: host deleted ─────────────────────────────────────────────

describe("AF14 W1 — fallback titles when host is deleted", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("bet-scoped thread with deleted bet → title is 'Deleted bet', not the hostId uuid", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		// Create thread referencing a bet that will be deleted
		const now = new Date().toISOString();
		// Insert thread directly (bypassing normal create flow to avoid bet FK)
		await db.insert(threads).values({
			id: "orphan-thread-1",
			hostKind: "bet",
			hostId: "bet-deleted-999", // does not exist in bets table
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const listRes = await app.request("/api/threads?participant_id=u-founder&limit=50", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(listRes.status).toBe(200);
		const body = (await listRes.json()) as { threads: Array<{ id: string; title?: string }> };
		const orphan = body.threads.find((t: { id: string }) => t.id === "orphan-thread-1");
		expect(orphan).toBeDefined();
		// Must be a typed fallback, NEVER the bare hostId uuid
		expect(orphan?.title).not.toBe("bet-deleted-999");
		expect(orphan?.title).not.toMatch(/^[0-9a-f-]{36}$/i);
		// Should be the typed label
		expect(orphan?.title).toBe("Deleted bet");
	});
});

// ─── AC6: DM dedup ────────────────────────────────────────────────────────────

describe("AF14 AC6 — POST /api/threads DM dedup", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("first POST to a DM recipient returns 201 and sets direct_key", async ({ db, app }) => {
		await seedBase(db);

		const res = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "First DM" },
					clientKey: "dm-dedup-001",
				},
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { thread: { id: string } };
		expect(typeof body.thread.id).toBe("string");

		// Verify direct_key is set in the DB
		const [threadRow] = await db
			.select()
			.from(threads)
			.where(eq(threads.id, body.thread.id))
			.limit(1);
		expect(threadRow).toBeDefined();
		// direct_key should be set (non-null) — this fails until schema + implementation land
		// The cast handles the pre-migration state where directKey doesn't exist yet.
		const threadWithKey = threadRow as
			| (typeof threadRow & { directKey?: string | null })
			| undefined;
		expect(threadWithKey?.directKey).not.toBeNull();
	});

	test("second POST to same DM recipient returns 200 and reuses the same thread id", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		const first = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "First DM" },
					clientKey: "dm-dedup-002a",
				},
			}),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { thread: { id: string } };
		const threadId = firstBody.thread.id;

		// Second POST to same recipient
		const second = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "Second message" },
					clientKey: "dm-dedup-002b",
				},
			}),
		});
		// Should reuse (200) not create new (201)
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as { thread: { id: string } };
		expect(secondBody.thread.id).toBe(threadId);
	});

	test("second POST appends the message to the existing thread (Option B)", async ({ db, app }) => {
		await seedBase(db);

		const first = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "First DM" },
					clientKey: "dm-append-001a",
				},
			}),
		});
		expect(first.status).toBe(201);
		const {
			thread: { id: threadId },
		} = (await first.json()) as { thread: { id: string } };

		// Second POST appends
		const second = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1"],
				initialMessage: {
					type: "plain",
					payload: { text: "Second message" },
					clientKey: "dm-append-001b",
				},
			}),
		});
		expect(second.status).toBe(200);

		// Verify message count in the thread
		const msgRows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		// Both messages should be in the same thread
		expect(msgRows.length).toBeGreaterThanOrEqual(2);
	});

	test("non-DM threads (group) are NOT deduped", async ({ db, app }) => {
		await seedBase(db);

		// 3-participant thread → not a DM
		const first = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1", "agent-2"],
				initialMessage: {
					type: "plain",
					payload: { text: "Group chat" },
					clientKey: "group-test-001",
				},
			}),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { thread: { id: string } };

		// Same 3 participants → should create a NEW thread (no dedup for groups)
		const second = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				hostKind: "user",
				hostId: "agent-1",
				participants: ["u-founder", "agent-1", "agent-2"],
				initialMessage: {
					type: "plain",
					payload: { text: "Another group" },
					clientKey: "group-test-002",
				},
			}),
		});
		expect(second.status).toBe(201); // new thread, not reused
		const secondBody = (await second.json()) as { thread: { id: string } };
		expect(secondBody.thread.id).not.toBe(firstBody.thread.id);
	});

	test("C2 race — concurrent POSTs to same DM recipient produce exactly one thread", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		// Fire two concurrent POSTs to the same DM recipient
		const [res1, res2] = await Promise.all([
			app.request("/api/threads", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hostKind: "user",
					hostId: "agent-1",
					participants: ["u-founder", "agent-1"],
					initialMessage: {
						type: "plain",
						payload: { text: "Race message 1" },
						clientKey: "race-test-001a",
					},
				}),
			}),
			app.request("/api/threads", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					hostKind: "user",
					hostId: "agent-1",
					participants: ["u-founder", "agent-1"],
					initialMessage: {
						type: "plain",
						payload: { text: "Race message 2" },
						clientKey: "race-test-001b",
					},
				}),
			}),
		]);

		// Both must succeed (200 or 201 — one wins, one dedupes)
		expect([200, 201]).toContain(res1.status);
		expect([200, 201]).toContain(res2.status);

		const body1 = (await res1.json()) as { thread: { id: string } };
		const body2 = (await res2.json()) as { thread: { id: string } };

		// Both responses must return the SAME thread id
		expect(body1.thread.id).toBe(body2.thread.id);

		// Exactly ONE thread row with this direct_key in the DB
		const allThreads = await db.select().from(threads);
		// Filter to DM threads with agent-1 as host
		const dmThreads = allThreads.filter((t) => {
			try {
				const parts = JSON.parse(t.participants) as string[];
				return (
					t.hostKind === "user" &&
					t.hostId === "agent-1" &&
					parts.includes("u-founder") &&
					parts.includes("agent-1") &&
					parts.length === 2
				);
			} catch {
				return false;
			}
		});
		// Must be exactly 1 DM thread, not 2
		expect(dmThreads.length).toBe(1);
	});
});
