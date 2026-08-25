/**
 * BA1 D6 / architecture §9 — "Belonging is exactly one answer. The DB CHECK
 * is the enforcement; one integration assertion that writing both `team_id`
 * and `owner_user_id` is rejected proves the constraint is live rather than
 * declared." §2/D6 also requires the founder-required third case — belonging
 * to neither a team nor a person — to be accepted, not just the two
 * exclusive cases.
 *
 * `users_belonging_ck` (`schema.ts`):
 *   CHECK (owner_user_id IS NULL OR (kind = 'ai' AND team_id IS NULL))
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { teams, users } from "../schema.js";

const NOW = new Date().toISOString();

describe("users_belonging_ck — a team, a person, or neither, never two", () => {
	test("writing both team_id and owner_user_id on an ai user is rejected", async ({ db }) => {
		await db
			.insert(teams)
			.values({ id: "ck-team", name: "CK Team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "ck-owner",
			kind: "human",
			name: "Owner",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		await expect(
			db.insert(users).values({
				id: "ck-both",
				kind: "ai",
				name: "Both",
				role: "assistant",
				status: "active",
				teamId: "ck-team",
				ownerUserId: "ck-owner",
				createdAt: NOW,
			}),
		).rejects.toThrow();
	});

	test("belonging to neither a team nor a person is accepted", async ({ db }) => {
		await db.insert(users).values({
			id: "ck-neither",
			kind: "ai",
			name: "Neither",
			role: "assistant",
			status: "active",
			teamId: null,
			ownerUserId: null,
			createdAt: NOW,
		});

		const [row] = await db.select().from(users).where(eq(users.id, "ck-neither")).limit(1);
		expect(row?.teamId).toBeNull();
		expect(row?.ownerUserId).toBeNull();
	});
});
