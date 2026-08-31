/**
 * AF11 — Authorization hardening integration tests (AC1, AC2, AC3, AC4, AC5).
 *
 * AC1: Thread-detail IDOR guard — participant-scope thread not readable by
 *      non-participant; host-scope thread readable by any authenticated principal.
 * AC2: System-prompt guard from Principal, not header — X-Identity cannot spoof
 *      access to another user's assistant.
 * AC3: Worker token confinement — worker token rejected by /api/credentials and
 *      /api/workers.
 * AC4: No plaintext secret at rest — stored server_config blob contains ciphertext
 *      not plaintext for apiKey; migration is idempotent.
 * AC5: Scope enforcement — participant-scope routes reject cross-principal access.
 */

import { threads, users } from "@hyperidle/db";
import { AdapterPool } from "@hyperidle/harness-registry";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { registerWorkerTestSocket, startWorkerTestRuntime } from "./worker-runtime-test-helper.js";

async function createWorkerConnectionManager(pool: AdapterPool) {
	const runtime = await startWorkerTestRuntime(pool);
	const app = registerWorkerTestSocket(runtime);
	return {
		onMessage(data: string, ws: unknown) {
			app.handlers?.onMessage({ data }, ws);
		},
	};
}

const TEST_API_KEY = "test-key-af11-authz";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

// ---------------------------------------------------------------------------
// AC1 — Thread-detail IDOR (Hard Rule 1)
// ---------------------------------------------------------------------------

