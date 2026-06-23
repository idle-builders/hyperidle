/**
 * AN1 — Route integration tests for /api/connections endpoints.
 *
 * Covers:
 *   AC1: POST token + POST mcp-oauth → both appear in GET.
 *   AC2: DELETE → row absent from GET; resolver returns null (seam for AN2).
 *   AC3: Insert expired row → GET returns health:"expired" (not silent).
 *   AC4: POST token then GET → no token/encryptedToken in any response body.
 *   AC5: Per-user isolation — two users, neither GET returns the other's row;
 *        cross-user DELETE → 404.
 *   AC6: No per-service OAuth app (static; not a test — deferred to /review).
 *   Auth gate: 401 without credentials on all routes.
 *
 * These tests FAIL until:
 *   - packages/shared/src/connection.ts is created and exported
 *   - packages/db/src/schema.ts includes serviceConnections pgTable
 *   - packages/server/src/routes/connections.ts is created
 *   - packages/server/src/app.ts mounts createConnectionRoutes at /api/connections
 *   - packages/server/src/services/service-connection-resolver.ts is created
 *
 * Fixture pattern: import from ../../test-fixtures.js; uses { db, app }.
 * Auth: X-API-Key header (same as all other integration tests).
 * Per-user isolation: the auth middleware resolves userId = first kind='human'
 * user in the DB. Two-user tests seed exactly two users and must test from
 * different resolved principals by controlling the DB state per test.
 *
 * @lore AN1: auth middleware resolves userId from the first kind='human' user in
 * the DB (AF11). For multi-user isolation tests, seed exactly two users and use
 * separate test DB states (each test gets a clean truncated DB via fixtures).
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-an1-connections";
const TEST_SERVER_SECRET = "a-test-secret-for-an1-connections-32x";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedUser(
	db: HyperIdleDb,
	id: string,
	name: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id,
		kind: "human",
		name,
		role: "founder",
		status: "active",
		createdAt: now,
	});
}

describe("AN1 connections routes — auth gate", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/connections returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/connections", { method: "GET" });
		expect(res.status).toBe(401);
	});

	test("POST /api/connections returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/connections", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ service: "GitHub", authSource: "token", token: "gh-test" }),
		});
		expect(res.status).toBe(401);
	});

	test("DELETE /api/connections/:id returns 401 without auth", async ({ app }) => {
		const res = await app.request("/api/connections/sc-nonexistent", { method: "DELETE" });
		expect(res.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// AC1 — Make a service available + see it listed
// ---------------------------------------------------------------------------

describe("AN1 AC1 — POST token + POST mcp-oauth → both in GET", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST token connection returns 201 with ServiceConnectionView (no secret)", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-ac1-token", "AC1 Token User");

		const res = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				service: "Stripe",
				authSource: "token",
				token: "sk-test-stripe-key",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		// Must include the view fields.
		expect(body.service).toBe("Stripe");
		expect(body.authSource).toBe("token");
		expect(body.health).toBeDefined();
		// NEVER echo the token.
		expect(body.token).toBeUndefined();
		expect(body.encryptedToken).toBeUndefined();
		expect(body.secret).toBeUndefined();
	});

	test("POST mcp-oauth connection returns 201 with ServiceConnectionView", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-ac1-mcp", "AC1 MCP User");

		const res = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				service: "Figma",
				authSource: "mcp-oauth",
				serverUrl: "https://mcp.figma.com",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.service).toBe("Figma");
		expect(body.authSource).toBe("mcp-oauth");
		// via must be a safe display string, not the raw serverUrl.
		expect(body.via).toBeDefined();
		expect(typeof body.via).toBe("string");
		// No raw serverUrl echoed in the view (it's a safe display string).
		// encryptedToken not present.
		expect(body.encryptedToken).toBeUndefined();
	});

	test("GET /api/connections lists token and mcp-oauth connections for the user", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-ac1-list", "AC1 List User");

		// Create token connection.
		await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ service: "Stripe", authSource: "token", token: "sk-test" }),
		});

		// Create mcp-oauth connection.
		await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				service: "Figma",
				authSource: "mcp-oauth",
				serverUrl: "https://mcp.figma.com",
			}),
		});

		const res = await app.request("/api/connections", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		expect(Array.isArray(body)).toBe(true);

		// Both connections must appear.
		const services = body.map((c) => c.service);
		expect(services).toContain("Stripe");
		expect(services).toContain("Figma");
	});

	test("GET /api/connections 400 on non-https serverUrl", async ({ db, app }) => {
		await seedUser(db, "u-ac1-ssrf", "AC1 SSRF User");

		const res = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				service: "Evil",
				authSource: "mcp-oauth",
				serverUrl: "http://internal.example.com", // non-https → rejected
			}),
		});

		expect(res.status).toBe(400);
	});

	test("POST token fails 500 when server secret is not configured", async ({ db, app }) => {
		await seedUser(db, "u-ac1-nosecret", "AC1 No Secret User");
		vi.unstubAllEnvs();
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// No HYPERIDLE_CREDENTIAL_KEY set.

		const res = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ service: "Stripe", authSource: "token", token: "sk-test" }),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("MISSING_ROOT_SECRET");
	});
});

// ---------------------------------------------------------------------------
// AC2 — Remove a connection; resolver returns null (AN1 proof of revoke seam)
// ---------------------------------------------------------------------------

describe("AN1 AC2 — DELETE connection → resolver returns null + row absent from GET", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("DELETE returns 204 and connection is absent from subsequent GET", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-ac2-revoke", "AC2 Revoke User");

		// Create a token connection.
		const createRes = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ service: "GitHub", authSource: "token", token: "gh-test-tok" }),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };
		const connectionId = created.id;
		expect(connectionId).toBeDefined();

		// Delete the connection.
		const deleteRes = await app.request(`/api/connections/${connectionId}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(deleteRes.status).toBe(204);

		// The connection must be absent from GET.
		const listRes = await app.request("/api/connections", {
			method: "GET",
			headers: authHeaders(),
		});
		const list = (await listRes.json()) as Array<{ id: string }>;
		const found = list.find((c) => c.id === connectionId);
		expect(found).toBeUndefined();
	});

	test(
		"after DELETE, ServiceConnectionResolver.resolve() returns null (AN2 seam)",
		async ({ db, app }) => {
			await seedUser(db, "u-ac2-resolver", "AC2 Resolver User");

			// Create connection.
			const createRes = await app.request("/api/connections", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ service: "Stripe", authSource: "token", token: "sk-seam" }),
			});
			const created = (await createRes.json()) as { id: string };
			const connectionId = created.id;

			// Delete via route.
			await app.request(`/api/connections/${connectionId}`, {
				method: "DELETE",
				headers: authHeaders(),
			});

			// The resolver returns null — this is the seam AN2's broker depends on.
			const { ServiceConnectionResolver } = await import(
				"../../services/service-connection-resolver.js"
			);
			const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
			const result = await resolver.resolve("u-ac2-resolver", connectionId);
			expect(result).toBeNull();
		},
	);

	test("DELETE nonexistent connection returns 404", async ({ db, app }) => {
		await seedUser(db, "u-ac2-notfound", "AC2 Not Found User");

		const res = await app.request("/api/connections/sc-does-not-exist", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// AC3 — Expired/invalid token surfaces as health:"expired" (not silent)
// ---------------------------------------------------------------------------

describe("AN1 AC3 — expired connection surfaces in GET with health:expired", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test(
		"a connection stored with health=expired appears as health:expired in GET (never silent)",
		async ({ db, app }) => {
			await seedUser(db, "u-ac3-expired", "AC3 Expired User");

			// Insert a row directly with expired health (simulates AN2 write-back).
			const { serviceConnections } = await import("@hyperidle/db");
			const { encryptCredentialValue } = await import(
				"../../services/credential-encryption.js"
			);
			const now = new Date().toISOString();
			const encryptedToken = encryptCredentialValue("expired-tok", TEST_SERVER_SECRET);
			await db.insert(serviceConnections).values({
				id: "sc-expired-1",
				userId: "u-ac3-expired",
				service: "SendGrid",
				authSource: "token",
				encryptedToken,
				serverUrl: null,
				trustTier: "community",
				health: "expired",
				lastValidatedAt: null,
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request("/api/connections", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const list = (await res.json()) as Array<{ service: string; health: string }>;
			const sendgrid = list.find((c) => c.service === "SendGrid");
			expect(sendgrid).toBeDefined();
			// Must NOT be silent — health must be "expired", not "usable".
			expect(sendgrid?.health).toBe("expired");
		},
	);

	test(
		"a connection stored with health=needs-attention appears as health:needs-attention (not silent)",
		async ({ db, app }) => {
			await seedUser(db, "u-ac3-attention", "AC3 Needs Attention User");

			const { serviceConnections } = await import("@hyperidle/db");
			const now = new Date().toISOString();
			await db.insert(serviceConnections).values({
				id: "sc-needs-attention-1",
				userId: "u-ac3-attention",
				service: "Figma",
				authSource: "mcp-oauth",
				encryptedToken: null,
				serverUrl: "https://mcp.figma.com",
				trustTier: "vetted",
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request("/api/connections", {
				method: "GET",
				headers: authHeaders(),
			});
			const list = (await res.json()) as Array<{ service: string; health: string }>;
			const figma = list.find((c) => c.service === "Figma");
			expect(figma?.health).toBe("needs-attention");
		},
	);

	test("validate endpoint sets health on the connection", async ({ db, app }) => {
		await seedUser(db, "u-ac3-validate", "AC3 Validate User");

		// Create token connection.
		const createRes = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ service: "GitHub", authSource: "token", token: "gh-test" }),
		});
		const created = (await createRes.json()) as { id: string };
		const connectionId = created.id;

		// Call validate endpoint.
		const validateRes = await app.request(
			`/api/connections/${connectionId}/validate`,
			{
				method: "POST",
				headers: authHeaders(),
			},
		);
		// Should return the health state (any valid state is acceptable here —
		// we're asserting the shape, not a specific health value, since the
		// green builder will call the external service or set needs-attention).
		expect([200, 201]).toContain(validateRes.status);
		const validateBody = (await validateRes.json()) as { health: string };
		expect(validateBody.health).toBeDefined();
		expect(["usable", "needs-attention", "expired"]).toContain(validateBody.health);
	});
});

// ---------------------------------------------------------------------------
// AC4 — No secret in any response body
// ---------------------------------------------------------------------------

describe("AN1 AC4 — no token/encryptedToken in any response", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST token: response body contains no token or encryptedToken field", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-ac4-post", "AC4 Post User");

		const PLAIN_TOKEN = "sk-super-secret-stripe-key-never-echo";
		const res = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				service: "Stripe",
				authSource: "token",
				token: PLAIN_TOKEN,
			}),
		});
		const body = (await res.json()) as Record<string, unknown>;

		// View must not contain secret fields.
		expect(body.token).toBeUndefined();
		expect(body.encryptedToken).toBeUndefined();
		expect(body.secret).toBeUndefined();
		expect(body.encryptedValue).toBeUndefined();

		// The raw token must not appear anywhere in the response body text.
		const bodyText = JSON.stringify(body);
		expect(bodyText).not.toContain(PLAIN_TOKEN);
	});

	test("GET /api/connections: no row contains a secret field", async ({ db, app }) => {
		await seedUser(db, "u-ac4-get", "AC4 Get User");

		const PLAIN_TOKEN = "sk-another-secret-token-never-list";
		await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				service: "Stripe",
				authSource: "token",
				token: PLAIN_TOKEN,
			}),
		});

		const res = await app.request("/api/connections", {
			method: "GET",
			headers: authHeaders(),
		});
		const list = (await res.json()) as Array<Record<string, unknown>>;

		for (const row of list) {
			expect(row.token).toBeUndefined();
			expect(row.encryptedToken).toBeUndefined();
			expect(row.secret).toBeUndefined();
		}

		// Full body text must not contain the plaintext token.
		const bodyText = JSON.stringify(list);
		expect(bodyText).not.toContain(PLAIN_TOKEN);
	});
});

// ---------------------------------------------------------------------------
// AC5 — Per-user isolation
// ---------------------------------------------------------------------------

describe("AN1 AC5 — per-user isolation", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test(
		"user A's GET does not return user B's connection (two isolated DB states per test)",
		async ({ db, app }) => {
			// Isolation: the auth middleware resolves userId = first kind='human' user.
			// We test isolation at the resolver layer (seed a connection owned by a
			// second userId and assert the first user's GET does not return it).

			const { serviceConnections } = await import("@hyperidle/db");
			const { encryptCredentialValue } = await import(
				"../../services/credential-encryption.js"
			);

			const now = new Date().toISOString();
			// Seed user-A (will become the resolved principal for app.request).
			await db.insert(users).values({
				id: "u-iso-a",
				kind: "human",
				name: "Iso User A",
				role: "founder",
				status: "active",
				createdAt: now,
			});
			// Seed user-B (different user — NOT kind='human' so auth resolves to user-A).
			await db.insert(users).values({
				id: "u-iso-b",
				kind: "ai",
				name: "Iso User B (AI)",
				role: "founder",
				status: "active",
				createdAt: now,
			});

			// Insert a connection owned by user-B directly.
			const encryptedToken = encryptCredentialValue("stripe-b-secret", TEST_SERVER_SECRET);
			await db.insert(serviceConnections).values({
				id: "sc-iso-b",
				userId: "u-iso-b", // owned by B
				service: "Stripe",
				authSource: "token",
				encryptedToken,
				serverUrl: null,
				trustTier: "community",
				health: "usable",
				lastValidatedAt: null,
				createdAt: now,
				updatedAt: now,
			});

			// User-A (resolved principal) GET must not see user-B's connection.
			const res = await app.request("/api/connections", {
				method: "GET",
				headers: authHeaders(),
			});
			const list = (await res.json()) as Array<{ id: string }>;
			const found = list.find((c) => c.id === "sc-iso-b");
			expect(found).toBeUndefined();
		},
	);

	test("cross-user DELETE returns 404 (not 403 — don't leak existence)", async ({
		db,
		app,
	}) => {
		const { serviceConnections } = await import("@hyperidle/db");
		const { encryptCredentialValue } = await import(
			"../../services/credential-encryption.js"
		);

		const now = new Date().toISOString();
		// Resolved principal = user-A (first kind='human').
		await db.insert(users).values({
			id: "u-xdelete-a",
			kind: "human",
			name: "XDelete User A",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		// Seed u-iso-other as a non-human user so FK constraint is satisfied.
		// Auth middleware resolves to u-xdelete-a (first kind='human') — u-iso-other is not principal.
		await db.insert(users).values({
			id: "u-iso-other",
			kind: "ai",
			name: "Iso Other (AI)",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		// Connection owned by a different userId.
		const encryptedToken = encryptCredentialValue("some-token", TEST_SERVER_SECRET);
		await db.insert(serviceConnections).values({
			id: "sc-owned-by-other",
			userId: "u-iso-other", // deliberately NOT the resolved principal
			service: "GitHub",
			authSource: "token",
			encryptedToken,
			serverUrl: null,
			trustTier: "community",
			health: "usable",
			lastValidatedAt: null,
			createdAt: now,
			updatedAt: now,
		});

		// Authenticated as user-A, trying to delete a connection owned by "u-iso-other".
		const res = await app.request("/api/connections/sc-owned-by-other", {
			method: "DELETE",
			headers: authHeaders(),
		});

		// Must be 404 — not 403 (don't leak existence of another user's connection).
		expect(res.status).toBe(404);
	});

	test(
		"ServiceConnectionResolver cross-user access returns null",
		async ({ db }) => {
			const { serviceConnections } = await import("@hyperidle/db");
			const { encryptCredentialValue } = await import(
				"../../services/credential-encryption.js"
			);
			const { ServiceConnectionResolver } = await import(
				"../../services/service-connection-resolver.js"
			);

			const now = new Date().toISOString();
			await db.insert(users).values({
				id: "u-resolver-owner",
				kind: "human",
				name: "Resolver Owner",
				role: "founder",
				status: "active",
				createdAt: now,
			});

			const encryptedToken = encryptCredentialValue("figma-secret", TEST_SERVER_SECRET);
			await db.insert(serviceConnections).values({
				id: "sc-resolver-iso",
				userId: "u-resolver-owner",
				service: "Figma",
				authSource: "token",
				encryptedToken,
				serverUrl: null,
				trustTier: "community",
				health: "usable",
				lastValidatedAt: null,
				createdAt: now,
				updatedAt: now,
			});

			const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);

			// Owner gets the token.
			const ownerResult = await resolver.resolve("u-resolver-owner", "sc-resolver-iso");
			expect(ownerResult).toBe("figma-secret");

			// Attacker gets null.
			const attackerResult = await resolver.resolve("u-attacker-other", "sc-resolver-iso");
			expect(attackerResult).toBeNull();
		},
	);
});

// ---------------------------------------------------------------------------
// Validation scenarios from TRACK-AN.md
// ---------------------------------------------------------------------------

describe("AN1 — validation scenario: zero connections → add → appears in list", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("given no connections, after POST token, service appears in GET with authSource recorded", async ({
		db,
		app,
	}) => {
		await seedUser(db, "u-scenario-add", "Scenario Add User");

		// Start: no connections.
		const beforeRes = await app.request("/api/connections", {
			method: "GET",
			headers: authHeaders(),
		});
		const beforeList = (await beforeRes.json()) as Array<Record<string, unknown>>;
		const storedBefore = beforeList.filter(
			(c) => c.authSource === "token" || c.authSource === "mcp-oauth",
		);
		expect(storedBefore).toHaveLength(0);

		// Authorize service.
		const createRes = await app.request("/api/connections", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ service: "GitHub", authSource: "token", token: "gh-pat" }),
		});
		expect(createRes.status).toBe(201);

		// After: appears in list with authSource recorded.
		const afterRes = await app.request("/api/connections", {
			method: "GET",
			headers: authHeaders(),
		});
		const afterList = (await afterRes.json()) as Array<Record<string, unknown>>;
		const github = afterList.find((c) => c.service === "GitHub");
		expect(github).toBeDefined();
		expect(github?.authSource).toBe("token");
	});
});

describe("AN1 — validation scenario: revoke → resolver null", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test(
		"given a connected service, when user revokes, ServiceConnectionResolver.resolve() returns null",
		async ({ db, app }) => {
			await seedUser(db, "u-scenario-revoke", "Scenario Revoke User");

			const createRes = await app.request("/api/connections", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ service: "GitHub", authSource: "token", token: "gh-tok-rev" }),
			});
			const created = (await createRes.json()) as { id: string };

			// Revoke.
			await app.request(`/api/connections/${created.id}`, {
				method: "DELETE",
				headers: authHeaders(),
			});

			// Resolver returns null → AN2 broker has no credential → agent attempt refused.
			const { ServiceConnectionResolver } = await import(
				"../../services/service-connection-resolver.js"
			);
			const resolver = new ServiceConnectionResolver(db, TEST_SERVER_SECRET);
			const result = await resolver.resolve("u-scenario-revoke", created.id);
			expect(result).toBeNull();
		},
	);
});
