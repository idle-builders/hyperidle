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
 *
 * @lore S1 PGLite migration: all DB operations are async (PGLite uses WASM
 * Postgres semantics — no sync .get()/.run()/.all()). The service uses Drizzle
 * PG async patterns throughout.
 */

import { createHash, randomBytes } from "node:crypto";
import type { HyperIdleDb, LoginSession } from "@hyperidle/db";
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
 * @lore S1 PGLite: async because PGLite uses WASM Postgres semantics.
 * Drizzle PG insert returns a Promise; callers must await.
 */
export async function createLoginSession(
	db: HyperIdleDb,
	userId: string,
	ttlMs: number = LOGIN_SESSION_TTL_MS,
): Promise<{ session: LoginSession; token: string }> {
	const { plaintext, hash } = generateToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const id = `ls_${randomBytes(12).toString("hex")}`;

	const [session] = await db
		.insert(loginSessions)
		.values({
			id,
			userId,
			tokenHash: hash,
			expiresAt: expiresAt.toISOString(),
			createdAt: now.toISOString(),
			revokedAt: null,
		})
		.returning();

	if (!session) {
		throw new Error("createLoginSession: insert returned no rows");
	}

	return { session, token: plaintext };
}

/**
 * Look up a LoginSession by its token hash.
 * Returns null if no session with that hash exists.
 */
export async function findLoginSessionByTokenHash(
	db: HyperIdleDb,
	tokenHash: string,
): Promise<LoginSession | null> {
	const [session] = await db
		.select()
		.from(loginSessions)
		.where(eq(loginSessions.tokenHash, tokenHash))
		.limit(1);
	return session ?? null;
}

/**
 * Validate a bearer token.
 *
 * Flow: hash the plaintext → DB lookup by hash → check revoked → check expired.
 *
 * Returns `{ ok: true, session }` on success, or
 * `{ ok: false, reason }` on failure.
 */
export async function validateBearerToken(
	db: HyperIdleDb,
	plaintextToken: string,
): Promise<
	| { ok: true; session: LoginSession }
	| { ok: false; reason: "SESSION_EXPIRED" | "SESSION_REVOKED" | "INVALID_TOKEN" }
> {
	const tokenHash = hashToken(plaintextToken);
	const session = await findLoginSessionByTokenHash(db, tokenHash);

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
export async function revokeLoginSession(db: HyperIdleDb, sessionId: string): Promise<void> {
	await db
		.update(loginSessions)
		.set({ revokedAt: new Date().toISOString() })
		.where(and(eq(loginSessions.id, sessionId), isNull(loginSessions.revokedAt)));
}
