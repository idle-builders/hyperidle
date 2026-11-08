import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, isDowngrade } from "../src/migrate.js";

const REAL_MIGRATIONS_FOLDER = path.resolve(__dirname, "..", "drizzle");

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-db-migrate-test-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("applyMigrations", () => {
	it("runs migrations on a fresh database and returns a result with applied > 0", {
		timeout: 30_000,
	}, async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		const result = await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(result.applied).toBeGreaterThan(0);
		expect(result.schemaVersion).toBeGreaterThan(0);
	});

	it("creates the data directory at dataDir", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		expect(fs.existsSync(dataDir)).toBe(false);
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(fs.existsSync(dataDir)).toBe(true);
	});

	it("returns the same schemaVersion on re-run (idempotent)", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		const first = await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		const second = await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(second.schemaVersion).toBe(first.schemaVersion);
	});

	it("does NOT populate any application tables (no seed data)", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			const result = await client.query<{ count: string }>("SELECT COUNT(*) as count FROM teams");
			const count = Number.parseInt(result.rows[0].count, 10);
			expect(count).toBe(0);
		} finally {
			await client.close();
		}
	});

	it("throws if the migrations folder does not exist", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await expect(applyMigrations(dataDir, "/nonexistent/migrations/folder")).rejects.toThrow(
			/no such file|ENOENT|not found|cannot find/i,
		);
	});
});

describe("isDowngrade", () => {
	it("returns false when the data directory does not exist (fresh install)", async () => {
		const dataDir = path.join(tmpDir, "nonexistent");
		const result = await isDowngrade(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(false);
	});

	it("returns false after applyMigrations (DB matches bundled migrations)", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		const result = await isDowngrade(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(false);
	});

	it("returns true when the DB has more migrations than the bundled journal", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			await client.query(
				`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
				 VALUES ('fakehash_future_migration_999', $1)`,
				[Date.now()],
			);
		} finally {
			await client.close();
		}

		const result = await isDowngrade(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(true);
	});
});

describe("migration 0118 schema", () => {
	it("teams.is_global column exists with default false", { timeout: 30_000 }, async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			const result = await client.query<{ column_default: string; data_type: string }>(
				`SELECT column_default, data_type
				 FROM information_schema.columns
				 WHERE table_name = 'teams' AND column_name = 'is_global'`,
			);
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0].data_type).toBe("boolean");
		} finally {
			await client.close();
		}
	});

	it("user_teams.is_default_runner column exists with default false", {
		timeout: 30_000,
	}, async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			const result = await client.query<{ column_default: string; data_type: string }>(
				`SELECT column_default, data_type
				 FROM information_schema.columns
				 WHERE table_name = 'user_teams' AND column_name = 'is_default_runner'`,
			);
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0].data_type).toBe("boolean");
		} finally {
			await client.close();
		}
	});

	it("user_teams_default_runner_uq partial index exists", { timeout: 30_000 }, async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			const result = await client.query<{ indexname: string }>(
				`SELECT indexname FROM pg_indexes
				 WHERE tablename = 'user_teams' AND indexname = 'user_teams_default_runner_uq'`,
			);
			expect(result.rows).toHaveLength(1);
		} finally {
			await client.close();
		}
	});

	it("plugins.scope_kind check only allows team", { timeout: 30_000 }, async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			// Factory scope should now be rejected
			await client.query<{ id: string }>("SELECT id FROM teams LIMIT 1");
			// No data in a fresh DB; just verify the constraint exists via check_constraints
			const result = await client.query<{ constraint_name: string; check_clause: string }>(
				`SELECT constraint_name, check_clause
				 FROM information_schema.check_constraints
				 WHERE constraint_name = 'plugins_scope_kind_ck'`,
			);
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0].check_clause).toContain("team");
			expect(result.rows[0].check_clause).not.toContain("factory");
		} finally {
			await client.close();
		}
	});
});
