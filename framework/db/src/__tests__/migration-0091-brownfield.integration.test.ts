/**
 * Migration test for 0091 (drop the unfiled grouping roots).
 *
 * 0080 inserted three grouping roots (Product, Practices, General) into
 * every database. 0091 deletes each one only where nobody used it: nothing
 * filed under it, no task made from it, never edited. A fresh database
 * therefore ends with none of them; a brownfield database keeps every root
 * someone touched.
 *
 * Asserts with raw `sql` only, like the neighbouring brownfield tests.
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
const PRE_MIGRATION_IDX = 90;

const ROOTS = ["ki-mig-root-general", "ki-mig-root-practices", "ki-mig-root-product"];
const NOW = "2026-01-01T00:00:00.000Z";

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0091-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0091: drop the unfiled grouping roots", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function freshDb(): Promise<ReturnType<typeof drizzle>> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		return drizzle(client);
	}

	async function migrateBefore(db: ReturnType<typeof drizzle>): Promise<void> {
		const folder = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });
	}

	async function rootsLeft(db: ReturnType<typeof drizzle>): Promise<string[]> {
		const rows = (
			await db.execute(
				sql`SELECT id FROM documents WHERE id IN ('ki-mig-root-product', 'ki-mig-root-practices', 'ki-mig-root-general') ORDER BY id`,
			)
		).rows as Array<{ id: string }>;
		return rows.map((r) => r.id);
	}

	async function fileUnderProduct(db: ReturnType<typeof drizzle>): Promise<void> {
		await db.execute(sql`
			INSERT INTO documents (id, title, body, format, status, parent_kind, parent_id, updated_by, created_at, updated_at)
			VALUES ('doc-child', 'Roadmap', '', 'markdown', 'active', 'document', 'ki-mig-root-product', 'someone', ${NOW}, ${NOW})
		`);
	}

	it("the earlier migration seeds the three roots, so there is something to delete", async () => {
		const db = await freshDb();
		await migrateBefore(db);
		expect(await rootsLeft(db)).toEqual(ROOTS);
	});

	it("a fresh database ends with no documents at all", async () => {
		const db = await freshDb();
		await migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
		expect(await rootsLeft(db)).toEqual([]);
		const [count] = (await db.execute(sql`SELECT count(*)::int AS n FROM documents`))
			.rows as Array<{ n: number }>;
		expect(count?.n).toBe(0);
	});

	it("keeps a root with a document filed under it, one a task was made from, and one that was edited", async () => {
		const db = await freshDb();
		await migrateBefore(db);

		await fileUnderProduct(db);
		await db.execute(
			sql`INSERT INTO teams (id, name, created_at) VALUES ('team-1', 'Team', ${NOW})`,
		);
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, created_at)
			VALUES ('human-1', 'Human', 'human', 'member', 'active', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
			VALUES ('thr-1', 'task', 'task-1', 'human-1', '[]', ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO tasks (id, team_id, title, state, thread_id, source_document_id, created_at, updated_at)
			VALUES ('task-1', 'team-1', 'From practices', 'open', 'thr-1', 'ki-mig-root-practices', ${NOW}, ${NOW})
		`);
		await db.execute(
			sql`UPDATE documents SET version = 2, body = 'Ours now.' WHERE id = 'ki-mig-root-general'`,
		);

		await migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
		expect(await rootsLeft(db)).toEqual(ROOTS);
	});

	it("deletes the untouched roots and keeps the used one with its child", async () => {
		const db = await freshDb();
		await migrateBefore(db);
		await fileUnderProduct(db);

		await migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
		expect(await rootsLeft(db)).toEqual(["ki-mig-root-product"]);
		const [child] = (await db.execute(sql`SELECT parent_id FROM documents WHERE id = 'doc-child'`))
			.rows as Array<{ parent_id: string }>;
		expect(child?.parent_id).toBe("ki-mig-root-product");
	});
});
