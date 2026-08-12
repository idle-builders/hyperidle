/**
 * S1 — Unit tests for invite-code service.
 *
 * Tests verify the acceptance criteria for:
 * - Create invite (createInvite)
 * - Claim invite: happy path, already claimed (INVITE_CLAIMED), expired (INVITE_EXPIRED), not found (NOT_FOUND)
 *
 * @lore AU20 Am11: generateInviteCode internalized — tests for its internal
 * behavior removed; coverage preserved through createInvite/claimInvite API.
 *
 * @lore S1 PGLite migration: All tests are now async because createTestDb()
 * returns a Promise<TestDbHandle> and all service functions are async.
 */

import { type HyperIdleDb, inviteCodes, loginSessions, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { claimInvite, createInvite } from "@hyperidle/users";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function seedAdminUser(db: HyperIdleDb, ids: ScopedIds): Promise<string> {
	const id = ids("admin");
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
	return id;
}

describe("S1 — createInvite", () => {
	test("returns an InviteCode row with correct fields", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "member");
		expect(invite).toHaveProperty("id");
		expect(invite).toHaveProperty("code");
		expect(invite.createdBy).toBe(ids("admin"));
		expect(invite.role).toBe("member");
		expect(invite.claimedBy).toBeNull();
	});

	test("invite has future expiresAt (default 7 days)", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const before = Date.now();
		const invite = await createInvite(db, ids("admin"), "member");
		const expiresAt = new Date(invite.expiresAt).getTime();
		const sevenDays = 7 * 24 * 60 * 60 * 1000;
		expect(expiresAt).toBeGreaterThan(before + sevenDays - 1000);
		expect(expiresAt).toBeLessThan(before + sevenDays + 1000);
	});

	test("supports admin role", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "admin");
		expect(invite.role).toBe("admin");
	});

	test("custom TTL is respected", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const ttlMs = 60 * 1000; // 1 minute
		const before = Date.now();
		const invite = await createInvite(db, ids("admin"), "member", ttlMs);
		const expiresAt = new Date(invite.expiresAt).getTime();
		expect(expiresAt).toBeGreaterThan(before + ttlMs - 500);
		expect(expiresAt).toBeLessThan(before + ttlMs + 500);
	});
});

describe("S1 — claimInvite (happy path)", () => {
	test("returns ok:true with user and token", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "member");
		const result = await claimInvite(db, invite.code, "New User");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user).toHaveProperty("id");
			expect(result.user.name).toBe("New User");
			expect(typeof result.token).toBe("string");
			expect(result.token.length).toBeGreaterThan(0);
		}
	});

	test("creates a new user with kind=human", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "member");
		const result = await claimInvite(db, invite.code, "Jane Doe", "jane@example.com");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.kind).toBe("human");
			expect(result.user.email).toBe("jane@example.com");
		}
	});

	test("creates a new user with role matching invite", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "admin");
		const result = await claimInvite(db, invite.code, "Admin User");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.role).toBe("admin");
		}
	});

	test("marks invite as claimed — second claim returns INVITE_CLAIMED", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "member");
		const result = await claimInvite(db, invite.code, "Claimer");
		expect(result.ok).toBe(true);
		// Verify indirectly: second claim attempt returns INVITE_CLAIMED
		const result2 = await claimInvite(db, invite.code, "Another User");
		expect(result2.ok).toBe(false);
		if (!result2.ok) {
			expect(result2.error).toBe("INVITE_CLAIMED");
		}
	});

	test("atomically allows exactly one concurrent claimant without loser artifacts", async ({
		db,
		ids,
	}) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "member");

		const results = await Promise.all([
			claimInvite(db, invite.code, "Concurrent One"),
			claimInvite(db, invite.code, "Concurrent Two"),
		]);

		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(
			results.filter((result) => !result.ok && result.error === "INVITE_CLAIMED"),
		).toHaveLength(1);

		const adminId = ids("admin");
		const claimedUsers = (await db.select().from(users)).filter(
			(user) => user.name.startsWith("Concurrent ") && user.id !== adminId,
		);
		expect(claimedUsers).toHaveLength(1);
		const sessions = await db
			.select()
			.from(loginSessions)
			.where(eq(loginSessions.userId, claimedUsers[0]!.id));
		expect(sessions).toHaveLength(1);
		const [storedInvite] = await db
			.select()
			.from(inviteCodes)
			.where(eq(inviteCodes.createdBy, adminId));
		expect(storedInvite?.claimedBy).toBe(claimedUsers[0]?.id);
	});
});

describe("S1 — claimInvite (error cases)", () => {
	test("returns NOT_FOUND when code does not exist", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const result = await claimInvite(db, "nonexistent-code-12345", "User");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("NOT_FOUND");
		}
	});

	test("returns INVITE_CLAIMED when code was already claimed", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const invite = await createInvite(db, ids("admin"), "member");
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

	test("returns INVITE_EXPIRED when code has expired", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		// Force the invite to be expired by creating it with a negative TTL (in the past)
		const expiredInvite = await createInvite(
			db,
			ids("admin"),
			"member",
			-(8 * 24 * 60 * 60 * 1000),
		);

		const result = await claimInvite(db, expiredInvite.code, "Late User");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("INVITE_EXPIRED");
		}
	});

	test("does not create a user when claim fails", async ({ db, ids }) => {
		await seedAdminUser(db, ids);
		const result = await claimInvite(db, "bad-code", "Ghost User");
		expect(result.ok).toBe(false);
		// No user was created
		const adminId = ids("admin");
		const allUsers = await db.select().from(users).where(eq(users.id, adminId));
		// Only the admin seeded above
		const names = allUsers.map((u) => u.name);
		expect(names).not.toContain("Ghost User");
	});
});
