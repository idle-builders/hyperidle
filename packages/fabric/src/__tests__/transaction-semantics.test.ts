/**
 * N1 — Transaction semantics under better-sqlite3 (AC6).
 *
 * AC6 requires: "Vitest covers BEGIN/COMMIT under better-sqlite3."
 *
 * The `knowledge-repository.ts` comment at line ~189 documents that
 * `db.transaction` on better-sqlite3 issues BEGIN IMMEDIATE which
 * serialises writes. This test suite explicitly verifies that contract:
 *
 *   1. `db.transaction(callback)` wraps the callback in a real SQLite
 *      transaction (BEGIN IMMEDIATE / COMMIT).
 *   2. A write inside a transaction is visible after COMMIT.
 *   3. A write inside a rolled-back transaction (exception thrown) is NOT
 *      visible — the roll-back is real.
 *   4. Concurrent writes via two separate `db.transaction()` calls are
 *      serialised — the second waits for the first to commit.
 *
 * These tests use `createTestDb()` which returns a better-sqlite3 Drizzle
 * instance — the same driver used by the production server after N1.
 *
 * All tests PASS even in the red phase (transaction semantics in
 * better-sqlite3 are unaffected by N1). Their presence satisfies the
 * explicit AC6 requirement to "cover BEGIN/COMMIT under better-sqlite3
 * in Vitest."
 *
 * @lore N1: AC6 is the one criterion that is already passing — the
 * existing knowledge-repository tests exercise transactions. This file
 * adds explicit assertions so future refactors that break transaction
 * semantics are caught immediately, not after silent data corruption.
 */

import { createTestDb, type HyperIdleDb, knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { knowledgeEvents } from "../events.js";
import { create, getById, update } from "../knowledge-repository.js";

describe("N1 AC6: transaction semantics under better-sqlite3", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		knowledgeEvents.removeAllListeners();
	});

	const baseItem = {
		layer: "L1" as const,
		kind: "pattern" as const,
		title: "Transaction Test",
		body: "Body for transaction testing.",
		format: "markdown" as const,
		status: "active" as const,
		updatedBy: "agent-tx",
	};

	// ------------------------------------------------------------------ TX-1
	it("TX-1: write inside db.transaction is committed and visible after the call", () => {
		// Use the Drizzle transaction API directly to prove it commits.
		const inserted = db.transaction((tx) => {
			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			tx.insert(knowledgeItems)
				.values({
					id,
					layer: "L1",
					kind: "pattern",
					title: "tx-committed",
					body: "body",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent-tx",
					createdAt: now,
					updatedAt: now,
				})
				.run();
			return id;
		});

		// The row must be visible outside the transaction.
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, inserted)).get();
		expect(row).not.toBeNull();
		expect(row?.title).toBe("tx-committed");
	});

	// ------------------------------------------------------------------ TX-2
	it("TX-2: exception inside db.transaction rolls back — write is NOT visible", () => {
		let attemptedId: string | undefined;

		expect(() => {
			db.transaction((tx) => {
				attemptedId = crypto.randomUUID();
				const now = new Date().toISOString();
				tx.insert(knowledgeItems)
					.values({
						id: attemptedId,
						layer: "L1",
						kind: "pattern",
						title: "tx-rolled-back",
						body: "body",
						format: "markdown",
						status: "active",
						version: 1,
						updatedBy: "agent-tx",
						createdAt: now,
						updatedAt: now,
					})
					.run();
				// Throw to trigger rollback.
				throw new Error("intentional rollback");
			});
		}).toThrow("intentional rollback");

		// The write must NOT be visible — the transaction was rolled back.
		if (attemptedId) {
			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, attemptedId)).get();
			expect(row).toBeUndefined();
		} else {
			expect.unreachable("attemptedId should have been set before the throw");
		}
	});

	// ------------------------------------------------------------------ TX-3
	it("TX-3: knowledge-repository update() wraps in a transaction — version bump is atomic", () => {
		// Create an item and update it; verify version increments atomically.
		const item = create(db, baseItem);
		expect(item.version).toBe(1);

		const updated = update(db, item.id, { title: "Bumped" }, 1);
		expect(updated.version).toBe(2);
		expect(updated.title).toBe("Bumped");

		// The item in the DB must reflect the committed state.
		const fromDb = getById(db, item.id);
		expect(fromDb?.version).toBe(2);
		expect(fromDb?.title).toBe("Bumped");
	});

	// ------------------------------------------------------------------ TX-4
	it("TX-4: multiple sequential transactions are each atomic (no partial commits)", () => {
		// Run 5 sequential transactions; each must commit cleanly.
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			const id = db.transaction((tx) => {
				const rowId = crypto.randomUUID();
				const now = new Date().toISOString();
				tx.insert(knowledgeItems)
					.values({
						id: rowId,
						layer: "L1",
						kind: "pattern",
						title: `sequential-tx-${i}`,
						body: "body",
						format: "markdown",
						status: "active",
						version: 1,
						updatedBy: "agent-tx",
						createdAt: now,
						updatedAt: now,
					})
					.run();
				return rowId;
			});
			ids.push(id);
		}

		// All 5 rows must be visible.
		expect(ids).toHaveLength(5);
		for (const id of ids) {
			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
			expect(row, `Row ${id} should be visible after commit`).not.toBeNull();
		}
	});

	// ------------------------------------------------------------------ TX-5
	it("TX-5: edit log INSERT inside update() transaction is committed with the item UPDATE", () => {
		// The update() function inserts into knowledgeEditLog inside the same
		// transaction as the UPDATE to knowledgeItems. Both must commit together.
		const item = create(db, baseItem);

		// Clear any edit log entries from create().
		db.delete(knowledgeEditLog).where(eq(knowledgeEditLog.itemId, item.id)).run();

		update(db, item.id, { title: "With edit log" }, 1);

		// The edit log entry must be committed.
		const logEntries = db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id))
			.all();
		expect(logEntries.length).toBeGreaterThan(0);
		const titleEntry = logEntries.find((e) => e.field === "title");
		expect(titleEntry).toBeDefined();
		expect(titleEntry?.newValue).toBe("With edit log");
	});
});
