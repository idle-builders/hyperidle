/**
 * P5 — /api/hint-progress route integration tests (Task 3, AC3 + AC4 + AC8)
 *
 * AC coverage:
 * AC3: GET /api/hint-progress returns dismissed hints for the authenticated user.
 * AC4: POST /api/hint-progress/:hintId/dismiss records dismissal.
 *   - Returns { ok: true } on success.
 *   - Returns 400 if hintId is not in the catalog.
 *   - Returns 409 if already dismissed.
 * AC8: Per-user isolation — user B sees empty after user A dismisses.
 *
 * @lore P5: The auth middleware resolves userId from `users WHERE kind = 'human'
 * LIMIT 1`. For per-user isolation tests (AC8), separate db instances and
 * separate app instances are used — each db is seeded with a different human
 * user, so each app maps its API key to a different userId. This mirrors the
 * single-human desktop model.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { createTestDb } from "@hyperidle/db/testing";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-hints";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

const NOW = new Date().toISOString();

/** Seed base user for standard fixture-based tests. */
async function seedUser(db: HyperIdleDb, userId = "u-human-1"): Promise<void> {
	await db.insert(users).values({
		id: userId,
		kind: "human",
		name: "Test Founder",
		email: `${userId}@example.com`,
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

/** Create a standalone app with its own DB for per-user isolation tests. */
async function makeIsolatedApp(userId: string): Promise<{
	app: Awaited<ReturnType<typeof createTestApp>>;
	db: HyperIdleDb;
	close: () => Promise<void>;
}> {
	const handle = await createTestDb();
	const db = handle.db;
	await db.insert(users).values({
		id: userId,
		kind: "human",
		name: `User ${userId}`,
		email: `${userId}@example.com`,
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	const { EventBus } = await import("@hyperidle/shared");
	const app = await createTestApp({ db, eventBus: new EventBus() });
	return { app, db, close: handle.close.bind(handle) };
}

describe("GET /api/hint-progress", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC3: Empty state
	test("returns { dismissed: [] } when no hints have been dismissed", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/hint-progress", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty("dismissed");
		expect(body.dismissed).toEqual([]);
	});

	// AC3: Returns rows for the authenticated user
	test("returns dismissed hints with hintId and seenAt for the authenticated user", async ({
		db,
		app,
	}) => {
		await seedUser(db);
		// Dismiss a hint first
		await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});

		const res = await app.request("/api/hint-progress", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.dismissed).toHaveLength(1);
		expect(body.dismissed[0].hintId).toBe("create-bet");
		expect(typeof body.dismissed[0].seenAt).toBe("string");
		// seenAt is an ISO timestamp
		expect(new Date(body.dismissed[0].seenAt).toISOString()).toBeTruthy();
	});

	// AC3: Multiple dismissed hints are all returned
	test("returns all dismissed hints when multiple have been dismissed", async ({ db, app }) => {
		await seedUser(db);
		await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});
		await app.request("/api/hint-progress/add-credential/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});

		const res = await app.request("/api/hint-progress", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.dismissed).toHaveLength(2);
		const hintIds = body.dismissed.map((d: { hintId: string }) => d.hintId);
		expect(hintIds).toContain("create-bet");
		expect(hintIds).toContain("add-credential");
	});

	// Auth: unauthenticated request returns 401
	test("returns 401 when no API key is provided", async ({ app }) => {
		const res = await app.request("/api/hint-progress", {
			method: "GET",
		});

		expect(res.status).toBe(401);
	});
});

