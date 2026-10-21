/**
 * Brownfield migration test for 0098 (done_when + reasons replace
 * done_condition + needs_review).
 *
 * Seeds pre-0098 state honestly: four tasks at different combinations of
 * done_condition / needs_review, then runs 0098 and asserts the backfill.
 *
 * Asserts:
 *   - non-empty done_condition → single check line in done_when
 *   - needs_review=true → review line appended (or sole line when no done_condition)
 *   - null/empty done_condition + needs_review=false → empty done_when array
 *   - reasons defaults to '[]' everywhere
 *   - done_condition and needs_review columns are gone after migration
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");
const PRE_MIGRATION_IDX = 97;
const MIGRATION_IDX = 98;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), `drizzle-brownfield-0098-`));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

type Row = Record<string, unknown>;

async function query(db: ReturnType<typeof drizzle>, q: string): Promise<Row[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: Row[] }).rows;
}

/** The single row a query must return; fails the test when there is none. */
async function one(db: ReturnType<typeof drizzle>, q: string): Promise<Row> {
	const [row] = await query(db, q);
	if (row === undefined) throw new Error(`no row for: ${q}`);
	return row;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0098: done_when and reasons replace done_condition and needs_review — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAndMigrate(): Promise<ReturnType<typeof drizzle>> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		// Minimal supporting rows
		await db.execute(
			sql.raw(`
			INSERT INTO teams (id, name, created_at) VALUES
				('team-0098', 'Test Team', '${NOW}')
			ON CONFLICT DO NOTHING;
		`),
		);
		await db.execute(
			sql.raw(`
			INSERT INTO users (id, name, role, status, created_at) VALUES
				('user-0098', 'Seeder', 'founder', 'active', '${NOW}')
			ON CONFLICT DO NOTHING;
		`),
		);

		// Four tasks, one for each brownfield case.
		// Tasks need a thread (NOT NULL FK after 0076).
		const tasks = [
			{
				id: "task-dc-norev",
				title: "Has done_condition, no needs_review",
				done_condition: "Feature ships",
				needs_review: false,
			},
			{
				id: "task-dc-rev",
				title: "Has done_condition AND needs_review",
				done_condition: "Design reviewed",
				needs_review: true,
			},
			{
				id: "task-nodc-rev",
				title: "No done_condition, needs_review=true",
				done_condition: null,
				needs_review: true,
			},
			{
				id: "task-nodc-norev",
				title: "No done_condition, no needs_review",
				done_condition: null,
				needs_review: false,
			},
		];

		for (const t of tasks) {
			await db.execute(
				sql.raw(`
				INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
				VALUES ('thr-${t.id}', 'team', 'team-0098', 'user-0098', '[]', '${NOW}', '${NOW}')
				ON CONFLICT DO NOTHING;
			`),
			);
			const dc = t.done_condition ? `'${t.done_condition}'` : "NULL";
			await db.execute(
				sql.raw(`
				INSERT INTO tasks (id, parent_task_id, team_id, title, state, done_condition, needs_review, thread_id, created_at, updated_at)
				VALUES ('${t.id}', NULL, 'team-0098', '${t.title}', 'proposed', ${dc}, ${t.needs_review}, 'thr-${t.id}', '${NOW}', '${NOW}')
				ON CONFLICT DO NOTHING;
			`),
			);
		}

		// Run 0098
		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		return db;
	}

	it("non-empty done_condition with needs_review=false → single check line in done_when", async () => {
		const db = await seedAndMigrate();
		const row = await one(db, `SELECT done_when, reasons FROM tasks WHERE id = 'task-dc-norev'`);
		const doneWhen = JSON.parse(row.done_when as string) as Array<{
			what: string;
			by: string;
			state: string;
		}>;
		expect(doneWhen).toHaveLength(1);
		expect(doneWhen[0]?.what).toBe("Feature ships");
		expect(doneWhen[0]?.by).toBe("check");
		expect(doneWhen[0]?.state).toBe("open");
		expect(JSON.parse(row.reasons as string)).toEqual([]);
	});

	it("non-empty done_condition with needs_review=true → two lines: check then review", async () => {
		const db = await seedAndMigrate();
		const row = await one(db, `SELECT done_when FROM tasks WHERE id = 'task-dc-rev'`);
		const doneWhen = JSON.parse(row.done_when as string) as Array<{ what: string; by: string }>;
		expect(doneWhen).toHaveLength(2);
		expect(doneWhen.some((l) => l.by === "check" && l.what === "Design reviewed")).toBe(true);
		expect(doneWhen.some((l) => l.by === "review")).toBe(true);
	});

	it("null done_condition with needs_review=true → single review line", async () => {
		const db = await seedAndMigrate();
		const row = await one(db, `SELECT done_when FROM tasks WHERE id = 'task-nodc-rev'`);
		const doneWhen = JSON.parse(row.done_when as string) as Array<{ by: string }>;
		expect(doneWhen).toHaveLength(1);
		expect(doneWhen[0]?.by).toBe("review");
	});

	it("null done_condition with needs_review=false → empty done_when array", async () => {
		const db = await seedAndMigrate();
		const row = await one(db, `SELECT done_when FROM tasks WHERE id = 'task-nodc-norev'`);
		expect(JSON.parse(row.done_when as string)).toEqual([]);
	});

	it("done_condition and needs_review columns no longer exist after migration", async () => {
		const db = await seedAndMigrate();
		await expect(db.execute(sql.raw("SELECT done_condition FROM tasks LIMIT 1"))).rejects.toThrow();
		await expect(db.execute(sql.raw("SELECT needs_review FROM tasks LIMIT 1"))).rejects.toThrow();
	});
});
