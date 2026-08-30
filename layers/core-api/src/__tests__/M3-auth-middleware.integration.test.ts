/**
 * M3 — Auth middleware: createAuthMiddleware(db) sets userId from users table.
 *
 * @lore P2: Updated from factorySettings.founder_id lookup to users table query.
 * The middleware now queries `users WHERE kind = 'human' LIMIT 1` after API key
 * validation. Tests seed a human user row instead of factorySettings founder_id.
 * The fallback to "u-founder" is preserved for unseeded DBs.
 *
 * BB1 note: the A5 "revision log actor" describe block was deleted along with the
 * bet routes and revisionLog concept. The actor-in-context property is covered by
 * `PATCH /tasks/:id` preserving `userId` from the auth context in `outcomeRecordedBy`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { users } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-m3-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedFounderUser(db: HyperIdleDb, founderId = "test-founder-1"): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Test Founder",
			email: "test@hyperidle.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

describe("M3 — Auth middleware: createAuthMiddleware(db) (A3)", () => {
	test("sets userId on context from users table (kind=human)", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderUser(db, "test-founder-1");
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("test-founder-1");
		expect(body.id).not.toBe("u-founder");
		vi.unstubAllEnvs();
	});

	test("falls back to u-founder when no human user is seeded (backward compat)", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("u-founder");
		vi.unstubAllEnvs();
	});

	test("returns 401 when no API key is provided", async ({ requestWithoutAuth }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await requestWithoutAuth("/api/auth/me");
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});

describe("M3 — GET /api/auth/me returns full identity from users table (A4)", () => {
	test("returns id, name, email, avatarUrl from users table", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderUser(db, "test-founder-1");
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			name: string;
			email: string;
			avatarUrl: string | null;
		};
		expect(body.id).toBe("test-founder-1");
		expect(body.name).toBe("Test Founder");
		expect(body.email).toBe("test@hyperidle.dev");
		expect(body.avatarUrl).toBeNull();
		vi.unstubAllEnvs();
	});

	test("response id is NOT the hardcoded 'u-founder'", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderUser(db, "test-founder-1");
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		const body = (await res.json()) as { id: string };
		expect(body.id).not.toBe("u-founder");
		vi.unstubAllEnvs();
	});
});