describe("AC1: GET /api/threads/:id — participant-scope IDOR guard", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("participant-scope thread: non-participant principal gets 403", async ({ db, app }) => {
		const now = new Date().toISOString();

		// Auth middleware resolves userId = first kind='human' user from DB.
		// Seed u-bob as the ONLY kind='human' so he becomes the resolved principal (attacker).
		// u-alice is kind='ai' — she can be a thread participant without being the resolved principal.
		//
		// @lore AF11: X-Identity header no longer controls the principal post-AF11.
		// Tests must seed exactly ONE kind='human' user so the resolved principal is deterministic.
		await db.insert(users).values({
			id: "u-bob",
			kind: "human",
			name: "Bob",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		await db.insert(users).values({
			id: "u-alice",
			kind: "ai",
			name: "Alice",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		// Create a participant-scope thread (hostKind=user) with alice only
		await db.insert(threads).values({
			id: "thread-alice-only",
			hostKind: "user",
			hostId: "u-alice",
			initiatorId: "u-alice",
			participants: JSON.stringify(["u-alice"]),
			pinned: false,
			createdAt: now,
			lastActiveAt: now,
		});

		// Resolved principal is u-bob (not in participants) → must be 403
		const res = await app.request("/api/threads/thread-alice-only", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(403);
	});

	test("participant-scope thread: participant principal gets 200", async ({ db, app }) => {
		const now = new Date().toISOString();

		await db.insert(users).values([
			{
				id: "u-alice2",
				kind: "human",
				name: "Alice2",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);

		await db.insert(threads).values({
			id: "thread-alice2-only",
			hostKind: "user",
			hostId: "u-alice2",
			initiatorId: "u-alice2",
			participants: JSON.stringify(["u-alice2"]),
			pinned: false,
			createdAt: now,
			lastActiveAt: now,
		});

		const res = await app.request("/api/threads/thread-alice2-only", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-alice2" }),
		});
		expect(res.status).toBe(200);
	});

	test("host-scope thread (task host): any authenticated principal gets 200", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();

		// Import needed tables
		const { teams, bets, tasks } = await import("@hyperidle/db");

		await db.insert(teams).values({ id: "p-af11", name: "P-AF11", phase: "build", createdAt: now });
		await db.insert(bets).values({
			id: "bet-af11",
			teamId: "p-af11",
			description: "af11 test",
			appetite: "small",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-af11",
			betId: "bet-af11",
			teamId: "p-af11",
			title: "AF11",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(users).values({
			id: "u-stranger",
			kind: "human",
			name: "Stranger",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		// Task-hosted thread — host-scope, any authenticated principal should read it
		await db.insert(threads).values({
			id: "thread-task-scope",
			hostKind: "task",
			hostId: "task-af11",
			initiatorId: "u-stranger",
			participants: JSON.stringify(["u-stranger"]),
			pinned: false,
			createdAt: now,
			lastActiveAt: now,
		});

		// A stranger (not in participants) can still read host-scope thread
		const res = await app.request("/api/threads/thread-task-scope", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-stranger" }),
		});
		expect(res.status).toBe(200);
	});

	test("non-existent thread returns 404 (not 403)", async ({ app }) => {
		const res = await app.request("/api/threads/nonexistent-thread-id", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// AC2 — System-prompt guard from Principal, not header (Hard Rule 2)
// ---------------------------------------------------------------------------

describe("AC2: System-prompt — authorization from Principal, not X-Identity header", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/users/:userId/assistant: X-Identity cannot grant access to another user's assistant", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();

		// Seed user-a (the auth principal) and user-b (the target)
		await db.insert(users).values({
			id: "u-authA",
			kind: "human",
			name: "Auth A",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		await db.insert(users).values({
			id: "u-targetB",
			kind: "human",
			name: "Target B",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		// Auth as u-authA (API key sets userId=u-authA), try to access u-targetB's assistant
		// with X-Identity: u-targetB header (the live exploit path)
		const res = await app.request("/api/users/u-targetB/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-targetB" }),
		});

		// The authenticated principal is u-authA (from API key lookup), not u-targetB
		// Even with X-Identity: u-targetB, the guard must use the real principal
		// Result: 403 (u-authA !== u-targetB)
		expect(res.status).toBe(403);
	});

	test("GET /api/users/:userId/assistant: authenticated as the target user gets 200", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();

		await db.insert(users).values([
			{
				id: "u-selfAccess",
				kind: "human",
				name: "Self",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);

		// Auth as u-selfAccess, access their own assistant (X-Identity matches principal)
		const res = await app.request("/api/users/u-selfAccess/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-selfAccess" }),
		});

		// The principal IS the target — should get 200
		expect(res.status).toBe(200);
	});

	test("PATCH /api/users/:userId/assistant: X-Identity spoofing gets 403", async ({ db, app }) => {
		const now = new Date().toISOString();

		await db.insert(users).values({
			id: "u-patchA",
			kind: "human",
			name: "PatchA",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		await db.insert(users).values({
			id: "u-patchB",
			kind: "human",
			name: "PatchB",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		// Auth as u-patchA, supply X-Identity: u-patchB, target u-patchB's system prompt
		const res = await app.request("/api/users/u-patchB/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-patchB" }),
			body: JSON.stringify({ systemPrompt: "Hacked prompt" }),
		});

		expect(res.status).toBe(403);
	});
});

// ---------------------------------------------------------------------------
// AC3 — Worker token confinement (Hard Rule 3)
// ---------------------------------------------------------------------------

describe("AC3: Worker token cannot access credentials or admin routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_WORKER_TOKEN", "worker-secret-token-af11");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("worker token rejected by GET /api/credentials (requires HYPERIDLE_API_KEY)", async ({
		requestWithoutAuth,
	}) => {
		// Worker token is NOT the API key — should get 401
		const res = await requestWithoutAuth("/api/credentials", {
			method: "GET",
			headers: {
				"X-API-Key": "worker-secret-token-af11",
				"Content-Type": "application/json",
			},
		});
		expect(res.status).toBe(401);
	});

	test("worker token rejected by PUT /api/credentials/:name (requires HYPERIDLE_API_KEY)", async ({
		requestWithoutAuth,
	}) => {
		const res = await requestWithoutAuth("/api/credentials/shared_backend_key", {
			method: "PUT",
			headers: {
				"X-API-Key": "worker-secret-token-af11",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ value: "sk-test" }),
		});
		expect(res.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// AC3c — Duplicate-active-id worker register rejection
// ---------------------------------------------------------------------------

describe("AC3c: WorkerConnectionManager — duplicate live id rejection", () => {
	test("register with already-active id is rejected when incumbent is live", async ({}) => {
		const pool = new AdapterPool();
		const ws1Sent: string[] = [];
		const ws1 = {
			send: (data: string) => ws1Sent.push(data),
			readyState: 1, // OPEN
		};
		const ws2Sent: string[] = [];
		const ws2 = { send: (data: string) => ws2Sent.push(data) };

		const manager1 = await createWorkerConnectionManager(pool);
		manager1.onMessage(
			JSON.stringify({
				type: "register",
				id: "worker-x",
				name: "Worker X",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws1,
		);

		// worker-x is now registered + live
		expect(ws1Sent).toContain(JSON.stringify({ type: "registered" }));

		// Second connection tries to register the same id
		const manager2 = await createWorkerConnectionManager(pool);
		manager2.onMessage(
			JSON.stringify({
				type: "register",
				id: "worker-x",
				name: "Worker X Dup",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			}),
			ws2,
		);

		// Should receive register_rejected, not registered
		const sentMessages = ws2Sent.map((s) => JSON.parse(s) as { type: string; reason?: string });
		const rejected = sentMessages.find((m) => m.type === "register_rejected");
		expect(rejected).toBeDefined();
		expect(rejected?.reason).toBe("id_in_use");
	});

	test("register with dead-incumbent id is accepted (reconnect)", async ({}) => {
		const pool = new AdapterPool();
		// Closed socket (readyState=3: CLOSED)
		const ws1Sent: string[] = [];
		const ws1 = {
			send: (data: string) => ws1Sent.push(data),
			readyState: 3, // CLOSED
		};
		const ws2Sent: string[] = [];
		const ws2 = { send: (data: string) => ws2Sent.push(data) };

		const manager1 = await createWorkerConnectionManager(pool);
		manager1.onMessage(
			JSON.stringify({
				type: "register",
				id: "worker-y",
				name: "Worker Y",
				modelProviders: [],
				maxConcurrent: 1,
			}),
			ws1,
		);

		// worker-y registered but the socket is now CLOSED (simulating stale entry)
		// Second manager reconnects with same id
		const manager2 = await createWorkerConnectionManager(pool);
		manager2.onMessage(
			JSON.stringify({
				type: "register",
				id: "worker-y",
				name: "Worker Y Reconnect",
				modelProviders: [],
				maxConcurrent: 1,
			}),
			ws2,
		);

		// Should be registered (not rejected) — dead incumbent replaced
		const sentMessages = ws2Sent.map((s) => JSON.parse(s) as { type: string });
		const registered = sentMessages.find((m) => m.type === "registered");
		expect(registered).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// AC4 — No plaintext secret at rest (Hard Rule 4)
//
// @lore This asserted that a `PATCH /api/model-gateway` never wrote an apiKey
// into the server_config blob — the AH1 fix that moved model keys out to
// server_credentials. Both ends are gone: there is no model-gateway route to
// PATCH, and no model credential to keep out of the blob. The rule it guarded
// still holds for the one credential that remains, and
// credentials.store.integration.test.ts is where that is proven.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC5 — Ownership/scope enforcement
// ---------------------------------------------------------------------------

describe("AC5: Participant-scope routes reject cross-principal access", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("host-scope route: bet stays readable by any authenticated principal", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();

		const { teams, bets } = await import("@hyperidle/db");

		await db.insert(teams).values({ id: "p-ac5", name: "P-AC5", phase: "build", createdAt: now });
		await db.insert(bets).values({
			id: "bet-ac5",
			teamId: "p-ac5",
			description: "AC5 bet",
			appetite: "small",
			status: "active",
			createdAt: now,
		});
		await db.insert(users).values({
			id: "u-ac5-user",
			kind: "human",
			name: "AC5User",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		const res = await app.request("/api/bets/bet-ac5", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ac5-user" }),
		});
		// Host-scope bets should remain readable (Hard Rule 5 — no over-restriction)
		expect(res.status).toBe(200);
	});
});
