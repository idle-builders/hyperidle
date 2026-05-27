/**
 * P5 — hint_progress table tests (Task 1, AC1)
 *
 * AC coverage:
 * AC1a: Insert a row into hint_progress, select it, assert shape.
 * AC1b: Insert duplicate (userId, hintId), assert unique constraint violation.
 * AC1c: Insert with FK to non-existent user, assert FK violation.
 * AC1d: Delete user, assert cascade deletes hint_progress rows.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { hintProgress, users } from "../schema.js";
import { createTestDb } from "../test-utils.js";

const NOW = new Date().toISOString();

function seedUser(db: HyperIdleDb, id: string): void {
	db.insert(users)
		.values({
			id,
			kind: "human",
			name: "Test User",
			role: "founder",
			status: "active",
			createdAt: NOW,
		})
		.run();
}

describe("P5 AC1: hint_progress table", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	// AC1a: Insert a row, select it, assert shape
	it("inserts a hint_progress row and selects it back with the correct shape", () => {
		seedUser(db, "user-1");

		db.insert(hintProgress)
			.values({
				userId: "user-1",
				hintId: "create-bet",
				seenAt: NOW,
			})
			.run();

		const rows = db.select().from(hintProgress).where(eq(hintProgress.userId, "user-1")).all();

		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row.userId).toBe("user-1");
		expect(row.hintId).toBe("create-bet");
		expect(row.seenAt).toBe(NOW);
	});

	// AC1b: Insert duplicate (userId, hintId) — composite primary key violation
	it("rejects duplicate (userId, hintId) — composite primary key constraint", () => {
		seedUser(db, "user-1");

		db.insert(hintProgress).values({ userId: "user-1", hintId: "create-bet", seenAt: NOW }).run();

		expect(() =>
			db.insert(hintProgress).values({ userId: "user-1", hintId: "create-bet", seenAt: NOW }).run(),
		).toThrow(/constraint/i);
	});

	// AC1c: Same user, different hintId — allowed
	it("allows same user to have multiple different hint dismissals", () => {
		seedUser(db, "user-1");

		db.insert(hintProgress).values({ userId: "user-1", hintId: "create-bet", seenAt: NOW }).run();
		db.insert(hintProgress)
			.values({ userId: "user-1", hintId: "add-credential", seenAt: NOW })
			.run();

		const rows = db.select().from(hintProgress).where(eq(hintProgress.userId, "user-1")).all();
		expect(rows).toHaveLength(2);
	});

	// AC1d: FK to non-existent user — FK violation
	it("rejects insert when userId does not reference an existing user", () => {
		expect(() =>
			db
				.insert(hintProgress)
				.values({ userId: "ghost-user", hintId: "create-bet", seenAt: NOW })
				.run(),
		).toThrow(/constraint/i);
	});

	// AC1d: Delete user cascades to hint_progress rows
	it("cascades deletion of hint_progress rows when the user is deleted", () => {
		seedUser(db, "user-cascade");

		db.insert(hintProgress)
			.values({ userId: "user-cascade", hintId: "create-bet", seenAt: NOW })
			.run();
		db.insert(hintProgress)
			.values({ userId: "user-cascade", hintId: "add-credential", seenAt: NOW })
			.run();

		// Verify rows exist before deletion
		const before = db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, "user-cascade"))
			.all();
		expect(before).toHaveLength(2);

		// Delete the user — should cascade
		db.delete(users).where(eq(users.id, "user-cascade")).run();

		// hint_progress rows should be gone
		const after = db
			.select()
			.from(hintProgress)
			.where(eq(hintProgress.userId, "user-cascade"))
			.all();
		expect(after).toHaveLength(0);
	});

	// Multiple users, same hintId — allowed
	it("allows multiple users to dismiss the same hint independently", () => {
		seedUser(db, "user-a");
		seedUser(db, "user-b");

		db.insert(hintProgress).values({ userId: "user-a", hintId: "create-bet", seenAt: NOW }).run();
		db.insert(hintProgress).values({ userId: "user-b", hintId: "create-bet", seenAt: NOW }).run();

		const rowsA = db.select().from(hintProgress).where(eq(hintProgress.userId, "user-a")).all();
		const rowsB = db.select().from(hintProgress).where(eq(hintProgress.userId, "user-b")).all();

		expect(rowsA).toHaveLength(1);
		expect(rowsB).toHaveLength(1);
	});
});
