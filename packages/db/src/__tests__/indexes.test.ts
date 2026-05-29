import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { createTestDb, type TestDbHandle } from "../test-utils.js";

/**
 * I3 — secondary index acceptance tests.
 *
 * Each test checks whether the expected index exists in pg_indexes.
 * PGlite runs real Postgres semantics so index presence is authoritative.
 */

describe("I3: secondary index coverage", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	}, 30_000);

	afterEach(async () => {
		await handle.close();
	});

	async function indexesFor(table: string): Promise<string[]> {
		const result = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = '${table}' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		return (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
	}

	it("tasks has an index for bet_id", async () => {
		const indexes = await indexesFor("tasks");
		expect(indexes.some((i) => i.includes("bet_id"))).toBe(true);
	});

	it("tasks has an index for team_id", async () => {
		const indexes = await indexesFor("tasks");
		expect(indexes.some((i) => i.includes("team_id"))).toBe(true);
	});

	it("tasks has an index for product_id", async () => {
		const indexes = await indexesFor("tasks");
		expect(indexes.some((i) => i.includes("product_id"))).toBe(true);
	});

	it("sessions has an index for task_id", async () => {
		const indexes = await indexesFor("sessions");
		expect(indexes.some((i) => i.includes("task_id"))).toBe(true);
	});

	it("sessions has an index for agent_id", async () => {
		const indexes = await indexesFor("sessions");
		expect(indexes.some((i) => i.includes("agent_id"))).toBe(true);
	});

	it("sessions has an index for state", async () => {
		const indexes = await indexesFor("sessions");
		expect(indexes.some((i) => i.includes("state"))).toBe(true);
	});

	it("items has an index for thread_id", async () => {
		const indexes = await indexesFor("items");
		expect(indexes.some((i) => i.includes("thread_id"))).toBe(true);
	});

	it("messages has an index for thread_id", async () => {
		const indexes = await indexesFor("messages");
		expect(indexes.some((i) => i.includes("thread_id"))).toBe(true);
	});

	it("bets has an index for product_id", async () => {
		const indexes = await indexesFor("bets");
		expect(indexes.some((i) => i.includes("product_id"))).toBe(true);
	});

	it("bets has an index for status", async () => {
		const indexes = await indexesFor("bets");
		expect(indexes.some((i) => i.includes("status"))).toBe(true);
	});
});
