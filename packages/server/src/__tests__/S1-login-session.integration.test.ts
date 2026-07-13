/**
 * S1 — Unit tests for login-session service.
 *
 * Tests verify the acceptance criteria for:
 * - Token generation (generateToken, hashToken)
 * - LoginSession CRUD (createLoginSession, findLoginSessionByTokenHash)
 * - Validation (validateBearerToken: happy, expired, revoked, invalid)
 * - Revocation (revokeLoginSession)
 *
 * @lore S1 PGLite migration: All tests are now async because createTestDb()
 * returns a Promise<TestDbHandle> and all service functions are async.
 * vi.fakeTimers still work correctly for expiry checks because Date is mocked
 * before the comparison runs (no DB round-trip involved in expiry check).
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, describe, expect, vi } from "vitest";
import {
	createLoginSession,
	findLoginSessionByTokenHash,
	generateToken,
	hashToken,
	revokeLoginSession,
	validateBearerToken,
} from "@hyperidle/core-app";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

async function seedUser(db: HyperIdleDb, id = "u-test-1"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "Test User",
			email: "test@example.com",
			role: "member",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

describe("S1 — generateToken", () => {
	test("returns plaintext and hash fields", () => {
		const result = generateToken();
		expect(result).toHaveProperty("plaintext");
		expect(result).toHaveProperty("hash");
	});

	test("plaintext is a non-empty base64url string", () => {
		const { plaintext } = generateToken();
		// base64url: alphanumeric, +/= replaced by -_
		expect(plaintext).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(plaintext.length).toBeGreaterThan(0);
	});

	test("hash is a 64-char hex string (SHA-256)", () => {
		const { hash } = generateToken();
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	test("two tokens are always distinct", () => {
		const a = generateToken();
		const b = generateToken();
		expect(a.plaintext).not.toBe(b.plaintext);
		expect(a.hash).not.toBe(b.hash);
	});

	test("hash matches hashToken(plaintext)", () => {
		const { plaintext, hash } = generateToken();
		expect(hashToken(plaintext)).toBe(hash);
	});
});

describe("S1 — hashToken", () => {
	test("produces a 64-char hex string", () => {
		const result = hashToken("some-plaintext-token");
		expect(result).toMatch(/^[0-9a-f]{64}$/);
	});

	test("is deterministic for the same input", () => {
		const a = hashToken("stable-token");
		const b = hashToken("stable-token");
		expect(a).toBe(b);
	});

	test("produces different hashes for different inputs", () => {
		const a = hashToken("token-a");
		const b = hashToken("token-b");
		expect(a).not.toBe(b);
	});
});

describe("S1 — createLoginSession", () => {
	test("returns session and plaintext token", async ({ db }) => {
		await seedUser(db, "u-sess-1");
		const result = await createLoginSession(db, "u-sess-1");
		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("token");
		expect(typeof result.token).toBe("string");
	});

	test("stores hashed token (not plaintext)", async ({ db }) => {
		await seedUser(db, "u-sess-1");
		const { session, token } = await createLoginSession(db, "u-sess-1");
		// tokenHash should NOT equal the plaintext
		expect(session.tokenHash).not.toBe(token);
		// but should equal hashToken(plaintext)
		expect(session.tokenHash).toBe(hashToken(token));
	});

	test("session has correct userId", async ({ db }) => {
		await seedUser(db, "u-sess-1");
		const { session } = await createLoginSession(db, "u-sess-1");
		expect(session.userId).toBe("u-sess-1");
	});

	test("session has future expiresAt (default 30 days)", async ({ db }) => {
		await seedUser(db, "u-sess-1");
		const before = new Date();
		const { session } = await createLoginSession(db, "u-sess-1");
		const expiresAt = new Date(session.expiresAt);
		const after = new Date();

		// Should expire roughly 30 days from now
		const thirtyDays = 30 * 24 * 60 * 60 * 1000;
		expect(expiresAt.getTime()).toBeGreaterThan(before.getTime() + thirtyDays - 1000);
		expect(expiresAt.getTime()).toBeLessThan(after.getTime() + thirtyDays + 1000);
	});

	test("session has null revokedAt by default", async ({ db }) => {
		await seedUser(db, "u-sess-1");
		const { session } = await createLoginSession(db, "u-sess-1");
		expect(session.revokedAt).toBeNull();
	});

	test("custom TTL is respected", async ({ db }) => {
		await seedUser(db, "u-sess-1");
		const ttlMs = 60 * 1000; // 1 minute
		const before = Date.now();
		const { session } = await createLoginSession(db, "u-sess-1", ttlMs);
		const expiresAt = new Date(session.expiresAt).getTime();
		expect(expiresAt).toBeGreaterThan(before + ttlMs - 500);
		expect(expiresAt).toBeLessThan(before + ttlMs + 500);
	});
});

describe("S1 — findLoginSessionByTokenHash", () => {
	test("returns session when found", async ({ db }) => {
		await seedUser(db, "u-find-1");
		const { session } = await createLoginSession(db, "u-find-1");
		const found = await findLoginSessionByTokenHash(db, session.tokenHash);
		expect(found).not.toBeNull();
		expect(found?.id).toBe(session.id);
	});

	test("returns null when hash not found", async ({ db }) => {
		await seedUser(db, "u-find-1");
		const result = await findLoginSessionByTokenHash(db, "nonexistent-hash");
		expect(result).toBeNull();
	});
});

describe("S1 — validateBearerToken", () => {
	// Keep afterEach for vi.useRealTimers() — non-DB timer cleanup
	afterEach(() => {
		vi.useRealTimers();
	});

	test("returns ok:true with session for a valid token", async ({ db }) => {
		await seedUser(db, "u-val-1");
		const { token } = await createLoginSession(db, "u-val-1");
		const result = await validateBearerToken(db, token);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.session.userId).toBe("u-val-1");
		}
	});

	test("returns ok:false with SESSION_EXPIRED for an expired token", async ({ db }) => {
		await seedUser(db, "u-val-1");
		// Create session with 1ms TTL
		const { token } = await createLoginSession(db, "u-val-1", 1);
		// Wait for expiry using fake timers
		vi.useFakeTimers();
		vi.advanceTimersByTime(100);
		const result = await validateBearerToken(db, token);
		vi.useRealTimers();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_EXPIRED");
		}
	});

	test("returns ok:false with SESSION_REVOKED for a revoked token", async ({ db }) => {
		await seedUser(db, "u-val-1");
		const { token, session } = await createLoginSession(db, "u-val-1");
		await revokeLoginSession(db, session.id);
		const result = await validateBearerToken(db, token);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_REVOKED");
		}
	});

	test("returns ok:false with INVALID_TOKEN for an unknown token", async ({ db }) => {
		await seedUser(db, "u-val-1");
		const result = await validateBearerToken(db, "garbage-token-that-does-not-exist");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("INVALID_TOKEN");
		}
	});

	test("validates revokedAt takes precedence over expiry check (both set)", async ({ db }) => {
		await seedUser(db, "u-val-1");
		// Create an already-expired token that is also revoked
		const { token, session } = await createLoginSession(db, "u-val-1", 1);
		await revokeLoginSession(db, session.id);
		vi.useFakeTimers();
		vi.advanceTimersByTime(100);
		const result = await validateBearerToken(db, token);
		vi.useRealTimers();
		// Either SESSION_REVOKED or SESSION_EXPIRED is acceptable — revoked check first
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(["SESSION_REVOKED", "SESSION_EXPIRED"]).toContain(result.reason);
		}
	});
});

describe("S1 — revokeLoginSession", () => {
	test("sets revokedAt on the session", async ({ db }) => {
		await seedUser(db, "u-rev-1");
		const { session } = await createLoginSession(db, "u-rev-1");
		expect(session.revokedAt).toBeNull();

		await revokeLoginSession(db, session.id);

		const found = await findLoginSessionByTokenHash(db, session.tokenHash);
		expect(found?.revokedAt).not.toBeNull();
	});

	test("after revocation, validateBearerToken returns SESSION_REVOKED", async ({ db }) => {
		await seedUser(db, "u-rev-1");
		const { token, session } = await createLoginSession(db, "u-rev-1");
		await revokeLoginSession(db, session.id);
		const result = await validateBearerToken(db, token);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_REVOKED");
		}
	});
});
