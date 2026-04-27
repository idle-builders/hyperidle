/**
 * L2 — Founder/Actor Routing Schema (red phase, migrations + seed).
 *
 * Pins the schema-shape acceptance criteria from
 * `docs/work-packages/TRACK-L.md` L2:
 *
 *   - actors table (id, role, domain_tags, created_at)
 *   - threads.routed_to_actor_id (nullable, FK -> actors.id)
 *   - threads.domain_tag (nullable text)
 *   - thread_routing_audit table (append-only audit rows)
 *   - SQLite (drizzle/) and PostgreSQL (drizzle-pg/) parity
 *   - Seed inserts actor:ceo + actor:cpo idempotently
 *   - Existing thread rows have routed_to_actor_id = NULL post-migrate
 *
 * These tests MUST fail today: migrations 0008 (sqlite) / 0007 (pg) do not
 * exist yet, the actors / thread_routing_audit tables do not exist, and the
 * seed does not insert founder actor rows.
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
import { seed } from "../seed.js";
import { seedPg } from "../seed-pg.js";

function migrateFreshSqlite(opts?: { foreignKeys?: boolean }): HyperIdleDb {
	const sqlite = new Database(":memory:");
	sqlite.pragma("journal_mode = WAL");
	if (opts?.foreignKeys) sqlite.pragma("foreign_keys = ON");
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

describe("L2 (sqlite): actors table", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("creates the actors table", () => {
		const tableNames = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name='actors'`,
			)
			.map((r) => r.name);
		expect(tableNames).toContain("actors");
	});

	it("actors has id (PK), role, domain_tags, created_at columns", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("actors")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("id")).toBe(true);
		expect(byName.get("id")?.pk).toBe(1);
		expect(byName.has("role")).toBe(true);
		expect(byName.get("role")?.notnull).toBe(1);
		expect(byName.has("domain_tags")).toBe(true);
		expect(byName.has("created_at")).toBe(true);
		expect(byName.get("created_at")?.notnull).toBe(1);
	});

	it("can insert and read back an actor row", () => {
		const now = new Date().toISOString();
		// @ts-expect-error -- the `actors` table is asserted to exist in schema once
		// L2 ships; before then `schema.actors` is undefined and the test fails.
		db.insert(schema.actors)
			.values({
				id: "actor:test",
				role: "CEO",
				domainTags: JSON.stringify(["market"]),
				createdAt: now,
			})
			.run();
		const rows = db.all<{ id: string; role: string }>(
			sql.raw("SELECT id, role FROM \"actors\" WHERE id = 'actor:test'"),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.role).toBe("CEO");
	});
});

describe("L2 (sqlite): threads routing columns", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("adds threads.routed_to_actor_id (nullable)", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("threads")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("routed_to_actor_id")).toBe(true);
		// Nullable: notnull = 0
		expect(byName.get("routed_to_actor_id")?.notnull).toBe(0);
	});

	it("adds threads.domain_tag (nullable text)", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("threads")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("domain_tag")).toBe(true);
		expect(byName.get("domain_tag")?.notnull).toBe(0);
	});

	it("existing thread rows default to routed_to_actor_id = NULL and domain_tag = NULL", () => {
		const dbFk = migrateFreshSqlite({ foreignKeys: false });
		const now = new Date().toISOString();
		// Insert a thread without specifying the new columns — they must default to NULL.
		dbFk.insert(schema.threads).values({ id: "t-existing", kind: "review", createdAt: now }).run();
		const row = dbFk.get<{
			id: string;
			routedToActorId: string | null;
			domainTag: string | null;
		}>(
			sql.raw(
				'SELECT id, routed_to_actor_id AS "routedToActorId", domain_tag AS "domainTag" FROM "threads" WHERE id = \'t-existing\'',
			),
		);
		expect(row?.routedToActorId).toBeNull();
		expect(row?.domainTag).toBeNull();
	});
});

describe("L2 (sqlite): thread_routing_audit table", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("creates the thread_routing_audit table", () => {
		const rows = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name='thread_routing_audit'`,
			)
			.map((r) => r.name);
		expect(rows).toContain("thread_routing_audit");
	});

	it("thread_routing_audit has id, thread_id, from_actor_id (nullable), to_actor_id, reason, at", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("thread_routing_audit")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("id")).toBe(true);
		expect(byName.get("id")?.pk).toBe(1);
		expect(byName.has("thread_id")).toBe(true);
		expect(byName.get("thread_id")?.notnull).toBe(1);
		expect(byName.has("from_actor_id")).toBe(true);
		// from_actor_id is nullable per plan §3.3 (route from "either" → CPO).
		expect(byName.get("from_actor_id")?.notnull).toBe(0);
		expect(byName.has("to_actor_id")).toBe(true);
		expect(byName.has("reason")).toBe(true);
		expect(byName.get("reason")?.notnull).toBe(1);
		expect(byName.has("at")).toBe(true);
		expect(byName.get("at")?.notnull).toBe(1);
	});
});

describe("L2 (sqlite): seed inserts actor:ceo and actor:cpo", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite({ foreignKeys: true });
	});

	it("seed inserts actor:ceo with role CEO", () => {
		seed(db);
		const row = db.get<{ id: string; role: string }>(
			sql.raw("SELECT id, role FROM actors WHERE id = 'actor:ceo'"),
		);
		expect(row?.id).toBe("actor:ceo");
		expect(row?.role).toBe("CEO");
	});

	it("seed inserts actor:cpo with role CPO", () => {
		seed(db);
		const row = db.get<{ id: string; role: string }>(
			sql.raw("SELECT id, role FROM actors WHERE id = 'actor:cpo'"),
		);
		expect(row?.id).toBe("actor:cpo");
		expect(row?.role).toBe("CPO");
	});

	it("is idempotent — running seed twice does not error or duplicate actor rows", () => {
		seed(db);
		expect(() => seed(db)).not.toThrow();
		const count = db.get<{ count: number }>(
			sql.raw("SELECT COUNT(*) AS count FROM actors WHERE id IN ('actor:ceo','actor:cpo')"),
		);
		expect(count?.count).toBe(2);
	});
});

describe("L2 (pg): parity for actors + thread routing", () => {
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

	it("creates actors table in postgres", async () => {
		const result = (await pgDb.execute(
			sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='actors'`,
		)) as { rows: Array<{ table_name: string }> };
		expect(result.rows.map((r) => r.table_name)).toContain("actors");
	});

	it("threads has routed_to_actor_id and domain_tag columns in postgres", async () => {
		const result = (await pgDb.execute(
			sql`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='threads' ORDER BY column_name`,
		)) as { rows: Array<{ column_name: string; is_nullable: string }> };
		const byName = new Map(result.rows.map((r) => [r.column_name, r.is_nullable]));
		expect(byName.has("routed_to_actor_id")).toBe(true);
		expect(byName.get("routed_to_actor_id")).toBe("YES");
		expect(byName.has("domain_tag")).toBe(true);
		expect(byName.get("domain_tag")).toBe("YES");
	});

	it("creates thread_routing_audit table in postgres with required columns", async () => {
		const result = (await pgDb.execute(
			sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='thread_routing_audit'`,
		)) as { rows: Array<{ column_name: string }> };
		const cols = new Set(result.rows.map((r) => r.column_name));
		expect(cols.has("id")).toBe(true);
		expect(cols.has("thread_id")).toBe(true);
		expect(cols.has("from_actor_id")).toBe(true);
		expect(cols.has("to_actor_id")).toBe(true);
		expect(cols.has("reason")).toBe(true);
		expect(cols.has("at")).toBe(true);
	});

	it("seedPg inserts actor:ceo and actor:cpo idempotently", async () => {
		await seedPg(pgDb);
		await seedPg(pgDb);
		const result = (await pgDb.execute(
			sql`SELECT id, role FROM actors WHERE id IN ('actor:ceo','actor:cpo') ORDER BY id`,
		)) as { rows: Array<{ id: string; role: string }> };
		expect(result.rows).toHaveLength(2);
		const byId = new Map(result.rows.map((r) => [r.id, r.role]));
		expect(byId.get("actor:ceo")).toBe("CEO");
		expect(byId.get("actor:cpo")).toBe("CPO");
	});
});
