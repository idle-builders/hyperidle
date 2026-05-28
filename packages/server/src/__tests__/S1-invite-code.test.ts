/**
 * S1 — Unit tests for invite-code service.
 *
 * Red phase: these tests verify the acceptance criteria for:
 * - Invite code generation (generateInviteCode)
 * - Create invite (createInvite)
 * - Claim invite: happy path, already claimed (INVITE_CLAIMED), expired (INVITE_EXPIRED), not found (NOT_FOUND)
 */

import { createTestDb, type HyperIdleDb, users } from "@hyperidle/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
	claimInvite,
	createInvite,
	generateInviteCode,
} from "../services/invite-code.js";

const NOW = new Date().toISOString();

function seedAdminUser(db: HyperIdleDb, id = "u-admin-1"): void {
	db.insert(users)
		.values({
			id,
			kind: "human",
			name: "Admin",
			email: "admin@example.com",
			role: "admin",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing()
		.run();
}

describe("S1 — generateInviteCode", () => {
	it("returns a non-empty URL-safe string", () => {
		const code = generateInviteCode();
		expect(typeof code).toBe("string");
		expect(code.length).toBeGreaterThan(0);
		// base64url safe characters only
		expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("returns codes of consistent length (24 bytes = 32 chars base64url)", () => {
		const code = generateInviteCode();
		// 24 bytes in base64url = 32 chars
		expect(code.length).toBe(32);
	});

	it("returns distinct codes on each call", () => {
		const a = generateInviteCode();
		const b = generateInviteCode();
		expect(a).not.toBe(b);
	});
});

describe("S1 — createInvite", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedAdminUser(db, "u-admin-1");
	});

	it("returns an InviteCode row with correct fields", () => {
		const invite = createInvite(db, "u-admin-1", "member");
		expect(invite).toHaveProperty("id");
		expect(invite).toHaveProperty("code");
		expect(invite.createdBy).toBe("u-admin-1");
		expect(invite.role).toBe("member");
		expect(invite.claimedBy).toBeNull();
	});

	it("invite has future expiresAt (default 7 days)", () => {
		const before = Date.now();
		const invite = createInvite(db, "u-admin-1", "member");
		const expiresAt = new Date(invite.expiresAt).getTime();
		const sevenDays = 7 * 24 * 60 * 60 * 1000;
		expect(expiresAt).toBeGreaterThan(before + sevenDays - 1000);
		expect(expiresAt).toBeLessThan(before + sevenDays + 1000);
	});

	it("supports admin role", () => {
		const invite = createInvite(db, "u-admin-1", "admin");
		expect(invite.role).toBe("admin");
	});

	it("custom TTL is respected", () => {
		const ttlMs = 60 * 1000; // 1 minute
		const before = Date.now();
		const invite = createInvite(db, "u-admin-1", "member", ttlMs);
		const expiresAt = new Date(invite.expiresAt).getTime();
		expect(expiresAt).toBeGreaterThan(before + ttlMs - 500);
		expect(expiresAt).toBeLessThan(before + ttlMs + 500);
	});
});

describe("S1 — claimInvite (happy path)", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedAdminUser(db, "u-admin-1");
	});

	it("returns ok:true with user and token", () => {
		const invite = createInvite(db, "u-admin-1", "member");
		const result = claimInvite(db, invite.code, "New User");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user).toHaveProperty("id");
			expect(result.user.name).toBe("New User");
			expect(typeof result.token).toBe("string");
			expect(result.token.length).toBeGreaterThan(0);
		}
	});

	it("creates a new user with kind=human", () => {
		const invite = createInvite(db, "u-admin-1", "member");
		const result = claimInvite(db, invite.code, "Jane Doe", "jane@example.com");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.kind).toBe("human");
			expect(result.user.email).toBe("jane@example.com");
		}
	});

	it("creates a new user with role matching invite", () => {
		const invite = createInvite(db, "u-admin-1", "admin");
		const result = claimInvite(db, invite.code, "Admin User");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.role).toBe("admin");
		}
	});

	it("marks invite as claimed (claimedBy is set)", () => {
		const invite = createInvite(db, "u-admin-1", "member");
		const result = claimInvite(db, invite.code, "Claimer");
		expect(result.ok).toBe(true);
		// The invite should now have claimedBy set to the new user
		if (result.ok) {
			// Re-fetch the invite to verify
			const { inviteCodes } = require("@hyperidle/db");
			// We verify indirectly: trying to claim again should return INVITE_CLAIMED
			const result2 = claimInvite(db, invite.code, "Another User");
			expect(result2.ok).toBe(false);
			if (!result2.ok) {
				expect(result2.error).toBe("INVITE_CLAIMED");
			}
		}
	});
});

describe("S1 — claimInvite (error cases)", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedAdminUser(db, "u-admin-1");
	});

	it("returns NOT_FOUND when code does not exist", () => {
		const result = claimInvite(db, "nonexistent-code-12345", "User");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("NOT_FOUND");
		}
	});

	it("returns INVITE_CLAIMED when code was already claimed", () => {
		const invite = createInvite(db, "u-admin-1", "member");
		// First claim
		const first = claimInvite(db, invite.code, "First User");
		expect(first.ok).toBe(true);
		// Second claim attempt
		const second = claimInvite(db, invite.code, "Second User");
		expect(second.ok).toBe(false);
		if (!second.ok) {
			expect(second.error).toBe("INVITE_CLAIMED");
		}
	});

	it("returns INVITE_EXPIRED when code has expired", () => {
		// Create invite with 1ms TTL (effectively already expired)
		const invite = createInvite(db, "u-admin-1", "member", 1);
		// Wait a bit
		const expiry = new Date(invite.expiresAt);
		// Force the invite to be expired by creating it 8 days ago
		const expiredInvite = createInvite(db, "u-admin-1", "member", -(8 * 24 * 60 * 60 * 1000));

		const result = claimInvite(db, expiredInvite.code, "Late User");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("INVITE_EXPIRED");
		}
	});

	it("does not create a user when claim fails", () => {
		const result = claimInvite(db, "bad-code", "Ghost User");
		expect(result.ok).toBe(false);
		// No user was created
		const allUsers = db.select().from(users).all();
		// Only the admin seeded above
		const names = allUsers.map((u) => u.name);
		expect(names).not.toContain("Ghost User");
	});
});
