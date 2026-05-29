/**
 * Invite code service — code generation, creation, and claim flow.
 *
 * @lore S1: The claim flow (steps 5-7 in the architecture plan) is wrapped in
 * a db.transaction() to ensure atomicity: user creation + invite update +
 * LoginSession creation all succeed or all fail together. SQLite serializes
 * writes anyway, but the explicit transaction makes the atomicity intent clear
 * and prevents partial writes on unexpected errors.
 */

import { randomBytes } from "node:crypto";
import type { HyperIdleDb, InviteCode, User } from "@hyperidle/db";
import { inviteCodes, users } from "@hyperidle/db";
import type { InviteRole } from "@hyperidle/shared";
import { INVITE_CODE_TTL_MS } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { createLoginSession } from "./login-session.js";

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
export function createInvite(
	db: HyperIdleDb,
	createdBy: string,
	role: InviteRole,
	ttlMs: number = INVITE_CODE_TTL_MS,
): InviteCode {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const id = `ic_${randomBytes(12).toString("hex")}`;
	const code = generateInviteCode();

	return db
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
		.returning()
		.get();
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
export function claimInvite(
	db: HyperIdleDb,
	code: string,
	name: string,
	email?: string,
):
	| { ok: true; user: User; token: string }
	| { ok: false; error: "INVITE_CLAIMED" | "INVITE_EXPIRED" | "NOT_FOUND" } {
	// Step 1: look up the invite code
	const invite = db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).get();

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
	return db.transaction((tx) => {
		const now = new Date().toISOString();
		const userId = `u_${randomBytes(12).toString("hex")}`;

		// Step 5: create user
		const user = tx
			.insert(users)
			.values({
				id: userId,
				kind: "human",
				name,
				email: email ?? null,
				role: invite.role,
				status: "active",
				createdAt: now,
			})
			.returning()
			.get();

		// Step 6: mark invite as claimed
		tx.update(inviteCodes).set({ claimedBy: userId }).where(eq(inviteCodes.id, invite.id)).run();

		// Step 7: create LoginSession
		const { token } = createLoginSession(tx as unknown as HyperIdleDb, userId);

		return { ok: true as const, user, token };
	});
}
