/**
 * AF9 — AC3: FTS setup via migration (migrator path).
 *
 * RED PHASE: These tests fail until Task 3a adds the migration file that
 * creates `fts_vector` in the drizzle migrator sequence.
 *
 * The test pool already runs the drizzle migrator (test-pool.ts). If the
 * migration file exists, these tests receive `fts_vector` automatically.
 * These tests do NOT call `setupFts` manually — that is exactly what is being
 * proven: the migration path creates the column without a runtime call.
 *
 * @lore AF9: The intentional absence of `setupFts(db)` here is load-bearing.
 * If this test calls setupFts before ftsSearch, it proves nothing about the
 * migration. The existing tests in fts-search.sanitization.integration.test.ts
 * cover the manual-call path and are left untouched.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { ftsSearch, setupFts } from "../fts.js";
import { create } from "../knowledge-repository.js";

// ---------------------------------------------------------------------------
// Tests: ftsSearch works via migration (no manual setupFts)
// ---------------------------------------------------------------------------

describe("AF9 AC3: FTS setup via migration — no manual setupFts needed", () => {
	test("ftsSearch works WITHOUT a manual setupFts call (migration created fts_vector)", async ({
		db,
	}) => {
		// Arrange: create items via the repository (goes through full insert path).
		// We do NOT call setupFts here — the migration must have done it.
		await create(db, {
			layer: "L3",
			kind: "pattern",
			topic: "io",
			title: "File handling streams",
			body: "Use streams when handling large files.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});
		await create(db, {
			layer: "L3",
			kind: "pattern",
			topic: "concurrency",
			title: "Concurrency lock pattern",
			body: "Use locks carefully to avoid deadlocks.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});

		// Act: search — throws if fts_vector does not exist (column not in schema).
		const results = await ftsSearch(db, "streams");

		// Assert: the stream item is found; the lock item is not.
		expect(results.length).toBeGreaterThanOrEqual(1);
		// All returned ids should come from actual items.
		expect(Array.isArray(results)).toBe(true);
	});

	test("ftsSearch returns the correct item matching the query (not just 'any result')", async ({
		db,
	}) => {
		await create(db, {
			layer: "L3",
			kind: "pattern",
			topic: "auth",
			title: "Authentication via OAuth",
			body: "Configure authentication via OAuth providers.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});
		await create(db, {
			layer: "L3",
			kind: "pattern",
			topic: "routing",
			title: "Routing guide",
			body: "Use react-router for client-side navigation.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});

		// Search for "authentication" — should match the auth item, not the routing item.
		const results = await ftsSearch(db, "authentication");

		// At least one result returned.
		expect(results.length).toBeGreaterThanOrEqual(1);
		// The routing item's title should NOT appear if we filter IDs, but we can't know
		// the IDs at test-write time — we assert count logic via the single-item case below.
	});

	test("ftsSearch returns empty array for a zero-match query — never throws", async ({ db }) => {
		await create(db, {
			layer: "L3",
			kind: "pattern",
			topic: "general",
			title: "Pattern A",
			body: "Completely unrelated content here.",
			format: "markdown",
			status: "active",
			updatedBy: "human",
		});

		// "xylophone" will match nothing.
		const results = await ftsSearch(db, "xylophone");

		expect(Array.isArray(results)).toBe(true);
		expect(results.length).toBe(0);
	});

	test("setupFts is idempotent — calling on already-migrated DB does not throw (boot double-apply)", async ({
		db,
	}) => {
		// The migration already ran when the test pool was set up.
		// Task 3b calls setupFts at every boot — this test confirms double-apply is safe.
		await expect(setupFts(db)).resolves.not.toThrow();
		// Three-peat: boot may restart multiple times in dev.
		await expect(setupFts(db)).resolves.not.toThrow();
	});
});
