/**
 * Programmatic migration runner and downgrade protection.
 * Extracted from setup-cli so both the CLI and the Electron desktop share
 * a single migration code path.
 *
 * @lore Phase 2 PGlite migration: applyMigrations() is now async and uses
 * PGlite instead of better-sqlite3. The `dataDir` argument is a filesystem
 * path that PGlite uses as its data directory (equivalent to the old dbPath).
 * `isDowngrade()` queries the drizzle migrations table via PGlite.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

export interface MigrationResult {
	readonly applied: number;
	readonly schemaVersion: number;
}

/**
 * Count applied migrations from the drizzle_migrations table.
 * Returns 0 if the table does not exist.
 */
async function countAppliedMigrations(client: PGlite): Promise<number> {
	const checkResult = await client.query<{ exists: boolean }>(
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'drizzle'
			AND table_name = '__drizzle_migrations'
		) AS exists`,
	);
	const exists = checkResult.rows[0]?.exists ?? false;
	if (!exists) return 0;

	const countResult = await client.query<{ count: string }>(
		`SELECT COUNT(*) AS count FROM drizzle.__drizzle_migrations`,
	);
	return Number(countResult.rows[0]?.count ?? 0);
}

/**
 * Run all pending Drizzle migrations against the PGlite database at dataDir.
 *
 * Opens a dedicated PGlite instance, runs migrations, then closes it.
 * Does NOT seed — seeding is only for the setup-cli development workflow.
 *
 * @throws if the data directory does not contain a valid migrations journal.
 */
export async function applyMigrations(
	dataDir: string,
	migrationsFolder: string,
): Promise<MigrationResult> {
	// Validate the migrations folder exists before opening the DB
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	if (!fs.existsSync(migrationsFolder)) {
		throw new Error(`ENOENT: no such file or directory, open '${migrationsFolder}'`);
	}
	if (!fs.existsSync(journalPath)) {
		throw new Error(`ENOENT: no such file or directory, open '${journalPath}'`);
	}

	const client = new PGlite(dataDir);
	await client.waitReady;

	try {
		const countBefore = await countAppliedMigrations(client);
		const db = drizzle(client);
		await migrate(db, { migrationsFolder });
		const countAfter = await countAppliedMigrations(client);
		const applied = countAfter - countBefore;
		const schemaVersion = countAfter;
		return { applied, schemaVersion };
	} finally {
		await client.close();
	}
}

/**
 * Check if the database schema is newer than the bundled migrations.
 * Returns true if a downgrade is detected (DB has migrations the app
 * does not know about).
 *
 * Returns false if the data directory does not exist (fresh install).
 */
export async function isDowngrade(dataDir: string, migrationsFolder: string): Promise<boolean> {
	// Fresh install: no data directory yet
	if (!fs.existsSync(dataDir)) {
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

	const client = new PGlite(dataDir);
	await client.waitReady;
	try {
		const dbCount = await countAppliedMigrations(client);
		return dbCount > bundledCount;
	} finally {
		await client.close();
	}
}
