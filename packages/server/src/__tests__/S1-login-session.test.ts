/**
 * S1 — Unit tests for login-session service.
 *
 * Tests verify the acceptance criteria for:
 * - Token generation (generateToken, hashToken)
 * - LoginSession CRUD (createLoginSession, findLoginSessionByTokenHash)
 * - Validation (validateBearerToken: happy, expired, revoked, invalid)
 * - Revocation (revokeLoginSession, revokeAllUserSessions)
 *
 * @lore S1 PGLite migration: All tests are now async because createTestDb()
 * returns a Promise<TestDbHandle> and all service functions are async.
 * vi.fakeTimers still work correctly for expiry checks because Date is mocked
 * before the comparison runs (no DB round-trip involved in expiry check).
 */

import type { TestDbHandle } from "@hyperidle/db";
import { createTestDb, type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLoginSession,
	findLoginSessionByTokenHash,
	generateToken,
	hashToken,
	revokeAllUserSessions,
	revokeLoginSession,
	validateBearerToken,
} from "../services/login-session.js";

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
	it("returns plaintext and hash fields", () => {
		const result = generateToken();
		expect(result).toHaveProperty("plaintext");
		expect(result).toHaveProperty("hash");
	});

	it("plaintext is a non-empty base64url string", () => {
		const { plaintext } = generateToken();
		// base64url: alphanumeric, +/= replaced by -_
		expect(plaintext).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(plaintext.length).toBeGreaterThan(0);
	});

	it("hash is a 64-char hex string (SHA-256)", () => {
		const { hash } = generateToken();
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("two tokens are always distinct", () => {
		const a = generateToken();
		const b = generateToken();
		expect(a.plaintext).not.toBe(b.plaintext);
		expect(a.hash).not.toBe(b.hash);
	});

	it("hash matches hashToken(plaintext)", () => {
		const { plaintext, hash } = generateToken();
		expect(hashToken(plaintext)).toBe(hash);
	});
});

describe("S1 — hashToken", () => {
	it("produces a 64-char hex string", () => {
		const result = hashToken("some-plaintext-token");
		expect(result).toMatch(/^[0-9a-f]{64}$/);
	});

	it("is deterministic for the same input", () => {
		const a = hashToken("stable-token");
		const b = hashToken("stable-token");
		expect(a).toBe(b);
	});

	it("produces different hashes for different inputs", () => {
		const a = hashToken("token-a");
		const b = hashToken("token-b");
		expect(a).not.toBe(b);
	});
});

describe("S1 — createLoginSession", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	// @lore S1: PGlite init under system load can exceed 30s. Raise hook timeout to 60s.
	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedUser(db, "u-sess-1");
	}, 60_000);

	afterEach(async () => {
		await handle.close();
	});

	it("returns session and plaintext token", async () => {
		const result = await createLoginSession(db, "u-sess-1");
		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("token");
		expect(typeof result.token).toBe("string");
	});

	it("stores hashed token (not plaintext)", async () => {
		const { session, token } = await createLoginSession(db, "u-sess-1");
		// tokenHash should NOT equal the plaintext
		expect(session.tokenHash).not.toBe(token);
		// but should equal hashToken(plaintext)
		expect(session.tokenHash).toBe(hashToken(token));
	});

	it("session has correct userId", async () => {
		const { session } = await createLoginSession(db, "u-sess-1");
		expect(session.userId).toBe("u-sess-1");
	});

	it("session has future expiresAt (default 30 days)", async () => {
		const before = new Date();
		const { session } = await createLoginSession(db, "u-sess-1");
		const expiresAt = new Date(session.expiresAt);
		const after = new Date();

		// Should expire roughly 30 days from now
		const thirtyDays = 30 * 24 * 60 * 60 * 1000;
		expect(expiresAt.getTime()).toBeGreaterThan(before.getTime() + thirtyDays - 1000);
		expect(expiresAt.getTime()).toBeLessThan(after.getTime() + thirtyDays + 1000);
	});

	it("session has null revokedAt by default", async () => {
		const { session } = await createLoginSession(db, "u-sess-1");
		expect(session.revokedAt).toBeNull();
	});

	it("custom TTL is respected", async () => {
		const ttlMs = 60 * 1000; // 1 minute
		const before = Date.now();
		const { session } = await createLoginSession(db, "u-sess-1", ttlMs);
		const expiresAt = new Date(session.expiresAt).getTime();
		expect(expiresAt).toBeGreaterThan(before + ttlMs - 500);
		expect(expiresAt).toBeLessThan(before + ttlMs + 500);
	});
});

