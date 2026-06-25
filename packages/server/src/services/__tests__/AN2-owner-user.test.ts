/**
 * AN2 RED — resolveOwnerUserId unit tests (Task 5)
 *
 * Tests FAIL until:
 *   packages/server/src/services/owner-user.ts is created and exports:
 *   `resolveOwnerUserId(db: HyperIdleDb): Promise<string>`
 *
 * The resolver runs: db.select().from(users).where(eq(users.kind, "human")).limit(1)
 * and returns human?.id ?? "u-founder" — exactly the auth.ts:234-235 pattern.
 *
 * Covers:
 *   Task 5 — ownerUserId resolution inside provisionSession
 */

import { users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { resolveOwnerUserId } from "../owner-user.js";

describe("AN2 resolveOwnerUserId", () => {
	test("returns the id of the seeded human user", async ({ db }) => {
		const userId = `u-human-${crypto.randomUUID()}`;
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: userId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		});

		const result = await resolveOwnerUserId(db);
		expect(result).toBe(userId);
	});

	test("returns 'u-founder' fallback when no human user exists", async ({ db }) => {
		// DB is fresh (no human user seeded)
		const result = await resolveOwnerUserId(db);
		expect(result).toBe("u-founder");
	});

	test("returns the FIRST human user when multiple exist", async ({ db }) => {
		const now = new Date().toISOString();
		// Insert two human users — resolveOwnerUserId returns the first (LIMIT 1)
		await db.insert(users).values([
			{
				id: "u-human-first",
				kind: "human",
				name: "First",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "u-human-second",
				kind: "human",
				name: "Second",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);

		const result = await resolveOwnerUserId(db);
		// Must be a string (one of the two) — not null, not undefined, not fallback
		expect(typeof result).toBe("string");
		expect(["u-human-first", "u-human-second"]).toContain(result);
	});

	test("ai-kind users are not returned (only kind='human')", async ({ db }) => {
		const now = new Date().toISOString();
		// Only an AI user — no human
		await db.insert(users).values({
			id: "u-ai-only",
			kind: "ai",
			name: "Bot",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		// No human → fallback
		const result = await resolveOwnerUserId(db);
		expect(result).toBe("u-founder");
	});
});
