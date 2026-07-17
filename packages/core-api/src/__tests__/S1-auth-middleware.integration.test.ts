/**
 * S1 — Auth middleware tests: dual-strategy (shared mode + local mode).
 *
 * Tests for:
 * - Local mode: unchanged X-API-Key behavior, authMethod="api_key"
 * - Shared mode: Bearer token → LoginSession auth
 * - Shared mode: expired token → 401 SESSION_EXPIRED
 * - Shared mode: revoked token → 401 SESSION_REVOKED
 * - Shared mode: admin key fallback (X-API-Key)
 * - Shared mode: no credentials → 401 UNAUTHORIZED
 *
 * @lore S1 PGLite migration: All tests are now async because createTestDb()
 * returns a Promise<TestDbHandle>. The service calls are async too.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { createLoginSession, revokeLoginSession } from "@hyperidle/users";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-s1-auth-mw";

async function seedUser(db: HyperIdleDb, id = "u-mw-1", role = "member"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "MW Test User",
			email: "mw@example.com",
			role,
			status: "active",
			createdAt: new Date().toISOString(),
		})
		.onConflictDoNothing();
}

function bearerHeaders(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}` };
}

/** Build a minimal Hono app that echoes userId, authMethod, loginSessionId from context */
function makeTestApp(db: HyperIdleDb, sharedMode: boolean): Hono<HyperIdleEnv> {
	const app = new Hono<HyperIdleEnv>();
	app.use("*", createAuthMiddleware({ db, sharedMode }));
	app.get("/probe", (c) =>
		c.json({
			userId: c.get("userId"),
			authMethod: c.get("authMethod"),
			loginSessionId: c.get("loginSessionId") ?? null,
		}),
	);
	return app;
}

describe("S1 — Auth middleware: local mode (sharedMode=false)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("accepts X-API-Key and sets userId from users table", async ({ db }) => {
		await seedUser(db, "u-local-1");
		const app = makeTestApp(db, false);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; authMethod: string };
		expect(body.userId).toBe("u-local-1");
		expect(body.authMethod).toBe("api_key");
	});

	test("rejects missing API key with 401", async ({ db }) => {
		await seedUser(db, "u-local-1");
		const app = makeTestApp(db, false);
		const res = await app.request("/probe");
		expect(res.status).toBe(401);
	});

	test("rejects wrong API key with 401", async ({ db }) => {
		await seedUser(db, "u-local-1");
		const app = makeTestApp(db, false);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "wrong-key" },
		});
		expect(res.status).toBe(401);
	});

	test("does NOT accept Bearer token in local mode (falls through to API key check)", async ({
		db,
	}) => {
		await seedUser(db, "u-local-1");
		const { token } = await createLoginSession(db, "u-local-1");
		const app = makeTestApp(db, false);
		// Bearer token without X-API-Key should 401 in local mode
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(401);
	});

	test("loginSessionId is undefined in local mode", async ({ db }) => {
		await seedUser(db, "u-local-1");
		const app = makeTestApp(db, false);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		const body = (await res.json()) as { loginSessionId: unknown };
		expect(body.loginSessionId).toBeNull();
	});
});

describe("S1 — Auth middleware: shared mode (sharedMode=true)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	test("accepts Bearer token and sets userId from LoginSession", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const { token, session } = await createLoginSession(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			userId: string;
			authMethod: string;
			loginSessionId: string;
		};
		expect(body.userId).toBe("u-shared-1");
		expect(body.authMethod).toBe("login_session");
		expect(body.loginSessionId).toBe(session.id);
	});

	test("returns 401 SESSION_EXPIRED for expired Bearer token", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const { token } = await createLoginSession(db, "u-shared-1", 1); // 1ms TTL
		// Manually expire by waiting — use fake timers
		vi.useFakeTimers();
		vi.advanceTimersByTime(100);
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		vi.useRealTimers();
		expect(res.status).toBe(401);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("SESSION_EXPIRED");
	});

	test("returns 401 SESSION_REVOKED for revoked Bearer token", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const { token, session } = await createLoginSession(db, "u-shared-1");
		await revokeLoginSession(db, session.id);
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(401);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("SESSION_REVOKED");
	});

	test("falls back to admin API key when Bearer token is absent", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; authMethod: string };
		expect(body.userId).toBe("u-shared-1");
		expect(body.authMethod).toBe("api_key");
	});

	test("returns 401 UNAUTHORIZED when no credentials provided", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe");
		expect(res.status).toBe(401);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("UNAUTHORIZED");
	});

	test("returns 401 UNAUTHORIZED for invalid API key in shared mode", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "invalid-key" },
		});
		expect(res.status).toBe(401);
	});

	test("sets loginSessionId when using Bearer token", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const { token, session } = await createLoginSession(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		const body = (await res.json()) as { loginSessionId: string };
		expect(body.loginSessionId).toBe(session.id);
	});

	test("loginSessionId is undefined when using admin API key", async ({ db }) => {
		await seedUser(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		const body = (await res.json()) as { loginSessionId: unknown };
		expect(body.loginSessionId).toBeNull();
	});
});
