/**
 * N4 migration orchestrator for the desktop main process.
 * Calls into @hyperidle/db's applyMigrations and isDowngrade.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, isDowngrade } from "@hyperidle/db";

export interface MigrationOrchestrationResult {
	applied: number;
	schemaVersion: number;
}

/**
 * Resolve the migrations folder path.
 * In dev mode: relative to the monorepo packages/db/drizzle.
 * In packaged app (N5): relative to process.resourcesPath.
 *
 * @lore N4: ESM has no __dirname — we derive it from import.meta.url.
 * The `drizzle` folder lives at packages/db/drizzle relative to the monorepo root.
 */
export function resolveMigrationsFolder(): string {
	// In the monorepo, this file lives at packages/desktop/src/migrate.ts.
	// The migrations folder lives at packages/db/drizzle.
	// Relative path: ../../../db/drizzle from packages/desktop/src/
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(currentDir, "..", "..", "db", "drizzle");
}

/**
 * Run migrations for the desktop app.
 * Checks for schema downgrade before running migrations.
 * Does NOT seed — desktop starts with empty database.
 *
 * @throws if schema downgrade detected or migration fails.
 */
export function runMigrations(
	dbPath: string,
	migrationsFolder: string,
): MigrationOrchestrationResult {
	if (isDowngrade(dbPath, migrationsFolder)) {
		throw new Error(
			`Schema downgrade detected: the database at ${dbPath} was created by a newer version of the app. ` +
				"Please update the application or restore from a backup.",
		);
	}

	const result = applyMigrations(dbPath, migrationsFolder);
	return { applied: result.applied, schemaVersion: result.schemaVersion };
}
