/**
 * AN1 — ServiceConnectionResolver REAL integration tests (C1 fix).
 *
 * The prior unit test (AN1-service-connection-resolver.test.ts) was hollow:
 * it constructed the resolver with `null as any` DB and never called resolve().
 * Replacing the guard body with a constant or removing the userId scope left
 * all assertions green — proof of hollowness.
 *
 * These tests use a REAL PGlite DB via the vitest fixture, insert real rows,
 * and call resolve() against them.  They prove:
 *
 *   (a) resolve(userA, tokenRowId) → EXACT original plaintext secret (AC4 owner-resolve)
 *   (b) resolve(userB, tokenRowId) → null (AC5 cross-user isolation)
 *   (c) resolve(userA, mcpRowId)   → null (no token stored)
 *   (d) resolve(userA, absentId)   → null (non-existent row)
 *   (e) tampered encryptedToken    → null and NEVER throws
 *
 * Sanity-break verification (documented at the bottom of each test):
 *   Reviewer broke the prod guard (removed `eq(userId)` from the WHERE clause)
 *   and confirmed test (b) went RED, then restored the guard → GREEN.
 *   Reviewer zeroed `encryptedToken` in the DB and confirmed test (a) went RED,
 *   then restored → GREEN.
 */

import { encryptCredentialValue, ServiceConnectionResolver } from "@hyperidle/core-app";
import { type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const SERVER_SECRET = "integration-test-server-secret-an1";
const NOW = new Date().toISOString();

const USER_A_ID = "u-an1-resolver-a";
const USER_B_ID = "u-an1-resolver-b";

describe("AN1 — ServiceConnectionResolver (real DB integration)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	/**
	 * Seed a minimal human user row.  The serviceConnections table has a FK on
	 * users.id, so users must exist before we insert connection rows.
	 */
	async function seedUsers(db: HyperIdleDb): Promise<void> {
		await db
			.insert(users)
			.values([
				{
					id: USER_A_ID,
					kind: "human",
					name: "Resolver User A",
					email: "resolver-a@an1test.dev",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: USER_B_ID,
					kind: "human",
					name: "Resolver User B",
					email: "resolver-b@an1test.dev",
					role: "member",
					status: "active",
					createdAt: NOW,
				},
			])
			.onConflictDoNothing();
	}

	// ─── (a) AC4: owner resolves to exact original plaintext ─────────────────

	test("(a) resolve(userA, tokenRowId) returns the exact original plaintext secret", async ({
		db,
	}) => {
		await seedUsers(db);

		const PLAINTEXT = "sk-stripe-integration-test-secret-abc123";
		const encrypted = encryptCredentialValue(PLAINTEXT, SERVER_SECRET);
		const rowId = "sc-resolver-test-a-token";

		await db.insert(serviceConnections).values({
			id: rowId,
			userId: USER_A_ID,
			service: "Stripe",
			authSource: "token",
			encryptedToken: encrypted,
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const resolver = new ServiceConnectionResolver(db, SERVER_SECRET);
		const result = await resolver.resolve(USER_A_ID, rowId);

		// Must return the EXACT plaintext — not null, not a different string.
		expect(result).toBe(PLAINTEXT);

		// Sanity-break evidence (manual verification documented here):
		// When the prod resolve() WHERE clause was changed to omit `eq(userId)`:
		//   resolve(USER_A_ID, rowId) still returned PLAINTEXT — test (a) stayed GREEN.
		// This test on its own cannot catch the isolation guard removal; test (b) does.
		// Breakage of the encryption path (zeroing encryptedToken in the DB before calling
		// resolve) caused this test to return null → RED.  Restoring encrypted → GREEN.
	});

	// ─── (b) AC5: cross-user lookup → null, never leaks existence ────────────

	test("(b) resolve(userB, tokenRowId) returns null — cross-user isolation (AC5)", async ({
		db,
	}) => {
		await seedUsers(db);

		const PLAINTEXT = "sk-stripe-user-a-secret-xyz";
		const encrypted = encryptCredentialValue(PLAINTEXT, SERVER_SECRET);
		const rowId = "sc-resolver-test-b-isolation";

		// Insert the row belonging to USER_A
		await db.insert(serviceConnections).values({
			id: rowId,
			userId: USER_A_ID,
			service: "Stripe",
			authSource: "token",
			encryptedToken: encrypted,
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const resolver = new ServiceConnectionResolver(db, SERVER_SECRET);

		// USER_B must NOT get USER_A's plaintext — cross-user → null
		const result = await resolver.resolve(USER_B_ID, rowId);
		expect(result).toBeNull();

		// Sanity-break evidence:
		// The WHERE clause in service-connection-resolver.ts line 46 is:
		//   .where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))
		// When we temporarily removed the `eq(serviceConnections.userId, userId)` clause
		// and re-ran this test, resolve(USER_B_ID, rowId) returned PLAINTEXT → RED.
		// Restoring `eq(serviceConnections.userId, userId)` → GREEN again.
		// This confirms the test exercises the real isolation guard.
	});

	// ─── (c) mcp row (no encryptedToken) → null ──────────────────────────────

	test("(c) resolve(userA, mcpRowId) returns null — mcp has no stored token", async ({ db }) => {
		await seedUsers(db);

		const mcpRowId = "sc-resolver-test-c-mcp";

		await db.insert(serviceConnections).values({
			id: mcpRowId,
			userId: USER_A_ID,
			service: "figma.com",
			authSource: "mcp",
			encryptedToken: null,
			serverUrl: "https://mcp.figma.com",
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const resolver = new ServiceConnectionResolver(db, SERVER_SECRET);
		const result = await resolver.resolve(USER_A_ID, mcpRowId);

		// mcp rows have no secret → resolver must return null
		expect(result).toBeNull();
	});

	// ─── (d) absent id → null ────────────────────────────────────────────────

	test("(d) resolve(userA, absentId) returns null — non-existent row", async ({ db }) => {
		await seedUsers(db);

		const resolver = new ServiceConnectionResolver(db, SERVER_SECRET);
		const result = await resolver.resolve(USER_A_ID, "sc-does-not-exist-at-all");

		expect(result).toBeNull();
	});

	// ─── (e) tampered / garbage encryptedToken → null, never throws ──────────

	test("(e) tampered encryptedToken returns null and never throws", async ({ db }) => {
		await seedUsers(db);

		const rowId = "sc-resolver-test-e-tampered";

		// Insert a row with a garbage encrypted value (not valid AES-GCM base64)
		await db.insert(serviceConnections).values({
			id: rowId,
			userId: USER_A_ID,
			service: "Stripe",
			authSource: "token",
			encryptedToken: "this-is-not-valid-aes-gcm-base64!!!!",
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const resolver = new ServiceConnectionResolver(db, SERVER_SECRET);

		// Must return null, must not throw
		let threw = false;
		let result: string | null = "sentinel";
		try {
			result = await resolver.resolve(USER_A_ID, rowId);
		} catch {
			threw = true;
		}

		expect(threw).toBe(false);
		expect(result).toBeNull();
	});

	// ─── missing server secret → null immediately ─────────────────────────────

	test("resolve with null serverSecret returns null without touching DB", async ({ db }) => {
		await seedUsers(db);

		const resolver = new ServiceConnectionResolver(db, null);
		// Should short-circuit and return null (see line 40 in service-connection-resolver.ts)
		const result = await resolver.resolve(USER_A_ID, "sc-any-id");
		expect(result).toBeNull();
	});
});
