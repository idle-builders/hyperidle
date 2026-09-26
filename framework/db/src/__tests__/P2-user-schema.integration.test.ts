/**
 * `role` is plain text, not constrained to `USER_ROLES` — "founder" is a valid human role even
 * though it is not a member of that union.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { type NewUser, users } from "../schema.js";

const NOW = new Date().toISOString();

describe("users table", () => {
	test("inserts an AI user with kind defaulting to ai", async ({ db }) => {
		const aiUser: NewUser = {
			id: "u-test-ai",
			name: "Builder Bot",
			role: "builder",
			status: "active",
			createdAt: NOW,
		};

		await db.insert(users).values(aiUser);

		const rows = await db.select().from(users).where(eq(users.id, "u-test-ai"));
		expect(rows[0]).toMatchObject({ kind: "ai" });
	});

	test("inserts a human user with a role outside USER_ROLES", async ({ db }) => {
		const humanUser: NewUser = {
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		};

		await db.insert(users).values(humanUser);

		const rows = await db.select().from(users).where(eq(users.id, "u-founder"));
		expect(rows[0]).toMatchObject({ kind: "human", role: "founder" });
	});

	test("avatarUrl accepts null", async ({ db }) => {
		const aiUser: NewUser = {
			id: "u-ai-no-avatar",
			kind: "ai",
			name: "No Avatar Bot",
			role: "builder",
			status: "active",
			avatarUrl: null,
			createdAt: NOW,
		};

		await db.insert(users).values(aiUser);

		const rows = await db.select().from(users).where(eq(users.id, "u-ai-no-avatar"));
		expect(rows[0]).toMatchObject({ avatarUrl: null });
	});

	test("avatarUrl accepts a populated URL", async ({ db }) => {
		const humanUser: NewUser = {
			id: "u-human-with-profile",
			kind: "human",
			name: "Test Human",
			role: "founder",
			status: "active",
			avatarUrl: "https://cdn.example.com/avatar.png",
			createdAt: NOW,
		};

		await db.insert(users).values(humanUser);

		const rows = await db.select().from(users).where(eq(users.id, "u-human-with-profile"));
		expect(rows[0]).toMatchObject({
			avatarUrl: "https://cdn.example.com/avatar.png",
		});
	});
});
