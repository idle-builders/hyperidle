/**
 * S1 — Integration tests for auth route endpoints.
 *
 * Red phase: tests for:
 * - POST /api/auth/invite (admin-only, shared mode)
 * - POST /api/auth/claim (public, no auth)
 * - POST /api/auth/logout
 * - GET /api/auth/me (existing, must still work)
 * - POST /api/auth/ws-token (modified — uses userId from context in shared mode)
 */

import { createTestDb, type HyperIdleDb, users } from "@hyperidle/db";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInvite } from "../services/invite-code.js";
import { createLoginSession } from "../services/login-session.js";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-s1-routes";
const NOW = new Date().toISOString();

function seedAdminUser(db: HyperIdleDb, id = "u-admin-r1"): void {
	db.insert(users)
		.values({
			id,
			kind: "human",
			name: "Route Admin",
			email: "admin@example.com",
			role: "admin",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing()
		.run();
}

function apiKeyHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function bearerHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
	// biome-ignore lint/style/useNamingConvention: HTTP header name
	return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
}

/** Create an app with shared mode enabled */
function makeSharedApp(db: HyperIdleDb): Hono {
	return createTestApp({ db, sharedMode: true });
}

/** Create an app with local mode (default) */
function makeLocalApp(db: HyperIdleDb): Hono {
	return createTestApp({ db });
}

describe("S1 — POST /api/auth/invite (admin-only, shared mode)", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedAdminUser(db, "u-admin-r1");
		app = makeSharedApp(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("creates an invite code when called with admin API key", async () => {
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

	it("defaults to member role when role is not specified", async () => {
		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: apiKeyHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(201);
	});

	it("returns 403 when called with Bearer token (non-admin)", async () => {
		const { token } = createLoginSession(db, "u-admin-r1");
		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: bearerHeaders(token),
			body: JSON.stringify({ role: "member" }),
		});
		expect(res.status).toBe(403);
	});

	it("returns 401 when no credentials provided", async () => {
		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role: "member" }),
		});
		expect(res.status).toBe(401);
	});

	it("returns 400 for invalid role", async () => {
		const res = await app.request("/api/auth/invite", {
			method: "POST",
			headers: apiKeyHeaders(),
			body: JSON.stringify({ role: "superuser" }),
		});
		expect(res.status).toBe(400);
	});
});

describe("S1 — POST /api/auth/claim (public, no auth)", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedAdminUser(db, "u-admin-r1");
		app = makeSharedApp(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns token and user for valid claim (no auth header needed)", async () => {
		const invite = createInvite(db, "u-admin-r1", "member");
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

	it("returns 410 INVITE_CLAIMED for already-claimed invite", async () => {
		const invite = createInvite(db, "u-admin-r1", "member");
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

	it("returns 410 INVITE_EXPIRED for expired invite", async () => {
		const invite = createInvite(db, "u-admin-r1", "member", -(8 * 24 * 60 * 60 * 1000));
		const res = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: invite.code, name: "Late Joiner" }),
		});
		expect(res.status).toBe(410);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("INVITE_EXPIRED");
	});

	it("returns 404 for unknown invite code", async () => {
		const res = await app.request("/api/auth/claim", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: "nonexistent-code-xyz", name: "Nobody" }),
		});
		expect(res.status).toBe(404);
	});

	it("returned token works for subsequent authenticated requests", async () => {
		const invite = createInvite(db, "u-admin-r1", "member");
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
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedAdminUser(db, "u-admin-r1");
		app = makeSharedApp(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("revokes the current session and returns ok:true", async () => {
		const { token } = createLoginSession(db, "u-admin-r1");
		const res = await app.request("/api/auth/logout", {
			method: "POST",
			headers: bearerHeaders(token),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});

	it("after logout, Bearer token returns 401 SESSION_REVOKED", async () => {
		const { token } = createLoginSession(db, "u-admin-r1");

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

	it("returns 400 when using API key (no session to revoke)", async () => {
		const res = await app.request("/api/auth/logout", {
			method: "POST",
			headers: apiKeyHeaders(),
		});
		expect(res.status).toBe(400);
	});
});

describe("S1 — GET /api/auth/me (local mode — unchanged)", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		db.insert(users)
			.values({
				id: "u-local-me",
				kind: "human",
				name: "Local User",
				email: "local@example.com",
				role: "member",
				status: "active",
				createdAt: NOW,
			})
			.run();
		app = makeLocalApp(db);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns user identity via X-API-Key in local mode", async () => {
		const res = await app.request("/api/auth/me", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; name: string };
		expect(body.id).toBe("u-local-me");
	});

	it("returns 401 without credentials in local mode", async () => {
		const res = await app.request("/api/auth/me");
		expect(res.status).toBe(401);
	});
});

describe("S1 — POST /api/auth/ws-token (shared mode uses userId from context)", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		seedAdminUser(db, "u-admin-r1");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("mints a ws-token for Bearer auth in shared mode", async () => {
		const { token } = createLoginSession(db, "u-admin-r1");
		const { createUpgradeTokenStore } = await import("../auth/upgrade-token-store.js");
		const store = createUpgradeTokenStore();
		// registerWebSocket is required to mount the ws-token route (app.ts design)
		const app = createTestApp({
			db,
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
