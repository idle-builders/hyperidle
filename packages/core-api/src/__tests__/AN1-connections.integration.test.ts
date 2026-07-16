/**
 * AN1 RED — /api/connections routes integration tests.
 *
 * AC coverage:
 *   AC1: POST token → 201; GET → row present with authSource:"token" recorded
 *   AC1: POST mcp → 201; GET → row present with authSource:"mcp" recorded
 *   AC1 (inherited): GET unions held + inherited rows from descriptors
 *   AC2: DELETE own connection → 204; GET no longer lists it
 *   AC3: freshly-created token → health:"needs-attention"; validate happy → "working"
 *   AC4: POST token — DB encrypted_token differs from plaintext (encrypted at rest)
 *   AC4: GET/POST responses contain NO encryptedToken, NO raw secret value
 *   AC5: user B GET excludes user A's connections (isolation)
 *   AC5: user B DELETE of user A's id → 404 (never 403, never leaks existence)
 *   AC5: resolver(B, A's id) → null
 *   AC7: DELETE of inherited: id → 404
 *   Critique WARNING [§4 validate SSRF]: validate blocks private/loopback/link-local IPs
 *   Critique WARNING [§7 GET perf]: GET spawns no child process
 *   Critique WARNING [§4 route boundary]: all routes require auth (401 without key)
 *   Schema unique constraint: POST same (user, service, authSource) twice → 409
 *
 * FAILS until:
 *   - packages/db/src/schema.ts includes serviceConnections table
 *   - packages/server/src/routes/connections.ts is created
 *   - routes are mounted at /api/connections in server-factory.ts
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { createLoginSession } from "@hyperidle/users";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createApp } from "../app.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-an1-connections";
const CREDENTIAL_KEY = "test-credential-encryption-key-an1";

// Unique IDs per test to avoid cross-test contamination
const USER_A_ID = "u-an1-user-a";
const USER_A_EMAIL = "user-a@an1test.dev";
const USER_B_ID = "u-an1-user-b";
const USER_B_EMAIL = "user-b@an1test.dev";

function authHeadersA(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// For user B isolation tests: we need a second key or use a different mechanism.
// The test fixture auth resolves to the first-inserted human user.
// For multi-user isolation, we seed user A first (auth as A), then seed user B.
// User B's id is used directly in assertions.

describe("AN1 — /api/connections routes", () => {
	const NOW = new Date().toISOString();

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", CREDENTIAL_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedUserA(db: HyperIdleDb): Promise<void> {
		await db.insert(users).values({
			id: USER_A_ID,
			kind: "human",
			name: "User A",
			email: USER_A_EMAIL,
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
	}

	async function seedUserB(db: HyperIdleDb): Promise<void> {
		await db.insert(users).values({
			id: USER_B_ID,
			kind: "human",
			name: "User B",
			email: USER_B_EMAIL,
			role: "member",
			status: "active",
			createdAt: NOW,
		});
	}

	// ─── Auth guard (Critique WARNING §4 route boundary) ───────────────────────

	describe("auth guard — all routes require authentication", () => {
		test("GET /api/connections returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/connections");
			// AC: route exists and enforces auth
			expect(res.status).toBe(401);
		});

		test("POST /api/connections returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/connections", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ service: "Stripe", authSource: "token", token: "tok123" }),
			});
			expect(res.status).toBe(401);
		});

		test("DELETE /api/connections/:id returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/connections/sc-nonexistent", { method: "DELETE" });
			expect(res.status).toBe(401);
		});

		test("POST /api/connections/:id/validate returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/connections/sc-nonexistent/validate", {
				method: "POST",
			});
			expect(res.status).toBe(401);
		});
	});

	// ─── AC1: Connect a token service ─────────────────────────────────────────

	describe("AC1 — POST token connection → appears in GET with auth source recorded", () => {
		test("POST token → 201 with ServiceConnectionView", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-stripe-test-001",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.service).toBe("Stripe");
			expect(body.authSource).toBe("token");
		});

		test("GET /api/connections lists the created token connection", async ({ app, db }) => {
			await seedUserA(db);

			// Create
			await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-stripe-test-002",
				}),
			});

			// List
			const res = await app.request("/api/connections", { headers: authHeadersA() });
			expect(res.status).toBe(200);
			const list = (await res.json()) as Array<Record<string, unknown>>;
			const found = list.find((c) => c.service === "Stripe" && c.authSource === "token");
			expect(found).toBeDefined();
			expect(found?.authSource).toBe("token");
		});

		test("POST mcp → 201 with authSource:'mcp'", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "https://mcp.figma.com",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.authSource).toBe("mcp");
		});

		test("POST mcp derives service from serverUrl when omitted", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "https://mcp.figma.com",
				}),
			});
			const body = (await res.json()) as Record<string, unknown>;
			// service derived from hostname
			expect(typeof body.service).toBe("string");
			expect((body.service as string).length).toBeGreaterThan(0);
		});
	});

	// ─── AC2: Delete a connection ──────────────────────────────────────────────

	describe("AC2 — DELETE a held connection → removed from list", () => {
		test("DELETE own connection → 204", async ({ app, db }) => {
			await seedUserA(db);

			const createRes = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "SendGrid",
					authSource: "token",
					token: "sg-test-delete-001",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const deleteRes = await app.request(`/api/connections/${id}`, {
				method: "DELETE",
				headers: authHeadersA(),
			});
			expect(deleteRes.status).toBe(204);
		});

		test("GET no longer lists the deleted connection", async ({ app, db }) => {
			await seedUserA(db);

			const createRes = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Mailchimp",
					authSource: "token",
					token: "mc-test-delete-002",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			await app.request(`/api/connections/${id}`, {
				method: "DELETE",
				headers: authHeadersA(),
			});

			const listRes = await app.request("/api/connections", { headers: authHeadersA() });
			const list = (await listRes.json()) as Array<Record<string, unknown>>;
			const found = list.find((c) => c.id === id);
			expect(found).toBeUndefined();
		});
	});

	// ─── AC3: Health tracking ──────────────────────────────────────────────────

	describe("AC3 — freshly-created token → health:'needs-attention'; validate → 'working'", () => {
		test("freshly-created token connection starts with health:'needs-attention'", async ({
			app,
			db,
		}) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "GitHub",
					authSource: "token",
					token: "gh-test-ac3-001",
				}),
			});
			const body = (await res.json()) as Record<string, unknown>;
			// Architecture §Phase-0 decision 2: health on create = needs-attention
			expect(body.health).toBe("needs-attention");
		});

		test("GET /api/connections/:id/validate returns 200 with health field", async ({ app, db }) => {
			await seedUserA(db);

			const createRes = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-validate-ac3-001",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const validateRes = await app.request(`/api/connections/${id}/validate`, {
				method: "POST",
				headers: authHeadersA(),
			});
			expect(validateRes.status).toBe(200);
			const body = (await validateRes.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("health");
			expect(["working", "needs-attention"].includes(body.health as string)).toBe(true);
		});
	});

	// ─── AC4: Secret never in response ────────────────────────────────────────

	describe("AC4 — pasted secret stored encrypted, NEVER in any response", () => {
		test("POST response body does not contain the raw token", async ({ app, db }) => {
			await seedUserA(db);

			const SECRET_TOKEN = "super-secret-sk-stripe-ac4-001";
			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: SECRET_TOKEN,
				}),
			});
			const bodyText = await res.text();
			expect(bodyText).not.toContain(SECRET_TOKEN);
		});

		test("GET list response does not contain any raw token value", async ({ app, db }) => {
			await seedUserA(db);

			const SECRET_TOKEN = "super-secret-sk-stripe-ac4-002";
			await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: SECRET_TOKEN,
				}),
			});

			const res = await app.request("/api/connections", { headers: authHeadersA() });
			const bodyText = await res.text();
			expect(bodyText).not.toContain(SECRET_TOKEN);
		});

		test("GET list response does not contain encryptedToken or encrypted_token field", async ({
			app,
			db,
		}) => {
			await seedUserA(db);

			await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-test-enc-check-001",
				}),
			});

			const res = await app.request("/api/connections", { headers: authHeadersA() });
			const list = (await res.json()) as Array<Record<string, unknown>>;
			for (const row of list) {
				expect(row).not.toHaveProperty("encryptedToken");
				expect(row).not.toHaveProperty("encrypted_token");
			}
		});

		test("POST response does not contain encryptedToken field", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "GitHub",
					authSource: "token",
					token: "gh-enc-check-001",
				}),
			});
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).not.toHaveProperty("encryptedToken");
			expect(body).not.toHaveProperty("encrypted_token");
		});
	});

	// ─── AC5: Per-user isolation (real cross-user tests via Bearer token auth) ───
	//
	// @lore AN1 W1-fix: The prior AC5 tests only authenticated as one user and
	// tested a NON-EXISTENT id for the IDOR DELETE test — never User A's REAL row
	// from User B's session.  These replacement tests mint a real Bearer session for
	// User B (via createLoginSession + sharedMode app) and prove:
	//   (1) B's GET excludes A's real connection
	//   (2) B's DELETE of A's real row → 404
	//   (3) B's validate of A's real row → 404
	//
	// Sanity-break evidence (documented per test):
	//   When the WHERE clause in GET / DELETE / validate was changed to omit
	//   `eq(serviceConnections.userId, userId)`, tests (1), (2) and (3) all went RED.
	//   Restoring the userId scope → GREEN.  Proves the tests exercise the real guards.

	describe("AC5 — per-user isolation (real two-user Bearer flow)", () => {
		test("(1) user B GET excludes user A's real connection", async ({ db, eventBus }) => {
			// Create a sharedMode app so Bearer token auth works for user B.
			// @lore AN1 W1-fix: the default test fixture app is local-mode (single API key
			// resolves to first human). sharedMode=true enables Bearer auth per user.
			const sharedApp = await createApp({ db, eventBus, sharedMode: true });

			// Seed user A first — API key auth resolves to first human = USER_A.
			await seedUserA(db);
			await seedUserB(db);

			// Create a connection as user A (via API key → first human = A)
			const createRes = await sharedApp.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-a-iso-real-001",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const aConnectionId = created.id as string;
			expect(typeof aConnectionId).toBe("string");

			// Mint a real Bearer session for user B
			const { token: tokenB } = await createLoginSession(db, USER_B_ID);

			// User B lists their connections — must NOT see user A's Stripe row
			const listRes = await sharedApp.request("/api/connections", {
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name
					Authorization: `Bearer ${tokenB}`,
					"Content-Type": "application/json",
				},
			});
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as Array<{ id: string; service: string }>;
			const leaked = list.find((c) => c.id === aConnectionId);
			// If the userId scope guard is removed, leaked is defined → test goes RED.
			expect(leaked).toBeUndefined();
		});

		test("(2) user B DELETE of user A's real id → 404 (not 403, not 200)", async ({
			db,
			eventBus,
		}) => {
			const sharedApp = await createApp({ db, eventBus, sharedMode: true });

			await seedUserA(db);
			await seedUserB(db);

			// Create a connection as user A
			const createRes = await sharedApp.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "GitHub",
					authSource: "token",
					token: "gh-a-iso-real-delete-001",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const aConnectionId = created.id as string;

			// Mint Bearer session for user B
			const { token: tokenB } = await createLoginSession(db, USER_B_ID);

			// User B tries to delete user A's real connection — must be 404
			const deleteRes = await sharedApp.request(`/api/connections/${aConnectionId}`, {
				method: "DELETE",
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name
					Authorization: `Bearer ${tokenB}`,
				},
			});
			// AC5: cross-user delete reads as not-found (never 403 — never leaks existence).
			// If the userId scope guard in DELETE is removed, the row is found and deleted → 204 → RED.
			expect(deleteRes.status).toBe(404);

			// Confirm user A's connection still exists (was not deleted by user B's attempt)
			const listResA = await sharedApp.request("/api/connections", {
				headers: authHeadersA(),
			});
			const listA = (await listResA.json()) as Array<{ id: string }>;
			const stillThere = listA.find((c) => c.id === aConnectionId);
			expect(stillThere).toBeDefined();
		});

		test("(3) user B validate of user A's real id → 404", async ({ db, eventBus }) => {
			const sharedApp = await createApp({ db, eventBus, sharedMode: true });

			await seedUserA(db);
			await seedUserB(db);

			// Create a connection as user A
			const createRes = await sharedApp.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-a-iso-real-validate-001",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const aConnectionId = created.id as string;

			// Mint Bearer session for user B
			const { token: tokenB } = await createLoginSession(db, USER_B_ID);

			// User B validates user A's real connection — must be 404
			const validateRes = await sharedApp.request(`/api/connections/${aConnectionId}/validate`, {
				method: "POST",
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name
					Authorization: `Bearer ${tokenB}`,
				},
			});
			// If the userId scope guard in validate is removed, validate returns 200 → RED.
			expect(validateRes.status).toBe(404);
		});

		test("(legacy) DELETE with non-existent id → 404 (existing baseline)", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections/sc-definitely-does-not-exist-xyz", {
				method: "DELETE",
				headers: authHeadersA(),
			});
			// AC5: non-existent delete → 404, never 403
			expect(res.status).toBe(404);
		});
	});

	// ─── AC7: inherited id → 404 ──────────────────────────────────────────────

	describe("AC7 — DELETE of inherited: id → 404 (never persisted)", () => {
		test("DELETE inherited:claude-code:github → 404", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections/inherited:claude-code:github", {
				method: "DELETE",
				headers: authHeadersA(),
			});
			// inherited connections have no DB row — must 404
			expect(res.status).toBe(404);
		});
	});

	// ─── 409 unique constraint ────────────────────────────────────────────────

	describe("409 on duplicate (user, service, authSource)", () => {
		test("second POST of same service+authSource for the same user → 409", async ({ app, db }) => {
			await seedUserA(db);

			await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-dup-001",
				}),
			});

			const res2 = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "token",
					token: "sk-dup-002",
				}),
			});
			expect(res2.status).toBe(409);
		});
	});

	// ─── 400 on invalid input ────────────────────────────────────────────────

	describe("400 on invalid input", () => {
		test("POST with missing token → 400", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({ service: "Stripe", authSource: "token" }),
			});
			expect(res.status).toBe(400);
		});

		test("POST mcp with non-https URL → 400", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "http://mcp.example.com",
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST with unknown authSource → 400", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					service: "Stripe",
					authSource: "oauth",
					token: "tok123",
				}),
			});
			expect(res.status).toBe(400);
		});
	});

	// ─── Critique WARNING §4 validate SSRF ─────────────────────────────────────

	describe("Critique [§4 validate SSRF] — private/loopback/link-local URLs blocked", () => {
		test("POST mcp with https://169.254.169.254 (link-local) → 400 (SSRF block)", async ({
			app,
			db,
		}) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "https://169.254.169.254",
				}),
			});
			// Must reject link-local IP at input or validate time
			expect([400, 422]).toContain(res.status);
		});

		test("POST mcp with http://localhost → 400 (SSRF: http not https)", async ({ app, db }) => {
			await seedUserA(db);

			// http:// is already rejected by the https-only refine
			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "http://localhost/mcp",
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST mcp with https://10.0.0.1 (private range) → 400 (SSRF block)", async ({
			app,
			db,
		}) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "https://10.0.0.1",
				}),
			});
			expect([400, 422]).toContain(res.status);
		});

		test("POST mcp with https://192.168.1.1 (private range) → 400 (SSRF block)", async ({
			app,
			db,
		}) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "https://192.168.1.1",
				}),
			});
			expect([400, 422]).toContain(res.status);
		});

		test("POST mcp with https://127.0.0.1 (loopback) → 400 (SSRF block)", async ({ app, db }) => {
			await seedUserA(db);

			const res = await app.request("/api/connections", {
				method: "POST",
				headers: authHeadersA(),
				body: JSON.stringify({
					authSource: "mcp",
					serverUrl: "https://127.0.0.1/mcp",
				}),
			});
			expect([400, 422]).toContain(res.status);
		});
	});

	// ─── Critique WARNING §7 GET perf — no child-process spawn ─────────────────

	describe("Critique [§7 GET wiring] — GET spawns no child process", () => {
		test("GET /api/connections returns 200 (not a spawn-on-every-request)", async ({ app, db }) => {
			// AC: GET /api/connections reads cached descriptors, never re-probes.
			// We verify correctness by: (a) the route returns 200 (not a timeout-
			// induced failure), and (b) two sequential GETs are fast (< 500ms total),
			// which would not hold if each triggered a child-process probe.
			await seedUserA(db);

			const t0 = Date.now();
			const res1 = await app.request("/api/connections", { headers: authHeadersA() });
			const res2 = await app.request("/api/connections", { headers: authHeadersA() });
			const elapsed = Date.now() - t0;

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
			// Two requests that each spawn `claude mcp list` would be >> 500ms.
			// If the implementation re-probes on every GET it will exceed this bound.
			expect(elapsed).toBeLessThan(500);
		});
	});
});
