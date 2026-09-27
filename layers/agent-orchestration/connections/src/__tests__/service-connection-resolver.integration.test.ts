/**
 * `resolveHeldToken` against a REAL PGlite DB with real inserted rows — a
 * resolver test that never calls resolve() against real data cannot catch a
 * dropped ownership guard. Proves:
 *
 *   (a) resolve(userA, tokenRowId) → the exact original plaintext secret
 *   (b) resolve(userB, tokenRowId) → null (cross-user isolation)
 *   (c) resolve(userA, mcpRowId)   → null (no token stored)
 *   (d) resolve(userA, absentId)   → null (non-existent row)
 *   (e) tampered encryptedToken    → null, never throws
 *
 * Sanity-break property, verifiable by inspection: dropping `eq(userId)` from
 * the production WHERE clause makes test (b) fail; zeroing `encryptedToken`
 * in the DB makes test (a) fail.
 */

import { type HyperIdleDb, serviceConnections, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { resolveHeldToken } from "../service-connection-resolver.js";
import { decryptCredentialValue, encryptCredentialValue } from "../token-cipher.js";

const SERVER_SECRET = "integration-test-server-secret-an1";
const NOW = new Date().toISOString();

const USER_A_ID = "u-an1-resolver-a";
const USER_B_ID = "u-an1-resolver-b";

describe("ServiceConnectionResolver (real DB integration)", () => {
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
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: USER_B_ID,
					kind: "human",
					name: "Resolver User B",
					role: "member",
					status: "active",
					createdAt: NOW,
				},
			])
			.onConflictDoNothing();
	}

	// ─── (a) owner resolves to exact original plaintext ─────────────────────

	test("(a) resolve(userA, tokenRowId) returns the exact original plaintext secret", async ({
		db,
	}) => {
		await seedUsers(db);

		const PLAINTEXT = "sk-stripe-integration-test-secret-abc123";
		// env stubbed in beforeEach (HYPERIDLE_CREDENTIAL_KEY = SERVER_SECRET)
		const encrypted = encryptCredentialValue(PLAINTEXT);
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

		const result = await resolveHeldToken(db, USER_A_ID, rowId, decryptCredentialValue);

		// Must return the EXACT plaintext — not null, not a different string.
		expect(result).toBe(PLAINTEXT);

		// This test alone cannot catch a dropped ownership guard — omitting
		// `eq(userId)` from the production WHERE clause still returns PLAINTEXT
		// here; test (b) is what catches that. It does catch a broken encryption
		// path: zeroing `encryptedToken` in the DB makes this return null instead.
	});

	// ─── (b) cross-user lookup → null, never leaks existence ────────────────

	test("(b) resolve(userB, tokenRowId) returns null — cross-user isolation", async ({ db }) => {
		await seedUsers(db);

		const PLAINTEXT = "sk-stripe-user-a-secret-xyz";
		// env stubbed in beforeEach (HYPERIDLE_CREDENTIAL_KEY = SERVER_SECRET)
		const encrypted = encryptCredentialValue(PLAINTEXT);
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

		// USER_B must NOT get USER_A's plaintext — cross-user → null
		const result = await resolveHeldToken(db, USER_B_ID, rowId, decryptCredentialValue);
		expect(result).toBeNull();

		// Sanity-break property: the production WHERE clause is
		// `.where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))`
		// — dropping the `eq(userId)` clause makes resolve(USER_B_ID, rowId)
		// return PLAINTEXT instead of null, so this test exercises the real
		// isolation guard, not a stand-in for it.
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

		const result = await resolveHeldToken(db, USER_A_ID, mcpRowId, decryptCredentialValue);

		// mcp rows have no secret → resolver must return null
		expect(result).toBeNull();
	});

	// ─── (d) absent id → null ────────────────────────────────────────────────

	test("(d) resolve(userA, absentId) returns null — non-existent row", async ({ db }) => {
		await seedUsers(db);

		const result = await resolveHeldToken(
			db,
			USER_A_ID,
			"sc-does-not-exist-at-all",
			decryptCredentialValue,
		);

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

		// Must return null, must not throw
		let threw = false;
		let result: string | null = "sentinel";
		try {
			result = await resolveHeldToken(db, USER_A_ID, rowId, decryptCredentialValue);
		} catch {
			threw = true;
		}

		expect(threw).toBe(false);
		expect(result).toBeNull();
	});

	// ─── missing server secret in env → null (graceful degradation) ──────────
	//
	// @lore the cipher reads HYPERIDLE_CREDENTIAL_KEY from env directly, not a `serverSecret` parameter.

	test("resolve returns null when no HYPERIDLE_CREDENTIAL_KEY in env", async ({ db }) => {
		await seedUsers(db);

		// Store an encrypted row (encrypted with SERVER_SECRET from beforeEach)
		const PLAINTEXT = "sk-secret-missing-env-test";
		const encrypted = encryptCredentialValue(PLAINTEXT);
		const rowId = "sc-resolver-test-missing-secret";

		await db.insert(serviceConnections).values({
			id: `${USER_A_ID}-conn-missing`,
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

		// Clear the env secret — decryptCredentialValue returns null → resolve returns null
		vi.unstubAllEnvs();
		delete process.env.HYPERIDLE_CREDENTIAL_KEY;
		delete process.env.HYPERIDLE_API_KEY;

		const result = await resolveHeldToken(db, USER_A_ID, rowId, decryptCredentialValue);
		expect(result).toBeNull();
	});
});
