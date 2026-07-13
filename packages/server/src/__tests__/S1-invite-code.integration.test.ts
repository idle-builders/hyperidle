/**
 * S1 — Unit tests for invite-code service.
 *
 * Tests verify the acceptance criteria for:
 * - Invite code generation (generateInviteCode)
 * - Create invite (createInvite)
 * - Claim invite: happy path, already claimed (INVITE_CLAIMED), expired (INVITE_EXPIRED), not found (NOT_FOUND)
 *
 * @lore S1 PGLite migration: All tests are now async because createTestDb()
 * returns a Promise<TestDbHandle> and all service functions are async.
 */

import { claimInvite, createInvite, generateInviteCode } from "@hyperidle/core-app";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

async function seedAdminUser(db: HyperIdleDb, id = "u-admin-1"): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: "Admin",
			email: "admin@example.com",
			role: "admin",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
}

describe("S1 — generateInviteCode", () => {
	test("returns a non-empty URL-safe string", () => {
		const code = generateInviteCode();
		expect(typeof code).toBe("string");
		expect(code.length).toBeGreaterThan(0);
		// base64url safe characters only
		expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	test("returns codes of consistent length (24 bytes = 32 chars base64url)", () => {
		const code = generateInviteCode();
		// 24 bytes in base64url = 32 chars
		expect(code.length).toBe(32);
	});

	test("returns distinct codes on each call", () => {
		const a = generateInviteCode();
		const b = generateInviteCode();
		expect(a).not.toBe(b);
	});
});

describe("S1 — createInvite", () => {
	test("returns an InviteCode row with correct fields", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "member");
		expect(invite).toHaveProperty("id");
		expect(invite).toHaveProperty("code");
		expect(invite.createdBy).toBe("u-admin-1");
		expect(invite.role).toBe("member");
		expect(invite.claimedBy).toBeNull();
	});

	test("invite has future expiresAt (default 7 days)", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const before = Date.now();
		const invite = await createInvite(db, "u-admin-1", "member");
		const expiresAt = new Date(invite.expiresAt).getTime();
		const sevenDays = 7 * 24 * 60 * 60 * 1000;
		expect(expiresAt).toBeGreaterThan(before + sevenDays - 1000);
		expect(expiresAt).toBeLessThan(before + sevenDays + 1000);
	});

	test("supports admin role", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "admin");
		expect(invite.role).toBe("admin");
	});

	test("custom TTL is respected", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const ttlMs = 60 * 1000; // 1 minute
		const before = Date.now();
		const invite = await createInvite(db, "u-admin-1", "member", ttlMs);
		const expiresAt = new Date(invite.expiresAt).getTime();
		expect(expiresAt).toBeGreaterThan(before + ttlMs - 500);
		expect(expiresAt).toBeLessThan(before + ttlMs + 500);
	});
});

describe("S1 — claimInvite (happy path)", () => {
	test("returns ok:true with user and token", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "member");
		const result = await claimInvite(db, invite.code, "New User");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user).toHaveProperty("id");
			expect(result.user.name).toBe("New User");
			expect(typeof result.token).toBe("string");
			expect(result.token.length).toBeGreaterThan(0);
		}
	});

	test("creates a new user with kind=human", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "member");
		const result = await claimInvite(db, invite.code, "Jane Doe", "jane@example.com");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.kind).toBe("human");
			expect(result.user.email).toBe("jane@example.com");
		}
	});

	test("creates a new user with role matching invite", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "admin");
		const result = await claimInvite(db, invite.code, "Admin User");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.role).toBe("admin");
		}
	});

	test("marks invite as claimed — second claim returns INVITE_CLAIMED", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "member");
		const result = await claimInvite(db, invite.code, "Claimer");
		expect(result.ok).toBe(true);
		// Verify indirectly: second claim attempt returns INVITE_CLAIMED
		const result2 = await claimInvite(db, invite.code, "Another User");
		expect(result2.ok).toBe(false);
		if (!result2.ok) {
			expect(result2.error).toBe("INVITE_CLAIMED");
		}
	});
});

describe("S1 — claimInvite (error cases)", () => {
	test("returns NOT_FOUND when code does not exist", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const result = await claimInvite(db, "nonexistent-code-12345", "User");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("NOT_FOUND");
		}
	});

	test("returns INVITE_CLAIMED when code was already claimed", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const invite = await createInvite(db, "u-admin-1", "member");
		// First claim
		const first = await claimInvite(db, invite.code, "First User");
		expect(first.ok).toBe(true);
		// Second claim attempt
		const second = await claimInvite(db, invite.code, "Second User");
		expect(second.ok).toBe(false);
		if (!second.ok) {
			expect(second.error).toBe("INVITE_CLAIMED");
		}
	});

	test("returns INVITE_EXPIRED when code has expired", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		// Force the invite to be expired by creating it with a negative TTL (in the past)
		const expiredInvite = await createInvite(db, "u-admin-1", "member", -(8 * 24 * 60 * 60 * 1000));

		const result = await claimInvite(db, expiredInvite.code, "Late User");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("INVITE_EXPIRED");
		}
	});

	test("does not create a user when claim fails", async ({ db }) => {
		await seedAdminUser(db, "u-admin-1");
		const result = await claimInvite(db, "bad-code", "Ghost User");
		expect(result.ok).toBe(false);
		// No user was created
		const allUsers = await db.select().from(users);
		// Only the admin seeded above
		const names = allUsers.map((u) => u.name);
		expect(names).not.toContain("Ghost User");
	});
});
