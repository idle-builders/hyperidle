/**
 * P5 — hint_progress table tests (Task 1, AC1)
 *
 * AC coverage:
 * AC1a: Insert a row into hint_progress, select it, assert shape.
 * AC1b: Insert duplicate (userId, hintId), assert unique constraint violation.
 * AC1c: Insert with FK to non-existent user, assert FK violation.
 * AC1d: Delete user, assert cascade deletes hint_progress rows.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { hintProgress, users } from "../schema.js";

const NOW = new Date().toISOString();

async function seedUser(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: "Test User",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

describe("P5 AC1: hint_progress table", () => {
	// AC1a: Insert a row, select it, assert shape
	test("inserts a hint_progress row and selects it back with the correct shape", async ({
		db,
		ids,
	}) => {
		await seedUser(db, ids("user-1"));

		await db.insert(hintProgress).values({
			userId: ids("user-1"),
			hintId: ids("create-bet"),
			seenAt: NOW,
		});

		const rows = await db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, ids("user-1")));

		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row?.userId).toBe(ids("user-1"));
		expect(row?.hintId).toBe(ids("create-bet"));
		expect(row?.seenAt).toBe(NOW);
	});

	// AC1b: Insert duplicate (userId, hintId) — composite primary key violation
	test("rejects duplicate (userId, hintId) — composite primary key constraint", async ({
		db,
		ids,
	}) => {
		await seedUser(db, ids("user-1"));

		await db
			.insert(hintProgress)
			.values({ userId: ids("user-1"), hintId: ids("create-bet"), seenAt: NOW });

		await expect(
			db
				.insert(hintProgress)
				.values({ userId: ids("user-1"), hintId: ids("create-bet"), seenAt: NOW }),
		).rejects.toThrow();
	});

	// AC1c: Same user, different hintId — allowed
	test("allows same user to have multiple different hint dismissals", async ({ db, ids }) => {
		await seedUser(db, ids("user-1"));

		await db
			.insert(hintProgress)
			.values({ userId: ids("user-1"), hintId: ids("create-bet"), seenAt: NOW });
		await db
			.insert(hintProgress)
			.values({ userId: ids("user-1"), hintId: ids("add-credential"), seenAt: NOW });

		const rows = await db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, ids("user-1")));
		expect(rows).toHaveLength(2);
	});

	// AC1d: FK to non-existent user — FK violation
	test("rejects insert when userId does not reference an existing user", async ({ db, ids }) => {
		await expect(
			db
				.insert(hintProgress)
				.values({ userId: ids("ghost-user"), hintId: ids("create-bet"), seenAt: NOW }),
		).rejects.toThrow();
	});

	// AC1d: Delete user cascades to hint_progress rows
	test("cascades deletion of hint_progress rows when the user is deleted", async ({
		db,
		ids,
	}) => {
		await seedUser(db, ids("user-cascade"));

		await db
			.insert(hintProgress)
			.values({ userId: ids("user-cascade"), hintId: ids("create-bet"), seenAt: NOW });
		await db
			.insert(hintProgress)
			.values({ userId: ids("user-cascade"), hintId: ids("add-credential"), seenAt: NOW });

		// Verify rows exist before deletion
		const before = await db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, ids("user-cascade")));
		expect(before).toHaveLength(2);

		// Delete the user — should cascade
		await db.delete(users).where(eq(users.id, ids("user-cascade")));

		// hint_progress rows should be gone
		const after = await db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, ids("user-cascade")));
		expect(after).toHaveLength(0);
	});

	// Multiple users, same hintId — allowed
	test("allows multiple users to dismiss the same hint independently", async ({ db, ids }) => {
		await seedUser(db, ids("user-a"));
		await seedUser(db, ids("user-b"));

		await db
			.insert(hintProgress)
			.values({ userId: ids("user-a"), hintId: ids("create-bet"), seenAt: NOW });
		await db
			.insert(hintProgress)
			.values({ userId: ids("user-b"), hintId: ids("create-bet"), seenAt: NOW });

		const rowsA = await db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, ids("user-a")));
		const rowsB = await db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, ids("user-b")));

		expect(rowsA).toHaveLength(1);
		expect(rowsB).toHaveLength(1);
	});
});
