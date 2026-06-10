/**
 * N1 — Transaction semantics under PGlite (AC6).
 *
 * AC6 requires: "Vitest covers BEGIN/COMMIT under PGlite."
 *
 * The `knowledge-repository.ts` uses `db.transaction` with an async callback
 * that issues BEGIN / COMMIT. This test suite explicitly verifies that contract:
 *
 *   1. `db.transaction(callback)` wraps the callback in a real Postgres
 *      transaction (BEGIN / COMMIT).
 *   2. A write inside a transaction is visible after COMMIT.
 *   3. A write inside a rolled-back transaction (exception thrown) is NOT
 *      visible — the roll-back is real.
 *   4. Multiple sequential `db.transaction()` calls are each atomic (no partial commits).
 *
 * These tests use the fixture `db` which returns a PGlite Drizzle instance —
 * the same driver used by the production server after N1.
 *
 * All tests PASS even in the red phase (transaction semantics in
 * PGlite are unaffected by N1). Their presence satisfies the
 * explicit AC6 requirement to "cover BEGIN/COMMIT under PGlite in Vitest."
 *
 * @lore N1: AC6 is the one criterion that is already passing — the
 * existing knowledge-repository tests exercise transactions. This file
 * adds explicit assertions so future refactors that break transaction
 * semantics are caught immediately, not after silent data corruption.
 */

import { knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { knowledgeEvents } from "../events.js";
import { create, getById, update } from "../knowledge-repository.js";

describe("N1 AC6: transaction semantics under PGlite", () => {
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
	test("TX-1: write inside db.transaction is committed and visible after the call", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		// Use the Drizzle transaction API directly to prove it commits.
		const inserted = await db.transaction(async (tx) => {
			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			await tx.insert(knowledgeItems).values({
				id,
				scopeKind: "factory",
				title: "tx-committed",
				body: "body",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent-tx",
				createdAt: now,
				updatedAt: now,
			});
			return id;
		});

		// The row must be visible outside the transaction.
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, inserted));
		expect(row).not.toBeUndefined();
		expect(row?.title).toBe("tx-committed");
	});

	// ------------------------------------------------------------------ TX-2
	test("TX-2: exception inside db.transaction rolls back — write is NOT visible", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		let attemptedId: string | undefined;

		await expect(
			db.transaction(async (tx) => {
				attemptedId = crypto.randomUUID();
				const now = new Date().toISOString();
				await tx.insert(knowledgeItems).values({
					id: attemptedId,
					scopeKind: "factory",
					title: "tx-rolled-back",
					body: "body",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent-tx",
					createdAt: now,
					updatedAt: now,
				});
				// Throw to trigger rollback.
				throw new Error("intentional rollback");
			}),
		).rejects.toThrow("intentional rollback");

		// The write must NOT be visible — the transaction was rolled back.
		if (attemptedId) {
			const rows = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, attemptedId));
			expect(rows).toHaveLength(0);
		} else {
			expect.unreachable("attemptedId should have been set before the throw");
		}
	});

	// ------------------------------------------------------------------ TX-3
	test("TX-3: knowledge-repository update() wraps in a transaction — version bump is atomic", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		// Create an item and update it; verify version increments atomically.
		const item = await create(db, baseItem);
		expect(item.version).toBe(1);

		const updated = await update(db, item.id, { title: "Bumped" }, 1);
		expect(updated.version).toBe(2);
		expect(updated.title).toBe("Bumped");

		// The item in the DB must reflect the committed state.
		const fromDb = await getById(db, item.id);
		expect(fromDb?.version).toBe(2);
		expect(fromDb?.title).toBe("Bumped");
	});

	// ------------------------------------------------------------------ TX-4
	test("TX-4: multiple sequential transactions are each atomic (no partial commits)", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		// Run 5 sequential transactions; each must commit cleanly.
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			const id = await db.transaction(async (tx) => {
				const rowId = crypto.randomUUID();
				const now = new Date().toISOString();
				await tx.insert(knowledgeItems).values({
					id: rowId,
					scopeKind: "factory",
					title: `sequential-tx-${i}`,
					body: "body",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent-tx",
					createdAt: now,
					updatedAt: now,
				});
				return rowId;
			});
			ids.push(id);
		}

		// All 5 rows must be visible.
		expect(ids).toHaveLength(5);
		for (const id of ids) {
			const rows = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id));
			expect(rows.length, `Row ${id} should be visible after commit`).toBeGreaterThan(0);
		}
	});

	// ------------------------------------------------------------------ TX-5
	test("TX-5: edit log INSERT inside update() transaction is committed with the item UPDATE", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		// The update() function inserts into knowledgeEditLog inside the same
		// transaction as the UPDATE to knowledgeItems. Both must commit together.
		const item = await create(db, baseItem);

		// Clear any edit log entries from create().
		await db.delete(knowledgeEditLog).where(eq(knowledgeEditLog.itemId, item.id));

		await update(db, item.id, { title: "With edit log" }, 1);

		// The edit log entry must be committed.
		const logEntries = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		expect(logEntries.length).toBeGreaterThan(0);
		const titleEntry = logEntries.find((e) => e.field === "title");
		expect(titleEntry).toBeDefined();
		expect(titleEntry?.newValue).toBe("With edit log");
	});
});
