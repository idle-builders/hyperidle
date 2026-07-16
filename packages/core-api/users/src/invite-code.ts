/**
 * Invite code service — code generation, creation, and claim flow.
 *
 * @lore S1: The claim flow (steps 5-7 in the architecture plan) is wrapped in
 * a db.transaction() to ensure atomicity: user creation + invite update +
 * LoginSession creation all succeed or all fail together.
 *
 * @lore S1 PGLite migration: all DB operations are async (PGLite uses WASM
 * Postgres semantics — no sync .get()/.run()/.all()). The service uses Drizzle
 * PG async patterns throughout. db.transaction() is async in PGLite.
 */

import { randomBytes } from "node:crypto";
import type { HyperIdleDb, InviteCode, User } from "@hyperidle/db";
import { inviteCodes } from "@hyperidle/db";
import type { InviteRole } from "@hyperidle/shared";
import { INVITE_CODE_TTL_MS } from "@hyperidle/shared";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { createLoginSession } from "./login-session.js";
import { getOrCreateUser } from "./user-store.js";

// ─── Code generation ──────────────────────────────────────────────────────────

/**
 * Generate a URL-safe random invite code.
 * 24 bytes of randomness encoded as base64url → 32 characters.
 */
export function generateInviteCode(): string {
	return randomBytes(24).toString("base64url");
}

// ─── Invite CRUD ──────────────────────────────────────────────────────────────

/**
 * Create an invite code.
 * Admin-only — this is enforced at the route layer, not here.
 */
export async function createInvite(
	db: HyperIdleDb,
	createdBy: string,
	role: InviteRole,
	ttlMs: number = INVITE_CODE_TTL_MS,
): Promise<InviteCode> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const id = `ic_${randomBytes(12).toString("hex")}`;
	const code = generateInviteCode();

	const [invite] = await db
		.insert(inviteCodes)
		.values({
			id,
			code,
			createdBy,
			claimedBy: null,
			role,
			expiresAt: expiresAt.toISOString(),
			createdAt: now.toISOString(),
		})
		.returning();

	if (!invite) {
		throw new Error("createInvite: insert returned no rows");
	}

	return invite;
}

/**
 * Claim an invite code.
 *
 * Creates a new human user and a LoginSession in a single transaction.
 * Returns the plaintext bearer token (once).
 *
 * Error cases:
 * - Code not found → `{ ok: false, error: "NOT_FOUND" }`
 * - Already claimed → `{ ok: false, error: "INVITE_CLAIMED" }`
 * - Expired → `{ ok: false, error: "INVITE_EXPIRED" }`
 */
export async function claimInvite(
	db: HyperIdleDb,
	code: string,
	name: string,
	email?: string,
): Promise<
	| { ok: true; user: User; token: string }
	| { ok: false; error: "INVITE_CLAIMED" | "INVITE_EXPIRED" | "NOT_FOUND" }
> {
	// Step 1: look up the invite code
	const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);

	if (!invite) {
		return { ok: false, error: "NOT_FOUND" };
	}

	// Step 2: check if already claimed
	if (invite.claimedBy !== null) {
		return { ok: false, error: "INVITE_CLAIMED" };
	}

	// Step 3: check if expired
	if (new Date(invite.expiresAt) < new Date()) {
		return { ok: false, error: "INVITE_EXPIRED" };
	}

	// Steps 4-7: transactional — create user, update invite, create session
	// @lore S1 PGLite: db.transaction() is async in Drizzle PG. The callback
	// receives a transaction object (tx) that shares the same async API as db.
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();
		const userId = `u_${randomBytes(12).toString("hex")}`;

		// Step 5: create user (routed through the owning store; fresh id, so
		// get-or-create resolves to the just-inserted row and returns it).
		const user = await getOrCreateUser(tx as HyperIdleDb, userId, {
			id: userId,
			kind: "human",
			name,
			email: email ?? null,
			role: invite.role,
			status: "active",
			createdAt: now,
		});

		// Step 6: mark invite as claimed
		await tx.update(inviteCodes).set({ claimedBy: userId }).where(eq(inviteCodes.id, invite.id));

		// Step 7: create LoginSession
		const { token } = await createLoginSession(tx, userId);

		return { ok: true as const, user, token };
	});
}

// ─── Retention (AU19 Increment 2g) ────────────────────────────────────────────

/**
 * Prune `invite_codes` rows in two branches — expired-and-unclaimed
 * (`expiresAt < expiredCutoff AND claimedBy IS NULL`) and consumed-past-audit
 * (`claimedBy IS NOT NULL AND createdAt < consumedCutoff`). Returns the
 * union of deleted row ids (deduped, one delete statement).
 *
 * @lore AU19 Increment 2g: moved verbatim from
 * `packages/server/src/services/retention-reaper.ts`'s inline two-branch
 * select+filter+delete (Table ACL now forbids `retention` from touching
 * `inviteCodes` directly — `users` owns it). `retention` calls this through
 * its injected `RetentionUsersReaper` port. Zero behavior change: same
 * JS-side null-filter for `claimedBy` (nullable column, `isNotNull` is
 * insufficient to express "unclaimed" on its own), same id-union-then-single-
 * delete shape.
 */
export async function reapInviteCodes(
	db: HyperIdleDb,
	expiredCutoff: string,
	consumedCutoff: string,
): Promise<string[]> {
	// Expired rows (both claimed and unclaimed) — filter JS-side for unclaimed.
	const expiredRows = await db
		.select({ id: inviteCodes.id, claimedBy: inviteCodes.claimedBy })
		.from(inviteCodes)
		.where(lt(inviteCodes.expiresAt, expiredCutoff));
	const expiredUnclaimedIds = expiredRows.filter((r) => r.claimedBy === null).map((r) => r.id);

	// Consumed rows past the audit window.
	const consumedOldRows = await db
		.select({ id: inviteCodes.id })
		.from(inviteCodes)
		.where(and(isNotNull(inviteCodes.claimedBy), lt(inviteCodes.createdAt, consumedCutoff)));
	const consumedOldIds = consumedOldRows.map((r) => r.id);

	const toDelete = [...new Set([...expiredUnclaimedIds, ...consumedOldIds])];
	if (toDelete.length === 0) {
		return [];
	}

	const deleted = await db
		.delete(inviteCodes)
		.where(inArray(inviteCodes.id, toDelete))
		.returning({ id: inviteCodes.id });
	return deleted.map((r) => r.id);
}
