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
import type { InviteRole } from "@hyperidle/domain-model";
import { INVITE_CODE_TTL_MS } from "@hyperidle/domain-model";
import { and, eq, isNull } from "drizzle-orm";
import { createLoginSession } from "./login-session.js";
import { getOrCreateUser } from "./user-store.js";

const concurrentClaim = new Error("invite claimed concurrently");

// ─── Code generation ──────────────────────────────────────────────────────────

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
	const code = randomBytes(24).toString("base64url");

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
	try {
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

			const [claimed] = await tx
				.update(inviteCodes)
				.set({ claimedBy: userId })
				.where(and(eq(inviteCodes.id, invite.id), isNull(inviteCodes.claimedBy)))
				.returning({ id: inviteCodes.id });
			if (!claimed) throw concurrentClaim;

			// Step 7: create LoginSession
			const { token } = await createLoginSession(tx, userId);

			return { ok: true as const, user, token };
		});
	} catch (error) {
		if (error === concurrentClaim) return { ok: false, error: "INVITE_CLAIMED" };
		throw error;
	}
}

// ─── Retention (AU19 Increment 2g) ────────────────────────────────────────────
