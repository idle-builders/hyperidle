// L3 RED — Drizzle schema tests for the `artifacts` table.

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
// @lore U1: `products` renamed to `teams`; old `teams` (membership) renamed to `teamMembers`.
import { artifacts, bets, tasks, teams } from "../schema.js";

const NOW = "2026-04-28T00:00:00.000Z";

async function seedTask(
	db: HyperIdleDb,
): Promise<{ taskId: string; betId: string; teamId: string }> {
	await db.insert(teams).values({ id: "p1", name: "P", phase: "build", createdAt: NOW });

	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "x",
		appetite: "1w",
		status: "draft",
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "task1",
		betId: "b1",
		teamId: "p1",
		title: "T",
		state: "pending",
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { taskId: "task1", betId: "b1", teamId: "p1" };
}

describe("L3 artifacts schema", () => {
	test("creates the artifacts table", async ({ db }) => {
		const result = await db.execute(
			`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'artifacts'` as Parameters<
				typeof db.execute
			>[0],
		);
		const rows = (result as { rows: Array<{ tablename: string }> }).rows;
		expect(rows.map((r) => r.tablename)).toContain("artifacts");
	});

	test("supports insert + select round-trip", async ({ db }) => {
		// @lore O2: cost columns stripped from artifacts kernel table.
		const { taskId } = await seedTask(db);
		// AM5 B1: code_diff → code (pre-alpha purge; no DB rows to honor)
		await db.insert(artifacts).values({
			id: "art1",
			producingTaskId: taskId,
			kind: "code",
			previewJson: null,
			createdAt: NOW,
		});

		const rows = await db.select().from(artifacts).where(eq(artifacts.id, "art1"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.kind).toBe("code");
		expect(rows[0]?.producingTaskId).toBe(taskId);
	});

	// AC-2 / protected: insert with non-existent producing_task_id must fail (FK restrict)
	test("rejects inserts with a non-existent producing_task_id (FK restrict)", async ({ db }) => {
		// @lore O2: cost columns stripped from artifacts kernel table.
		await expect(
			db.insert(artifacts).values({
				id: "art2",
				producingTaskId: "nonexistent",
				kind: "deck",
				previewJson: null,
				createdAt: NOW,
			}),
		).rejects.toThrow();
	});

	test("rejects deletion of a task that owns artifacts (ON DELETE RESTRICT)", async ({ db }) => {
		const { taskId } = await seedTask(db);
		// @lore O2: cost columns stripped from artifacts kernel table.
		await db.insert(artifacts).values({
			id: "art3",
			producingTaskId: taskId,
			kind: "deck",
			previewJson: null,
			createdAt: NOW,
		});
		await expect(db.delete(tasks).where(eq(tasks.id, taskId))).rejects.toThrow();
	});

	test("enforces unique id constraint (PK)", async ({ db }) => {
		const { taskId } = await seedTask(db);
		// @lore O2: cost columns stripped from artifacts kernel table.
		await db.insert(artifacts).values({
			id: "art4",
			producingTaskId: taskId,
			kind: "deck",
			previewJson: null,
			createdAt: NOW,
		});
		await expect(
			db.insert(artifacts).values({
				id: "art4",
				producingTaskId: taskId,
				kind: "deck",
				previewJson: null,
				createdAt: NOW,
			}),
		).rejects.toThrow();
	});

	test("has a producing_task_id index for fetch by task", async ({ db }) => {
		const result = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'artifacts' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
		expect(indexes).toContain("artifacts_producing_task_id_idx");
	});

	test("has a created_at index for pagination cursor", async ({ db }) => {
		const result = await db.execute(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'artifacts' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const indexes = (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
		expect(indexes).toContain("artifacts_created_at_idx");
	});

	test("there is no bet_id, product_id, or portfolio_id column on artifacts (hard rule #1)", async ({
		db,
	}) => {
		const result = await db.execute(
			`SELECT column_name FROM information_schema.columns WHERE table_name = 'artifacts' AND table_schema = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
		const cols = (result as { rows: Array<{ column_name: string }> }).rows.map(
			(r) => r.column_name,
		);
		expect(cols).not.toContain("bet_id");
		expect(cols).not.toContain("product_id");
		expect(cols).not.toContain("portfolio_id");
	});

	test("preview_json is nullable", async ({ db }) => {
		const result = await db.execute(
			`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'artifacts' AND table_schema = 'public' AND column_name = 'preview_json'` as Parameters<
				typeof db.execute
			>[0],
		);
		// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
		const rows = (result as { rows: Array<{ column_name: string; is_nullable: string }> }).rows;
		expect(rows[0]).toBeDefined();
		expect(rows[0]?.is_nullable).toBe("YES");
	});

	test("cost columns are absent (stripped from kernel table in O2)", async ({ db }) => {
		// @lore O2: cost columns (cost_money_micros, cost_tokens_input,
		// cost_tokens_output, cost_settled_at) stripped from the kernel artifacts
		// table as part of kernel/strategy separation. Cost is now a strategy concern.
		const result = await db.execute(
			`SELECT column_name FROM information_schema.columns WHERE table_name = 'artifacts' AND table_schema = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
		const cols = (result as { rows: Array<{ column_name: string }> }).rows.map(
			(r) => r.column_name,
		);
		expect(cols).not.toContain("cost_money_micros");
		expect(cols).not.toContain("cost_tokens_input");
		expect(cols).not.toContain("cost_tokens_output");
		expect(cols).not.toContain("cost_settled_at");
	});

	test("created_at is NOT NULL", async ({ db }) => {
		const result = await db.execute(
			`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'artifacts' AND table_schema = 'public' AND column_name = 'created_at'` as Parameters<
				typeof db.execute
			>[0],
		);
		// biome-ignore lint/style/useNamingConvention: SQL column names from information_schema use snake_case
		const rows = (result as { rows: Array<{ column_name: string; is_nullable: string }> }).rows;
		expect(rows[0]?.is_nullable).toBe("NO");
	});
});
