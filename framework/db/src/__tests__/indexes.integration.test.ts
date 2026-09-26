import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { HyperIdleDb } from "../connection.js";

/**
 * Each test checks whether the expected secondary index exists in pg_indexes. PGlite runs real
 * Postgres semantics so index presence is authoritative.
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

	test("tasks has an index for parent_task_id", async ({ db }) => {
		const indexes = await indexesFor(db, "tasks");
		expect(indexes.some((i) => i.includes("parent_task_id"))).toBe(true);
	});

	test("tasks has an index for team_id", async ({ db }) => {
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