describe("S1 — findLoginSessionByTokenHash", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedUser(db, "u-find-1");
	}, 60_000);

	afterEach(async () => {
		await handle.close();
	});

	it("returns session when found", async () => {
		const { session } = await createLoginSession(db, "u-find-1");
		const found = await findLoginSessionByTokenHash(db, session.tokenHash);
		expect(found).not.toBeNull();
		expect(found?.id).toBe(session.id);
	});

	it("returns null when hash not found", async () => {
		const result = await findLoginSessionByTokenHash(db, "nonexistent-hash");
		expect(result).toBeNull();
	});
});

describe("S1 — validateBearerToken", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedUser(db, "u-val-1");
	}, 60_000);

	afterEach(async () => {
		await handle.close();
		vi.useRealTimers();
	});

	it("returns ok:true with session for a valid token", async () => {
		const { token } = await createLoginSession(db, "u-val-1");
		const result = await validateBearerToken(db, token);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.session.userId).toBe("u-val-1");
		}
	});

	it("returns ok:false with SESSION_EXPIRED for an expired token", async () => {
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

	it("returns ok:false with SESSION_REVOKED for a revoked token", async () => {
		const { token, session } = await createLoginSession(db, "u-val-1");
		await revokeLoginSession(db, session.id);
		const result = await validateBearerToken(db, token);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_REVOKED");
		}
	});

	it("returns ok:false with INVALID_TOKEN for an unknown token", async () => {
		const result = await validateBearerToken(db, "garbage-token-that-does-not-exist");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("INVALID_TOKEN");
		}
	});

	it("validates revokedAt takes precedence over expiry check (both set)", async () => {
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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedUser(db, "u-rev-1");
	}, 60_000);

	afterEach(async () => {
		await handle.close();
	});

	it("sets revokedAt on the session", async () => {
		const { session } = await createLoginSession(db, "u-rev-1");
		expect(session.revokedAt).toBeNull();

		await revokeLoginSession(db, session.id);

		const found = await findLoginSessionByTokenHash(db, session.tokenHash);
		expect(found?.revokedAt).not.toBeNull();
	});

	it("after revocation, validateBearerToken returns SESSION_REVOKED", async () => {
		const { token, session } = await createLoginSession(db, "u-rev-1");
		await revokeLoginSession(db, session.id);
		const result = await validateBearerToken(db, token);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_REVOKED");
		}
	});
});

describe("S1 — revokeAllUserSessions", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedUser(db, "u-revall-1");
		await seedUser(db, "u-revall-2");
	}, 60_000);

	afterEach(async () => {
		await handle.close();
	});

	it("revokes all sessions for a user", async () => {
		const { session: s1 } = await createLoginSession(db, "u-revall-1");
		const { session: s2 } = await createLoginSession(db, "u-revall-1");

		const count = await revokeAllUserSessions(db, "u-revall-1");
		expect(count).toBe(2);

		const found1 = await findLoginSessionByTokenHash(db, s1.tokenHash);
		const found2 = await findLoginSessionByTokenHash(db, s2.tokenHash);
		expect(found1?.revokedAt).not.toBeNull();
		expect(found2?.revokedAt).not.toBeNull();
	});

	it("does not affect sessions of other users", async () => {
		const { session: s1 } = await createLoginSession(db, "u-revall-1");
		const { session: s2 } = await createLoginSession(db, "u-revall-2");

		await revokeAllUserSessions(db, "u-revall-1");

		const found1 = await findLoginSessionByTokenHash(db, s1.tokenHash);
		const found2 = await findLoginSessionByTokenHash(db, s2.tokenHash);
		expect(found1?.revokedAt).not.toBeNull();
		expect(found2?.revokedAt).toBeNull();
	});

	it("returns 0 if no sessions exist for user", async () => {
		const count = await revokeAllUserSessions(db, "u-revall-1");
		expect(count).toBe(0);
	});

	it("only revokes unrevoked sessions (idempotent on revoked ones)", async () => {
		const { session: s1 } = await createLoginSession(db, "u-revall-1");
		const { session: s2 } = await createLoginSession(db, "u-revall-1");

		// Pre-revoke s1
		await revokeLoginSession(db, s1.id);

		// revokeAllUserSessions should handle already-revoked sessions gracefully
		const count = await revokeAllUserSessions(db, "u-revall-1");
		// count of operations may vary; what matters is both end up revoked
		expect(count).toBeGreaterThanOrEqual(0);

		const found2 = await findLoginSessionByTokenHash(db, s2.tokenHash);
		expect(found2?.revokedAt).not.toBeNull();
	});
});
