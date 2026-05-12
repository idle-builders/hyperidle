/**
 * N4 — packages/db migrate function tests
 *
 * AC coverage:
 *  - applyMigrations() applies pending migrations to a fresh database
 *  - applyMigrations() is idempotent (re-running on already-migrated DB is safe)
 *  - applyMigrations() returns MigrationResult with applied count and schemaVersion
 *  - applyMigrations() closes the connection after running (does not hold the file open)
 *  - applyMigrations() does NOT call seed() (desktop starts with empty DB)
 *  - isDowngrade() returns false for a fresh database (no __drizzle_migrations table)
 *  - isDowngrade() returns false when DB migration count <= bundled journal count
 *  - isDowngrade() returns true when DB migration count > bundled journal count
 *  - isDowngrade() returns false when the database file does not exist
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, isDowngrade } from "../src/migrate.js";

// The real migrations folder in the monorepo (relative to this test file)
const REAL_MIGRATIONS_FOLDER = path.resolve(__dirname, "..", "drizzle");

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-db-migrate-test-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("applyMigrations", () => {
	it("runs migrations on a fresh database and returns a result with applied > 0", () => {
		const dbPath = path.join(tmpDir, "test.db");
		const result = applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(result.applied).toBeGreaterThan(0);
		expect(result.schemaVersion).toBeGreaterThan(0);
	});

	it("creates the database file at dbPath", () => {
		const dbPath = path.join(tmpDir, "test.db");
		expect(fs.existsSync(dbPath)).toBe(false);
		applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(fs.existsSync(dbPath)).toBe(true);
	});

	it("is idempotent: re-running on already-migrated DB does not throw", () => {
		const dbPath = path.join(tmpDir, "test.db");
		applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		// Should not throw
		expect(() => applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER)).not.toThrow();
	});

	it("returns the same schemaVersion on re-run (idempotent)", () => {
		const dbPath = path.join(tmpDir, "test.db");
		const first = applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		const second = applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(second.schemaVersion).toBe(first.schemaVersion);
	});

	it("closes the database connection after completion (db file is not locked)", () => {
		const dbPath = path.join(tmpDir, "test.db");
		applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		// If the connection is not closed, this would fail with SQLITE_BUSY
		// We verify by opening a second connection immediately
		expect(() => applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER)).not.toThrow();
	});

	it("does NOT populate any application tables (no seed data)", () => {
		const dbPath = path.join(tmpDir, "test.db");
		applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);

		// Verify that the products table is empty (no seed data)
		// We do this by opening a direct better-sqlite3 connection
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import for test introspection
		const BetterSqlite = require("better-sqlite3") as any;
		const db = new BetterSqlite(dbPath, { readonly: true });
		try {
			const row = db.prepare("SELECT COUNT(*) as count FROM products").get() as {
				count: number;
			};
			expect(row.count).toBe(0);
		} finally {
			db.close();
		}
	});

	it("throws if the migrations folder does not exist", () => {
		const dbPath = path.join(tmpDir, "test.db");
		// Should throw with a meaningful error about the missing folder, NOT "not implemented"
		expect(() => applyMigrations(dbPath, "/nonexistent/migrations/folder")).toThrow(
			/no such file|ENOENT|not found|cannot find/i,
		);
	});
});

describe("isDowngrade", () => {
	it("returns false when the database file does not exist (fresh install)", () => {
		const dbPath = path.join(tmpDir, "nonexistent.db");
		const result = isDowngrade(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(false);
	});

	it("returns false for a fresh database (no __drizzle_migrations table yet)", () => {
		const dbPath = path.join(tmpDir, "fresh.db");
		// Create a minimal empty SQLite file by opening and closing better-sqlite3
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import for test setup
		const BetterSqlite = require("better-sqlite3") as any;
		const db = new BetterSqlite(dbPath);
		db.close();

		const result = isDowngrade(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(false);
	});

	it("returns false after applyMigrations (DB matches bundled migrations)", () => {
		const dbPath = path.join(tmpDir, "migrated.db");
		applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);
		const result = isDowngrade(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(false);
	});

	it("returns true when the DB has more migrations than the bundled journal", () => {
		const dbPath = path.join(tmpDir, "newer.db");
		applyMigrations(dbPath, REAL_MIGRATIONS_FOLDER);

		// Simulate a newer DB by directly inserting an extra migration entry
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import for test manipulation
		const BetterSqlite = require("better-sqlite3") as any;
		const db = new BetterSqlite(dbPath);
		try {
			// Insert a fake future migration entry
			db.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(
				"fakehash_future_migration_999",
				Date.now(),
			);
		} finally {
			db.close();
		}

		const result = isDowngrade(dbPath, REAL_MIGRATIONS_FOLDER);
		expect(result).toBe(true);
	});
});
