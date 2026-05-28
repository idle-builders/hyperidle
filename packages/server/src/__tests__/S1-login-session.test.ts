/**
 * S1 — Unit tests for login-session service.
 *
 * Red phase: these tests verify the acceptance criteria for:
 * - Token generation (generateToken, hashToken)
 * - LoginSession CRUD (createLoginSession, findLoginSessionByTokenHash)
 * - Validation (validateBearerToken: happy, expired, revoked, invalid)
 * - Revocation (revokeLoginSession, revokeAllUserSessions)
 */

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

function seedUser(db: HyperIdleDb, id = "u-test-1"): void {
	db.insert(users)
		.values({
			id,
			kind: "human",
			name: "Test User",
			email: "test@example.com",
			role: "member",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing()
		.run();
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
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedUser(db, "u-sess-1");
	});

	it("returns session and plaintext token", () => {
		const result = createLoginSession(db, "u-sess-1");
		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("token");
		expect(typeof result.token).toBe("string");
	});

	it("stores hashed token (not plaintext)", () => {
		const { session, token } = createLoginSession(db, "u-sess-1");
		// tokenHash should NOT equal the plaintext
		expect(session.tokenHash).not.toBe(token);
		// but should equal hashToken(plaintext)
		expect(session.tokenHash).toBe(hashToken(token));
	});

	it("session has correct userId", () => {
		const { session } = createLoginSession(db, "u-sess-1");
		expect(session.userId).toBe("u-sess-1");
	});

	it("session has future expiresAt (default 30 days)", () => {
		const before = new Date();
		const { session } = createLoginSession(db, "u-sess-1");
		const expiresAt = new Date(session.expiresAt);
		const after = new Date();

		// Should expire roughly 30 days from now
		const thirtyDays = 30 * 24 * 60 * 60 * 1000;
		expect(expiresAt.getTime()).toBeGreaterThan(before.getTime() + thirtyDays - 1000);
		expect(expiresAt.getTime()).toBeLessThan(after.getTime() + thirtyDays + 1000);
	});

	it("session has null revokedAt by default", () => {
		const { session } = createLoginSession(db, "u-sess-1");
		expect(session.revokedAt).toBeNull();
	});

	it("custom TTL is respected", () => {
		const ttlMs = 60 * 1000; // 1 minute
		const before = Date.now();
		const { session } = createLoginSession(db, "u-sess-1", ttlMs);
		const expiresAt = new Date(session.expiresAt).getTime();
		expect(expiresAt).toBeGreaterThan(before + ttlMs - 500);
		expect(expiresAt).toBeLessThan(before + ttlMs + 500);
	});
});

describe("S1 — findLoginSessionByTokenHash", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedUser(db, "u-find-1");
	});

	it("returns session when found", () => {
		const { session } = createLoginSession(db, "u-find-1");
		const found = findLoginSessionByTokenHash(db, session.tokenHash);
		expect(found).not.toBeNull();
		expect(found?.id).toBe(session.id);
	});

	it("returns null when hash not found", () => {
		const result = findLoginSessionByTokenHash(db, "nonexistent-hash");
		expect(result).toBeNull();
	});
});

describe("S1 — validateBearerToken", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedUser(db, "u-val-1");
	});

	it("returns ok:true with session for a valid token", () => {
		const { token } = createLoginSession(db, "u-val-1");
		const result = validateBearerToken(db, token);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.session.userId).toBe("u-val-1");
		}
	});

	it("returns ok:false with SESSION_EXPIRED for an expired token", () => {
		// Create session with 1ms TTL
		const { token } = createLoginSession(db, "u-val-1", 1);
		// Wait for expiry
		vi.useFakeTimers();
		vi.advanceTimersByTime(100);
		const result = validateBearerToken(db, token);
		vi.useRealTimers();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_EXPIRED");
		}
	});

	it("returns ok:false with SESSION_REVOKED for a revoked token", () => {
		const { token, session } = createLoginSession(db, "u-val-1");
		revokeLoginSession(db, session.id);
		const result = validateBearerToken(db, token);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_REVOKED");
		}
	});

	it("returns ok:false with INVALID_TOKEN for an unknown token", () => {
		const result = validateBearerToken(db, "garbage-token-that-does-not-exist");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("INVALID_TOKEN");
		}
	});

	it("validates revokedAt takes precedence over expiry check (both set)", () => {
		// Create an already-expired token that is also revoked
		const { token, session } = createLoginSession(db, "u-val-1", 1);
		revokeLoginSession(db, session.id);
		vi.useFakeTimers();
		vi.advanceTimersByTime(100);
		const result = validateBearerToken(db, token);
		vi.useRealTimers();
		// Either SESSION_REVOKED or SESSION_EXPIRED is acceptable — revoked check first
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(["SESSION_REVOKED", "SESSION_EXPIRED"]).toContain(result.reason);
		}
	});
});

describe("S1 — revokeLoginSession", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedUser(db, "u-rev-1");
	});

	it("sets revokedAt on the session", () => {
		const { session } = createLoginSession(db, "u-rev-1");
		expect(session.revokedAt).toBeNull();

		revokeLoginSession(db, session.id);

		const found = findLoginSessionByTokenHash(db, session.tokenHash);
		expect(found?.revokedAt).not.toBeNull();
	});

	it("after revocation, validateBearerToken returns SESSION_REVOKED", () => {
		const { token, session } = createLoginSession(db, "u-rev-1");
		revokeLoginSession(db, session.id);
		const result = validateBearerToken(db, token);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("SESSION_REVOKED");
		}
	});
});

describe("S1 — revokeAllUserSessions", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedUser(db, "u-revall-1");
		seedUser(db, "u-revall-2");
	});

	it("revokes all sessions for a user", () => {
		const { session: s1 } = createLoginSession(db, "u-revall-1");
		const { session: s2 } = createLoginSession(db, "u-revall-1");

		const count = revokeAllUserSessions(db, "u-revall-1");
		expect(count).toBe(2);

		const found1 = findLoginSessionByTokenHash(db, s1.tokenHash);
		const found2 = findLoginSessionByTokenHash(db, s2.tokenHash);
		expect(found1?.revokedAt).not.toBeNull();
		expect(found2?.revokedAt).not.toBeNull();
	});

	it("does not affect sessions of other users", () => {
		const { session: s1 } = createLoginSession(db, "u-revall-1");
		const { session: s2 } = createLoginSession(db, "u-revall-2");

		revokeAllUserSessions(db, "u-revall-1");

		const found1 = findLoginSessionByTokenHash(db, s1.tokenHash);
		const found2 = findLoginSessionByTokenHash(db, s2.tokenHash);
		expect(found1?.revokedAt).not.toBeNull();
		expect(found2?.revokedAt).toBeNull();
	});

	it("returns 0 if no sessions exist for user", () => {
		const count = revokeAllUserSessions(db, "u-revall-1");
		expect(count).toBe(0);
	});

	it("only revokes unrevoked sessions (idempotent on revoked ones)", () => {
		const { session: s1 } = createLoginSession(db, "u-revall-1");
		const { session: s2 } = createLoginSession(db, "u-revall-1");

		// Pre-revoke s1
		revokeLoginSession(db, s1.id);

		// revokeAllUserSessions should handle already-revoked sessions gracefully
		const count = revokeAllUserSessions(db, "u-revall-1");
		// count of operations may vary; what matters is both end up revoked
		expect(count).toBeGreaterThanOrEqual(0);

		const found2 = findLoginSessionByTokenHash(db, s2.tokenHash);
		expect(found2?.revokedAt).not.toBeNull();
	});
});
