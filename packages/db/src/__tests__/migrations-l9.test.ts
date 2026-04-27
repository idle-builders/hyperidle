/**
 * L9 — Artifact-Kind Renderers schema migration (red phase).
 *
 * Pins the schema-shape acceptance criteria from
 * `docs/work-packages/TRACK-L.md` L9:
 *
 *   - items.reversibility (nullable; integer 0/1 in SQLite, boolean in PG).
 *   - items.sandbox_result (nullable text).
 *   - items.attachments JSON shape extends to carry blast_radius
 *     ({agents, teams, products}: string[]). Render-only — DB stores the JSON.
 *   - SQLite (drizzle/) and PostgreSQL (drizzle-pg/) parity.
 *
 * These tests MUST fail today: migrations 0009 (sqlite) / 0008 (pg) do not
 * exist yet, and the new columns are absent from `items`.
 */
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";
import * as pgSchema from "../schema.pg.js";

function migrateFreshSqlite(): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	const db = drizzleSqlite(sqlite, { schema });
	migrateSqlite(db, { migrationsFolder: resolve(__dirname, "../../drizzle") });
	return db;
}

interface SqliteColumnInfo {
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

describe("L9 (sqlite): items.reversibility column", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("adds items.reversibility (nullable, integer)", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("items")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("reversibility")).toBe(true);
		// Nullable: notnull = 0
		expect(byName.get("reversibility")?.notnull).toBe(0);
	});

	it("existing item rows default to reversibility = NULL", () => {
		// Need a thread row first because items.thread_id is NOT NULL FK.
		const now = new Date().toISOString();
		db.insert(schema.threads).values({ id: "t-l9", kind: "review", createdAt: now }).run();
		db.insert(schema.items)
			.values({ id: "i-l9-rev", title: "x", threadId: "t-l9", createdAt: now })
			.run();
		const row = db.get<{ reversibility: number | null }>(
			sql.raw("SELECT reversibility FROM items WHERE id = 'i-l9-rev'"),
		);
		expect(row?.reversibility).toBeNull();
	});
});

describe("L9 (sqlite): items.sandbox_result column", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("adds items.sandbox_result (nullable, text)", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("items")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("sandbox_result")).toBe(true);
		expect(byName.get("sandbox_result")?.notnull).toBe(0);
	});

	it("accepts 'passed', 'failed', 'n/a' values without error", () => {
		const now = new Date().toISOString();
		db.insert(schema.threads).values({ id: "t-l9-sb", kind: "review", createdAt: now }).run();
		for (const v of ["passed", "failed", "n/a"] as const) {
			db.run(
				sql.raw(
					`INSERT INTO items (id, title, thread_id, created_at, sandbox_result) VALUES ('i-${v.replace("/", "-")}', 'x', 't-l9-sb', '${now}', '${v}')`,
				),
			);
		}
		const rows = db.all<{ sandbox_result: string }>(
			sql.raw("SELECT sandbox_result FROM items WHERE thread_id = 't-l9-sb'"),
		);
		expect(rows.map((r) => r.sandbox_result).sort()).toEqual(["failed", "n/a", "passed"]);
	});
});

describe("L9 (sqlite): blast_radius lives inside items.attachments JSON", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("attachments JSON round-trips a blast_radius object", () => {
		const now = new Date().toISOString();
		db.insert(schema.threads).values({ id: "t-l9-br", kind: "review", createdAt: now }).run();
		const blastRadius = {
			agents: ["agent:builder"],
			teams: ["team:web"],
			products: ["hyperidle-web"],
		};
		db.insert(schema.items)
			.values({
				id: "i-l9-br",
				title: "x",
				threadId: "t-l9-br",
				createdAt: now,
				attachments: JSON.stringify({ blast_radius: blastRadius }),
			})
			.run();
		const row = db.get<{ attachments: string }>(
			sql.raw("SELECT attachments FROM items WHERE id = 'i-l9-br'"),
		);
		const parsed = JSON.parse(row?.attachments ?? "{}") as {
			blast_radius?: { agents: string[]; teams: string[]; products: string[] };
		};
		expect(parsed.blast_radius).toEqual(blastRadius);
	});
});

describe("L9 (pg): parity for reversibility + sandbox_result", () => {
	let client: PGlite;
	let pgDb: ReturnType<typeof drizzlePglite<typeof pgSchema>>;

	beforeEach(async () => {
		client = new PGlite();
		await client.waitReady;
		pgDb = drizzlePglite(client, { schema: pgSchema });
		await migratePglite(pgDb, {
			migrationsFolder: resolve(__dirname, "../../drizzle-pg"),
		});
	});

	afterEach(async () => {
		await client.close();
	});

	it("items has reversibility column in postgres (nullable)", async () => {
		const result = (await pgDb.execute(
			sql`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='reversibility'`,
		)) as { rows: Array<{ column_name: string; is_nullable: string; data_type: string }> };
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.is_nullable).toBe("YES");
	});

	it("items has sandbox_result column in postgres (nullable, text)", async () => {
		const result = (await pgDb.execute(
			sql`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='sandbox_result'`,
		)) as { rows: Array<{ column_name: string; is_nullable: string; data_type: string }> };
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.is_nullable).toBe("YES");
		expect(result.rows[0]?.data_type.toLowerCase()).toContain("text");
	});
});
