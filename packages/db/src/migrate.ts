/**
 * Programmatic migration runner and downgrade protection.
 * Extracted from setup-cli so both the CLI and the Electron desktop share
 * a single migration code path.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export interface MigrationResult {
	readonly applied: number;
	readonly schemaVersion: number;
}

/**
 * Count applied migrations from the __drizzle_migrations table.
 * Returns 0 if the table does not exist.
 */
function countAppliedMigrations(sqlite: InstanceType<typeof Database>): number {
	// Check if the migrations table exists
	const tableExists = sqlite
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
		.get() as { name: string } | undefined;

	if (!tableExists) {
		return 0;
	}

	const row = sqlite.prepare("SELECT COUNT(*) as count FROM __drizzle_migrations").get() as {
		count: number;
	};

	return row.count;
}

/**
 * Run all pending Drizzle migrations against the SQLite database at dbPath.
 *
 * Opens a dedicated connection, runs migrations, then closes it.
 * Does NOT seed — seeding is only for the setup-cli development workflow.
 *
 * @throws if the database cannot be opened or migrations fail.
 */
export function applyMigrations(dbPath: string, migrationsFolder: string): MigrationResult {
	// Validate the migrations folder exists before opening the DB
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	if (!fs.existsSync(migrationsFolder)) {
		throw new Error(`ENOENT: no such file or directory, open '${migrationsFolder}'`);
	}
	if (!fs.existsSync(journalPath)) {
		throw new Error(`ENOENT: no such file or directory, open '${journalPath}'`);
	}

	const sqlite = new Database(dbPath);
	try {
		sqlite.pragma("journal_mode = WAL");
		sqlite.pragma("foreign_keys = ON");

		const countBefore = countAppliedMigrations(sqlite);

		const db = drizzle(sqlite);
		migrate(db, { migrationsFolder });

		const countAfter = countAppliedMigrations(sqlite);
		const applied = countAfter - countBefore;
		const schemaVersion = countAfter;

		return { applied, schemaVersion };
	} finally {
		sqlite.close();
	}
}

/**
 * Check if the database schema is newer than the bundled migrations.
 * Returns true if a downgrade is detected (DB has migrations the app
 * does not know about).
 *
 * Returns false if the database does not exist (fresh install).
 */
export function isDowngrade(dbPath: string, migrationsFolder: string): boolean {
	// Fresh install: no DB file yet
	if (!fs.existsSync(dbPath)) {
		return false;
	}

	// Read the bundled journal to count bundled migrations
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	let bundledCount = 0;
	try {
		const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
			entries: unknown[];
		};
		bundledCount = journal.entries.length;
	} catch {
		// If we can't read the journal, assume no downgrade
		return false;
	}

	const sqlite = new Database(dbPath, { readonly: true });
	try {
		const dbCount = countAppliedMigrations(sqlite);
		return dbCount > bundledCount;
	} finally {
		sqlite.close();
	}
}
