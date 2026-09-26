/**
 * `users_belonging_ck` (`schema.ts`) enforces belonging as exactly one answer:
 *   CHECK (owner_user_id IS NULL OR (kind = 'ai' AND team_id IS NULL))
 * A row may belong to a team, to a person, or to neither — never both.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { teams, users } from "../schema.js";

const NOW = new Date().toISOString();

describe("users_belonging_ck — a team, a person, or neither, never two", () => {
	test("writing both team_id and owner_user_id on an ai user is rejected", async ({ db }) => {
		await db.insert(teams).values({ id: "ck-team", name: "CK Team", createdAt: NOW });
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
