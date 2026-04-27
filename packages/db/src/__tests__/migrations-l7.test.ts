/**
 * L7 — Recovery Verbs schema (red phase, migrations + parity).
 *
 * Pins the schema-shape acceptance criteria from
 * `docs/work-packages/TRACK-L.md` L7 and the architect plan
 * `.worktrees/L7/.pipeline-plan.md` §3:
 *
 *   - new `recovery_audit` table (append-only): id, actor_id, verb,
 *     reason, target_kind, target_id, at, outcome (+ optional meta).
 *   - new `factory_state` singleton row keyed by id='factory':
 *     paused, paused_by, paused_at, paused_reason.
 *   - SQLite (drizzle/) and PostgreSQL (drizzle-pg/) parity.
 *
 * These tests MUST fail today: migration 0011 (sqlite) / 0010 (pg)
 * doesn't exist yet, and `recoveryAudit` / `factoryState` are not
 * exported from `schema.ts` / `schema.pg.ts`.
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

describe("L7 (sqlite): recovery_audit table", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("creates the recovery_audit table", () => {
		const tables = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name='recovery_audit'`,
			)
			.map((r) => r.name);
		expect(tables).toContain("recovery_audit");
	});

	it("recovery_audit has required columns: id, actor_id, verb, reason, target_kind, target_id, at, outcome", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("recovery_audit")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("id")).toBe(true);
		expect(byName.get("id")?.pk).toBe(1);
		expect(byName.has("actor_id")).toBe(true);
		expect(byName.get("actor_id")?.notnull).toBe(1);
		expect(byName.has("verb")).toBe(true);
		expect(byName.get("verb")?.notnull).toBe(1);
		expect(byName.has("reason")).toBe(true);
		expect(byName.get("reason")?.notnull).toBe(1);
		expect(byName.has("target_kind")).toBe(true);
		expect(byName.get("target_kind")?.notnull).toBe(1);
		expect(byName.has("target_id")).toBe(true);
		expect(byName.get("target_id")?.notnull).toBe(1);
		expect(byName.has("at")).toBe(true);
		expect(byName.get("at")?.notnull).toBe(1);
		expect(byName.has("outcome")).toBe(true);
		expect(byName.get("outcome")?.notnull).toBe(1);
	});

	it("can insert + read back a recovery_audit row via the typed schema", () => {
		// Seed an actor row first since recovery_audit.actor_id must FK to actors.
		const now = "2026-04-27T10:00:00.000Z";
		db.insert(schema.actors)
			.values({ id: "actor:ceo", role: "CEO", domainTags: "[]", createdAt: now })
			.run();
		db.insert(schema.recoveryAudit)
			.values({
				id: "ra-1",
				actorId: "actor:ceo",
				verb: "factory_pause",
				reason: "spotted bad output",
				targetKind: "factory",
				targetId: "factory",
				at: now,
				outcome: "succeeded",
			})
			.run();
		const row = db.get<{ verb: string; reason: string; outcome: string }>(
			sql.raw("SELECT verb, reason, outcome FROM \"recovery_audit\" WHERE id = 'ra-1'"),
		);
		expect(row?.verb).toBe("factory_pause");
		expect(row?.reason).toBe("spotted bad output");
		expect(row?.outcome).toBe("succeeded");
	});
});

describe("L7 (sqlite): factory_state singleton", () => {
	let db: HyperIdleDb;
	beforeEach(() => {
		db = migrateFreshSqlite();
	});

	it("creates the factory_state table", () => {
		const tables = db
			.all<{ name: string }>(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name='factory_state'`,
			)
			.map((r) => r.name);
		expect(tables).toContain("factory_state");
	});

	it("factory_state has paused, paused_by, paused_at, paused_reason columns", () => {
		const cols = db.all<SqliteColumnInfo>(sql.raw('PRAGMA table_info("factory_state")'));
		const byName = new Map(cols.map((c) => [c.name, c]));
		expect(byName.has("id")).toBe(true);
		expect(byName.get("id")?.pk).toBe(1);
		expect(byName.has("paused")).toBe(true);
		expect(byName.has("paused_by")).toBe(true);
		expect(byName.has("paused_at")).toBe(true);
		expect(byName.has("paused_reason")).toBe(true);
	});

	it("can write + read the singleton row", () => {
		db.insert(schema.factoryState)
			.values({
				id: "factory",
				paused: true,
				pausedBy: "actor:ceo",
				pausedAt: "2026-04-27T10:00:00.000Z",
				pausedReason: "spotted bad output",
			})
			.run();
		const row = db.get<{ id: string; paused_by: string; paused_reason: string }>(
			sql.raw("SELECT id, paused_by, paused_reason FROM \"factory_state\" WHERE id = 'factory'"),
		);
		expect(row?.id).toBe("factory");
		expect(row?.paused_by).toBe("actor:ceo");
		expect(row?.paused_reason).toBe("spotted bad output");
	});

	it("PRIMARY KEY rejects a duplicate singleton id (one factory row only)", () => {
		// @ts-expect-error -- factoryState exists only after L7 ships.
		db.insert(schema.factoryState)
			.values({
				id: "factory",
				paused: false,
			})
			.run();
		expect(() => {
			// @ts-expect-error -- factoryState exists only after L7 ships.
			db.insert(schema.factoryState).values({ id: "factory", paused: true }).run();
		}).toThrow(/UNIQUE|PRIMARY KEY|constraint/i);
	});
});

describe("L7 (pg): recovery_audit + factory_state parity", () => {
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

	it("creates recovery_audit table in postgres with the required columns", async () => {
		const result = (await pgDb.execute(
			sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_audit'`,
		)) as { rows: Array<{ column_name: string }> };
		const cols = new Set(result.rows.map((r) => r.column_name));
		expect(cols.has("id")).toBe(true);
		expect(cols.has("actor_id")).toBe(true);
		expect(cols.has("verb")).toBe(true);
		expect(cols.has("reason")).toBe(true);
		expect(cols.has("target_kind")).toBe(true);
		expect(cols.has("target_id")).toBe(true);
		expect(cols.has("at")).toBe(true);
		expect(cols.has("outcome")).toBe(true);
	});

	it("creates factory_state table in postgres with the required columns", async () => {
		const result = (await pgDb.execute(
			sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='factory_state'`,
		)) as { rows: Array<{ column_name: string }> };
		const cols = new Set(result.rows.map((r) => r.column_name));
		expect(cols.has("id")).toBe(true);
		expect(cols.has("paused")).toBe(true);
		expect(cols.has("paused_by")).toBe(true);
		expect(cols.has("paused_at")).toBe(true);
		expect(cols.has("paused_reason")).toBe(true);
	});
});
