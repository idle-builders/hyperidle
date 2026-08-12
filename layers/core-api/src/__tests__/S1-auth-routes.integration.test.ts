/**
 * S1 — Integration tests for auth route endpoints.
 *
 * Tests for:
 * - POST /api/auth/invite (admin-only, shared mode)
 * - POST /api/auth/claim (public, no auth)
 * - POST /api/auth/logout
 * - GET /api/auth/me (existing, must still work)
 * - POST /api/auth/ws-token (modified — uses userId from context in shared mode)
 *
 * @lore S1 PGLite migration: All tests are now async. createTestDb() returns
 * Promise<TestDbHandle>, createTestApp() returns Promise<Hono>, and all
 * service calls are async.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { createInvite, createLoginSession } from "@hyperidle/users";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-s1-routes";
const NOW = new Date().toISOString();

async function seedAdminUser(db: HyperIdleDb, ids: ScopedIds): Promise<string> {
	const id = ids("admin");
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "Route Admin",
			email: "admin@example.com",
			role: "admin",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
	return id;
}

function apiKeyHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function bearerHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
	// biome-ignore lint/style/useNamingConvention: HTTP header name
	return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
}

describe("S1 — POST /api/auth/invite (admin-only, shared mode)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("creates an invite code when called with admin API key", async ({ db, eventBus }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: apiKeyHeaders(),
			body: JSON.stringify({ role: "member" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { code: string; expiresAt: string };
		expect(typeof body.code).toBe("string");
		expect(body.code.length).toBeGreaterThan(0);
		expect(typeof body.expiresAt).toBe("string");
	});

	test("defaults to member role when role is not specified", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: apiKeyHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(201);
	});

	test("returns 403 when called with Bearer token (non-admin)", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const { token } = await createLoginSession(db, ids("admin"));
		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: bearerHeaders(token),
			body: JSON.stringify({ role: "member" }),
		});
		expect(res.status).toBe(403);
	});

	test("returns 401 when no credentials provided", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "member" }),
		});
		expect(res.status).toBe(401);
	});

	test("returns 400 for invalid role", async ({ db, eventBus, ids }) => {
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: apiKeyHeaders(),
			body: JSON.stringify({ role: "superuser" }),
		});
		expect(res.status).toBe(400);
	});
});

describe("S1 — POST /api/auth/claim (public, no auth)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns token and user for valid claim (no auth header needed)", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const invite = await createInvite(db, ids("admin"), "member");
		const res = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: invite.code, name: "New Member" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { token: string; user: { id: string; name: string } };
		expect(typeof body.token).toBe("string");
		expect(body.token.length).toBeGreaterThan(0);
		expect(body.user.name).toBe("New Member");
	});

	test("returns 410 INVITE_CLAIMED for already-claimed invite", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const invite = await createInvite(db, ids("admin"), "member");
		// First claim
		await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: invite.code, name: "First" }),
		});
		// Second claim
		const res = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: invite.code, name: "Second" }),
		});
		expect(res.status).toBe(410);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("INVITE_CLAIMED");
	});

	test("returns 410 INVITE_EXPIRED for expired invite", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const invite = await createInvite(db, ids("admin"), "member", -(8 * 24 * 60 * 60 * 1000));
		const res = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: invite.code, name: "Late Joiner" }),
		});
		expect(res.status).toBe(410);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("INVITE_EXPIRED");
	});

	test("returns 404 for unknown invite code", async ({ db, eventBus, ids }) => {
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const res = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: "nonexistent-code-xyz", name: "Nobody" }),
		});
		expect(res.status).toBe(404);
	});

	test("returned token works for subsequent authenticated requests", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const invite = await createInvite(db, ids("admin"), "member");
		const claimRes = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: invite.code, name: "Bearer Tester" }),
		});
		const claimBody = (await claimRes.json()) as { token: string; user: { id: string } };

		// Use the token to call /api/auth/me
		const meRes = await app.request("/api/auth/me", {
			headers: bearerHeaders(claimBody.token),
		});
		expect(meRes.status).toBe(200);
		const meBody = (await meRes.json()) as { id: string };
		expect(meBody.id).toBe(claimBody.user.id);
	});
});

describe("S1 — POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("revokes the current session and returns ok:true", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const { token } = await createLoginSession(db, ids("admin"));
		const res = await app.request("/api/auth/logout", {
			method: "POST",
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	test("after logout, Bearer token returns 401 SESSION_REVOKED", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const { token } = await createLoginSession(db, ids("admin"));

		// Logout
		await app.request("/api/auth/logout", {
			method: "POST",
			headers: bearerHeaders(token),
		});

		// Now try to use the token
		const meRes = await app.request("/api/auth/me", {
			headers: bearerHeaders(token),
		});
		expect(meRes.status).toBe(401);
		const body = (await meRes.json()) as { code: string };
		expect(body.code).toBe("SESSION_REVOKED");
	});

	test("returns 400 when using API key (no session to revoke)", async ({ db, eventBus, ids }) => {
		const app = await createTestApp({ db, eventBus, sharedMode: true });

		const res = await app.request("/api/auth/logout", {
			method: "POST",
			headers: apiKeyHeaders(),
		});
		expect(res.status).toBe(400);
	});
});

describe("S1 — GET /api/auth/me (local mode — unchanged)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns user identity via X-API-Key in local mode", async ({ db, eventBus, ids }) => {
		const localId = ids("local-me");
		await db.insert(users).values({
			id: localId,
			kind: "human",
			name: "Local User",
			email: "local@example.com",
			role: "member",
			status: "active",
			createdAt: NOW,
		});
		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/auth/me", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; name: string };
		expect(body.id).toBe(localId);
	});

	test("returns 401 without credentials in local mode", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/auth/me");
		expect(res.status).toBe(401);
	});
});

describe("S1 — POST /api/auth/ws-token (shared mode uses userId from context)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("mints a ws-token for Bearer auth in shared mode", async ({ db, eventBus, ids }) => {
		await seedAdminUser(db, ids);
		const { token } = await createLoginSession(db, ids("admin"));
		const { createUpgradeTokenStore } = await import("@hyperidle/users");
		const store = createUpgradeTokenStore();
		// registerWebSocket is required to mount the ws-token route (app.ts design)
		const app = await createTestApp({
			db,
			eventBus,
			sharedMode: true,
			upgradeTokenStore: store,
			registerWebSocket: (_apiRouter, _tokenStore) => {
				// No-op: just need registerWebSocket present to activate token store
			},
		});

		const res = await app.request("/api/auth/ws-token", {
			method: "POST",
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token: string; expiresAt: string };
		expect(typeof body.token).toBe("string");
		expect(body.token.length).toBeGreaterThan(0);
	});
});
