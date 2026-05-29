/**
 * S1 — Auth middleware tests: dual-strategy (shared mode + local mode).
 *
 * Red phase: tests for:
 * - Local mode: unchanged X-API-Key behavior, authMethod="api_key"
 * - Shared mode: Bearer token → LoginSession auth
 * - Shared mode: expired token → 401 SESSION_EXPIRED
 * - Shared mode: revoked token → 401 SESSION_REVOKED
 * - Shared mode: admin key fallback (X-API-Key)
 * - Shared mode: no credentials → 401 UNAUTHORIZED
 */

import { createTestDb, type HyperIdleDb, users } from "@hyperidle/db";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { createLoginSession, revokeLoginSession } from "../services/login-session.js";

const TEST_API_KEY = "test-key-s1-auth-mw";

function seedUser(db: HyperIdleDb, id = "u-mw-1", role = "member"): void {
	db.insert(users)
		.values({
			id,
			kind: "human",
			name: "MW Test User",
			email: "mw@example.com",
			role,
			status: "active",
			createdAt: new Date().toISOString(),
		})
		.onConflictDoNothing()
		.run();
}

function bearerHeaders(token: string): Record<string, string> {
	// biome-ignore lint/style/useNamingConvention: HTTP header name
	return { Authorization: `Bearer ${token}` };
}

/** Build a minimal Hono app that echoes userId, authMethod, loginSessionId from context */
function makeTestApp(db: HyperIdleDb, sharedMode: boolean): Hono {
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
	let db: HyperIdleDb;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedUser(db, "u-local-1");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("accepts X-API-Key and sets userId from users table", async () => {
		const app = makeTestApp(db, false);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; authMethod: string };
		expect(body.userId).toBe("u-local-1");
		expect(body.authMethod).toBe("api_key");
	});

	it("rejects missing API key with 401", async () => {
		const app = makeTestApp(db, false);
		const res = await app.request("/probe");
		expect(res.status).toBe(401);
	});

	it("rejects wrong API key with 401", async () => {
		const app = makeTestApp(db, false);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "wrong-key" },
		});
		expect(res.status).toBe(401);
	});

	it("does NOT accept Bearer token in local mode (falls through to API key check)", async () => {
		const { token } = createLoginSession(db, "u-local-1");
		const app = makeTestApp(db, false);
		// Bearer token without X-API-Key should 401 in local mode
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(401);
	});

	it("loginSessionId is undefined in local mode", async () => {
		const app = makeTestApp(db, false);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		const body = (await res.json()) as { loginSessionId: unknown };
		expect(body.loginSessionId).toBeNull();
	});
});

describe("S1 — Auth middleware: shared mode (sharedMode=true)", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedUser(db, "u-shared-1");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("accepts Bearer token and sets userId from LoginSession", async () => {
		const { token, session } = createLoginSession(db, "u-shared-1");
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

	it("returns 401 SESSION_EXPIRED for expired Bearer token", async () => {
		const { token } = createLoginSession(db, "u-shared-1", 1); // 1ms TTL
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

	it("returns 401 SESSION_REVOKED for revoked Bearer token", async () => {
		const { token, session } = createLoginSession(db, "u-shared-1");
		revokeLoginSession(db, session.id);
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(401);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("SESSION_REVOKED");
	});

	it("falls back to admin API key when Bearer token is absent", async () => {
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; authMethod: string };
		expect(body.userId).toBe("u-shared-1");
		expect(body.authMethod).toBe("api_key");
	});

	it("returns 401 UNAUTHORIZED when no credentials provided", async () => {
		const app = makeTestApp(db, true);
		const res = await app.request("/probe");
		expect(res.status).toBe(401);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("UNAUTHORIZED");
	});

	it("returns 401 UNAUTHORIZED for invalid API key in shared mode", async () => {
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": "invalid-key" },
		});
		expect(res.status).toBe(401);
	});

	it("sets loginSessionId when using Bearer token", async () => {
		const { token, session } = createLoginSession(db, "u-shared-1");
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: bearerHeaders(token),
		});
		const body = (await res.json()) as { loginSessionId: string };
		expect(body.loginSessionId).toBe(session.id);
	});

	it("loginSessionId is undefined when using admin API key", async () => {
		const app = makeTestApp(db, true);
		const res = await app.request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		const body = (await res.json()) as { loginSessionId: unknown };
		expect(body.loginSessionId).toBeNull();
	});
});