describe("POST /api/hint-progress/:hintId/dismiss", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC4: Returns { ok: true } on successful dismiss
	test("returns { ok: true } when dismissing a valid hint for the first time", async ({
		db,
		app,
	}) => {
		await seedUser(db);
		const res = await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
	});

	// AC4: GET after dismiss shows the hint as dismissed
	test("GET after dismiss returns the dismissed hint in the list", async ({ db, app }) => {
		await seedUser(db);
		await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});

		const res = await app.request("/api/hint-progress", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		const found = body.dismissed.find((d: { hintId: string }) => d.hintId === "create-bet");
		expect(found).toBeDefined();
		expect(found.hintId).toBe("create-bet");
	});

	// AC4: Returns 409 on duplicate dismiss
	test("returns 409 when dismissing the same hint a second time", async ({ db, app }) => {
		await seedUser(db);
		// First dismiss succeeds
		const first = await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(first.status).toBe(200);

		// Second dismiss returns 409
		const second = await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(second.status).toBe(409);
		const body = await second.json();
		expect(body).toHaveProperty("error");
	});

	// AC4: Returns 400 for invalid hint ID
	test("returns 400 when dismissing an unknown hint ID", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/hint-progress/not-a-hint/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toHaveProperty("error");
	});

	// AC4: Another valid hint ID also works
	test("returns { ok: true } when dismissing add-credential", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/hint-progress/add-credential/dismiss", {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
	});

	// AC4: All 4 valid hint IDs can be dismissed
	test("accepts all 4 valid hint IDs", async ({ db, app }) => {
		await seedUser(db);
		const hintIds = ["create-bet", "add-credential", "knowledge-empty", "review-verdict"];

		for (const hintId of hintIds) {
			const res = await app.request(`/api/hint-progress/${hintId}/dismiss`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		}
	});

	// Auth: unauthenticated request returns 401
	test("returns 401 when no API key is provided", async ({ app }) => {
		const res = await app.request("/api/hint-progress/create-bet/dismiss", {
			method: "POST",
		});

		expect(res.status).toBe(401);
	});
});

describe("GET /api/hint-progress — per-user isolation (AC8)", () => {
	/**
	 * @lore P5 AC8: Per-user isolation is tested by creating two completely
	 * separate app instances, each backed by a different in-memory database.
	 * Each db is seeded with a different human user. The auth middleware
	 * (users WHERE kind = 'human' LIMIT 1) maps API calls to the seeded user.
	 * User A dismisses on appA; User B's appB sees its own empty state.
	 */
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("user B sees empty dismissed list after user A dismisses a hint", async ({}) => {
		const ctxA = await makeIsolatedApp("user-a");
		const ctxB = await makeIsolatedApp("user-b");

		try {
			// User A dismisses create-bet
			const dismissRes = await ctxA.app.request("/api/hint-progress/create-bet/dismiss", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(dismissRes.status).toBe(200);

			// User A sees it dismissed
			const getResA = await ctxA.app.request("/api/hint-progress", {
				method: "GET",
				headers: authHeaders(),
			});
			const bodyA = await getResA.json();
			expect(bodyA.dismissed).toHaveLength(1);
			expect(bodyA.dismissed[0].hintId).toBe("create-bet");

			// User B sees empty dismissed list
			const getResB = await ctxB.app.request("/api/hint-progress", {
				method: "GET",
				headers: authHeaders(),
			});
			const bodyB = await getResB.json();
			expect(bodyB.dismissed).toEqual([]);
		} finally {
			await ctxA.close();
			await ctxB.close();
		}
	});

	test("dismissals in user A's app do not affect user B's hint state", async ({}) => {
		const ctxA = await makeIsolatedApp("user-x");
		const ctxB = await makeIsolatedApp("user-y");

		try {
			// User A dismisses all 4 hints
			for (const hintId of ["create-bet", "add-credential", "knowledge-empty", "review-verdict"]) {
				await ctxA.app.request(`/api/hint-progress/${hintId}/dismiss`, {
					method: "POST",
					headers: authHeaders(),
				});
			}

			// User A has all 4 dismissed
			const resA = await ctxA.app.request("/api/hint-progress", {
				method: "GET",
				headers: authHeaders(),
			});
			const bodyA = await resA.json();
			expect(bodyA.dismissed).toHaveLength(4);

			// User B still has none dismissed
			const resB = await ctxB.app.request("/api/hint-progress", {
				method: "GET",
				headers: authHeaders(),
			});
			const bodyB = await resB.json();
			expect(bodyB.dismissed).toEqual([]);
		} finally {
			await ctxA.close();
			await ctxB.close();
		}
	});
});
