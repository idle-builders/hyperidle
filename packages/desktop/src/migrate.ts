/**
 * N4 migration orchestrator for the desktop main process.
 * Calls into @hyperidle/db's applyMigrations and isDowngrade.
 *
 * N4 stub — implementation pending.
 */

export interface MigrationOrchestrationResult {
	applied: number;
	schemaVersion: number;
}

/**
 * Resolve the migrations folder path.
 * In dev mode: relative to the monorepo packages/db/drizzle.
 * In packaged app (N5): relative to process.resourcesPath.
 */
export function resolveMigrationsFolder(): string {
	throw new Error("not implemented");
}

/**
 * Run migrations for the desktop app.
 * Checks for schema downgrade before running migrations.
 * Does NOT seed — desktop starts with empty database.
 *
 * @throws if schema downgrade detected or migration fails.
 */
export function runMigrations(
	_dbPath: string,
	_migrationsFolder: string,
): MigrationOrchestrationResult {
	throw new Error("not implemented");
}
