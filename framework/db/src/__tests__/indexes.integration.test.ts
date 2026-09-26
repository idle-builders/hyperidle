import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { HyperIdleDb } from "../connection.js";

/**
 * I3 — secondary index acceptance tests.
 *
 * Each test checks whether the expected index exists in pg_indexes.
 * PGlite runs real Postgres semantics so index presence is authoritative.
 */

describe("secondary index coverage", () => {
	async function indexesFor(db: HyperIdleDb, table: string): Promise<string[]> {
		const result = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = '${table}' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		return (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
	}

	// @lore BB1: bet_id index dropped with the bets table. tasks now has a
	// parent_task_id index for subtree traversal.
	test("tasks has an index for parent_task_id", async ({ db }) => {
		const indexes = await indexesFor(db, "tasks");
		expect(indexes.some((i) => i.includes("parent_task_id"))).toBe(true);
	});

	// @lore U1: tasks.product_id dropped; tasks.team_id now references `teams` (formerly `products`).
	// The tasks_team_id_idx covers queries by both team_id and the former product_id lookup path.
	test("tasks has an index for team_id (covers both team_id and former product_id)", async ({
		db,
	}) => {
		const indexes = await indexesFor(db, "tasks");
		expect(indexes.some((i) => i.includes("team_id"))).toBe(true);
	});

	test("sessions has an index for task_id", async ({ db }) => {
		const indexes = await indexesFor(db, "sessions");
		expect(indexes.some((i) => i.includes("task_id"))).toBe(true);
	});

	test("sessions has an index for agent_id", async ({ db }) => {
		const indexes = await indexesFor(db, "sessions");
		expect(indexes.some((i) => i.includes("agent_id"))).toBe(true);
	});

	test("sessions has an index for state", async ({ db }) => {
		const indexes = await indexesFor(db, "sessions");
		expect(indexes.some((i) => i.includes("state"))).toBe(true);
	});

	// @lore BC3 migration 0085 step 6: `items` dropped, destructive, no
	// compat column. Its thread_id index went with the table.

	test("messages has an index for thread_id", async ({ db }) => {
		const indexes = await indexesFor(db, "messages");
		expect(indexes.some((i) => i.includes("thread_id"))).toBe(true);
	});

	// @lore knowledge-attachment-slot: the composite (parent_kind, parent_id)
	// index serves both "everything under this parent" (leading column alone)
	// and "the item parented to X" (the pair), and still serves
	// `parent_kind IS NULL` — the nested-document tree's roots query.
	test("documents has an index for parent_kind, parent_id", async ({ db }) => {
		const indexes = await indexesFor(db, "documents");
		expect(indexes.some((i) => i.includes("parent_idx"))).toBe(true);
	});
});
