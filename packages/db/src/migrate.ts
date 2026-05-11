/**
 * Programmatic migration runner and downgrade protection.
 * Extracted from setup-cli so both the CLI and the Electron desktop share
 * a single migration code path.
 *
 * N4 stub — implementation pending.
 */

export interface MigrationResult {
	readonly applied: number;
	readonly schemaVersion: number;
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
	throw new Error("not implemented");
}

/**
 * Check if the database schema is newer than the bundled migrations.
 * Returns true if a downgrade is detected (DB has migrations the app
 * does not know about).
 *
 * Returns false if the database does not exist (fresh install).
 */
export function isDowngrade(dbPath: string, migrationsFolder: string): boolean {
	throw new Error("not implemented");
}
