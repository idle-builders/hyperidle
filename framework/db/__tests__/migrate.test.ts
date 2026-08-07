/**
 * N4 — framework/db migrate function tests
 *
 * @lore PGlite migration: all tests now use PGlite data directories
 * instead of SQLite files. applyMigrations and isDowngrade are async.
 */

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

	it("is idempotent: re-running on already-migrated DB does not throw", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		await expect(applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER)).resolves.toBeDefined();
	});

	it("returns the same schemaVersion on re-run (idempotent)", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		const first = await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		const second = await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		expect(second.schemaVersion).toBe(first.schemaVersion);
	});

	it("closes the database connection after completion (data dir is not locked)", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);
		await expect(applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER)).resolves.toBeDefined();
	});

	it("does NOT populate any application tables (no seed data)", async () => {
		const dataDir = path.join(tmpDir, "pgdata");
		await applyMigrations(dataDir, REAL_MIGRATIONS_FOLDER);

		// Verify that the teams table is empty (no seed data).
		// @lore U1: `products` table was renamed to `teams` in migration 0021.
		// Use PGlite directly (no better-sqlite3 after PGLite migration).
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
