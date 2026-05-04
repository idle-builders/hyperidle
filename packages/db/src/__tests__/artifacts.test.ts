// L3 RED — Drizzle schema tests for the `artifacts` table.
// Source of truth: plans/architecture/L3.md §4.1, §12.

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { artifacts, bets, products, tasks, teams } from "../schema.js";
import { createTestDb } from "../test-utils.js";

const NOW = "2026-04-28T00:00:00.000Z";

function seedTask(db: HyperIdleDb): { taskId: string; betId: string; productId: string } {
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: NOW }).run();
	db.insert(teams)
		.values({ id: "tm1", productId: "p1", capacity: 1, activeBets: 0, formedAt: NOW })
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "tm1",
			pitch: "x",
			appetite: "1w",
			status: "shaped",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task1",
			betId: "b1",
			productId: "p1",
			teamId: "tm1",
			title: "T",
			state: "pending",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
	return { taskId: "task1", betId: "b1", productId: "p1" };
}

describe("L3 artifacts schema", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("creates the artifacts table", () => {
		const tableNames = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`,
			)
			.map((r) => r.name);
		expect(tableNames).toContain("artifacts");
	});

	it("supports insert + select round-trip", () => {
		const { taskId } = seedTask(db);
		db.insert(artifacts)
			.values({
				id: "art1",
				producingTaskId: taskId,
				kind: "code_diff",
				previewJson: null,
				costMoneyMicros: null,
				costTokensInput: null,
				costTokensOutput: null,
				costSettledAt: null,
				createdAt: NOW,
			})
			.run();

		const rows = db.select().from(artifacts).where(eq(artifacts.id, "art1")).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.kind).toBe("code_diff");
		expect(rows[0]?.producingTaskId).toBe(taskId);
	});

	// AC-2 / protected: insert with non-existent producing_task_id must fail (FK restrict)
	it("rejects inserts with a non-existent producing_task_id (FK restrict)", () => {
		expect(() =>
			db
				.insert(artifacts)
				.values({
					id: "art2",
					producingTaskId: "nonexistent",
					kind: "deck",
					previewJson: null,
					costMoneyMicros: null,
					costTokensInput: null,
					costTokensOutput: null,
					costSettledAt: null,
					createdAt: NOW,
				})
				.run(),
		).toThrow();
	});

	it("rejects deletion of a task that owns artifacts (ON DELETE RESTRICT)", () => {
		const { taskId } = seedTask(db);
		db.insert(artifacts)
			.values({
				id: "art3",
				producingTaskId: taskId,
				kind: "deck",
				previewJson: null,
				costMoneyMicros: null,
				costTokensInput: null,
				costTokensOutput: null,
				costSettledAt: null,
				createdAt: NOW,
			})
			.run();
		expect(() => db.delete(tasks).where(eq(tasks.id, taskId)).run()).toThrow();
	});

	it("enforces unique id constraint (PK)", () => {
		const { taskId } = seedTask(db);
		db.insert(artifacts)
			.values({
				id: "art4",
				producingTaskId: taskId,
				kind: "deck",
				previewJson: null,
				costMoneyMicros: null,
				costTokensInput: null,
				costTokensOutput: null,
				costSettledAt: null,
				createdAt: NOW,
			})
			.run();
		expect(() =>
			db
				.insert(artifacts)
				.values({
					id: "art4",
					producingTaskId: taskId,
					kind: "deck",
					previewJson: null,
					costMoneyMicros: null,
					costTokensInput: null,
					costTokensOutput: null,
					costSettledAt: null,
					createdAt: NOW,
				})
				.run(),
		).toThrow();
	});

	it("has a producing_task_id index for fetch by task", () => {
		const indexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='artifacts'`,
			)
			.map((r) => r.name);
		expect(indexes).toContain("artifacts_producing_task_id_idx");
	});

	it("has a created_at index for pagination cursor", () => {
		const indexes = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='artifacts'`,
			)
			.map((r) => r.name);
		expect(indexes).toContain("artifacts_created_at_idx");
	});

	it("there is no bet_id, product_id, or portfolio_id column on artifacts (hard rule #1)", () => {
		const cols = db.all<{ name: string }>(sql`PRAGMA table_info(artifacts)`).map((r) => r.name);
		expect(cols).not.toContain("bet_id");
		expect(cols).not.toContain("product_id");
		expect(cols).not.toContain("portfolio_id");
	});

	it("preview_json is nullable", () => {
		const cols = db.all<{ name: string; notnull: number }>(sql`PRAGMA table_info(artifacts)`);
		const previewCol = cols.find((c) => c.name === "preview_json");
		expect(previewCol).toBeDefined();
		expect(previewCol?.notnull).toBe(0);
	});

	it("cost columns are nullable (null until session settles)", () => {
		const cols = db.all<{ name: string; notnull: number }>(sql`PRAGMA table_info(artifacts)`);
		for (const name of [
			"cost_money_micros",
			"cost_tokens_input",
			"cost_tokens_output",
			"cost_settled_at",
		]) {
			const c = cols.find((x) => x.name === name);
			expect(c, `${name} column missing`).toBeDefined();
			expect(c?.notnull).toBe(0);
		}
	});

	it("created_at is NOT NULL", () => {
		const cols = db.all<{ name: string; notnull: number }>(sql`PRAGMA table_info(artifacts)`);
		const createdAt = cols.find((c) => c.name === "created_at");
		expect(createdAt?.notnull).toBe(1);
	});
});
