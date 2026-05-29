/**
 * LoginSession service — token generation, CRUD, and validation.
 *
 * @lore S1: Plaintext tokens are NEVER stored. Only the SHA-256 hash lives in
 * the database. The hash is indexed (unique) so lookup is O(log n) with no
 * timing side-channel concern at the DB layer (unique index always returns 0
 * or 1 row).
 *
 * @lore S1 SF-1: verifyTokenHash (constant-time comparison) is NOT needed.
 * The flow hashes the plaintext then does a DB lookup by hash index — there is
 * no second hash to compare. A constant-time comparison would be comparing two
 * things that are already equal (the stored hash and the re-derived hash of the
 * same input). The indexed hash lookup is sufficient and safe.
 */

import { createHash, randomBytes } from "node:crypto";
import type { HyperIdleDb, LoginSession, SeedableDb } from "@hyperidle/db";
import { loginSessions } from "@hyperidle/db";
import { LOGIN_SESSION_TTL_MS } from "@hyperidle/shared";
import { and, eq, isNull } from "drizzle-orm";

// ─── Token generation ─────────────────────────────────────────────────────────

/**
 * Generate a 256-bit random token.
 * Returns `plaintext` (base64url, 43 chars) and `hash` (SHA-256 hex, 64 chars).
 */
export function generateToken(): { plaintext: string; hash: string } {
	const bytes = randomBytes(32);
	const plaintext = bytes.toString("base64url");
	const hash = hashToken(plaintext);
	return { plaintext, hash };
}

/**
 * SHA-256 hash of a plaintext token.
 * The input is the base64url-encoded plaintext as produced by generateToken().
 */
export function hashToken(plaintext: string): string {
	return createHash("sha256").update(plaintext).digest("hex");
}

// ─── LoginSession CRUD ────────────────────────────────────────────────────────

/**
 * Create a new LoginSession.
 *
 * Accepts `HyperIdleDb` or a Drizzle transaction (`SeedableDb` covers both
 * since `BetterSQLite3Database` is a structural subtype of `BaseSQLiteDatabase`
 * and `SQLiteTransaction` also extends `BaseSQLiteDatabase`).
 *
 * @lore S1 SF-1: Accepts `SeedableDb` so callers inside `db.transaction()` can
 * pass `tx` directly without an unsafe `as unknown as HyperIdleDb` cast.
 */
export function createLoginSession(
	db: HyperIdleDb | SeedableDb,
	userId: string,
	ttlMs: number = LOGIN_SESSION_TTL_MS,
): { session: LoginSession; token: string } {
	const { plaintext, hash } = generateToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const id = `ls_${randomBytes(12).toString("hex")}`;

	const session = db
		.insert(loginSessions)
		.values({
			id,
			userId,
			tokenHash: hash,
			expiresAt: expiresAt.toISOString(),
			createdAt: now.toISOString(),
			revokedAt: null,
		})
		.returning()
		.get();

	return { session, token: plaintext };
}

/**
 * Look up a LoginSession by its token hash.
 * Returns null if no session with that hash exists.
 */
export function findLoginSessionByTokenHash(
	db: HyperIdleDb,
	tokenHash: string,
): LoginSession | null {
	return (
		db.select().from(loginSessions).where(eq(loginSessions.tokenHash, tokenHash)).get() ?? null
	);
}

/**
 * Validate a bearer token.
 *
 * Flow: hash the plaintext → DB lookup by hash → check revoked → check expired.
 *
 * Returns `{ ok: true, session }` on success, or
 * `{ ok: false, reason }` on failure.
 */
export function validateBearerToken(
	db: HyperIdleDb,
	plaintextToken: string,
):
	| { ok: true; session: LoginSession }
	| { ok: false; reason: "SESSION_EXPIRED" | "SESSION_REVOKED" | "INVALID_TOKEN" } {
	const tokenHash = hashToken(plaintextToken);
	const session = findLoginSessionByTokenHash(db, tokenHash);

	if (!session) {
		return { ok: false, reason: "INVALID_TOKEN" };
	}

	// Check revocation first (most severe)
	if (session.revokedAt !== null) {
		return { ok: false, reason: "SESSION_REVOKED" };
	}

	// Check expiry
	if (new Date(session.expiresAt) < new Date()) {
		return { ok: false, reason: "SESSION_EXPIRED" };
	}

	return { ok: true, session };
}

/**
 * Revoke a LoginSession by setting revokedAt to now.
 * No-op if the session doesn't exist or is already revoked.
 */
export function revokeLoginSession(db: HyperIdleDb, sessionId: string): void {
	db.update(loginSessions)
		.set({ revokedAt: new Date().toISOString() })
		.where(and(eq(loginSessions.id, sessionId), isNull(loginSessions.revokedAt)))
		.run();
}

/**
 * Revoke all active (non-revoked) LoginSessions for a user.
 * Returns the number of sessions revoked.
 */
export function revokeAllUserSessions(db: HyperIdleDb, userId: string): number {
	const now = new Date().toISOString();
	const result = db
		.update(loginSessions)
		.set({ revokedAt: now })
		.where(and(eq(loginSessions.userId, userId), isNull(loginSessions.revokedAt)))
		.returning()
		.all();
	return result.length;
}
