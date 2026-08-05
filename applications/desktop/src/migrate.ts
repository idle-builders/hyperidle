/**
 * N4 migration orchestrator for the desktop main process.
 * Calls into @hyperidle/db's applyMigrations and isDowngrade.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, isDowngrade } from "@hyperidle/db";
import { app } from "electron";

export interface MigrationOrchestrationResult {
	applied: number;
	schemaVersion: number;
}

/**
 * Resolve the migrations folder path.
 * In dev mode: relative to the monorepo framework/db/drizzle.
 * In packaged app (N5): relative to process.resourcesPath.
 *
 * @lore N4: ESM has no __dirname — we derive it from import.meta.url.
 * The `drizzle` folder lives at framework/db/drizzle relative to the monorepo root.
 *
 * @lore N5: In packaged app mode (app.isPackaged === true), import.meta.url
 * resolves to dist/main.cjs (esbuild CJS shim). We cannot use a relative path
 * from the bundle to find migrations. Instead, electron-builder copies the
 * drizzle/ folder to extraResources, making it available at
 * process.resourcesPath/drizzle. The app.isPackaged branch handles this.
 */
export function resolveMigrationsFolder(): string {
	if (app.isPackaged) {
		// Packaged app: migrations are in extraResources, accessible via
		// process.resourcesPath (set by Electron for the running app bundle).
		return path.join(process.resourcesPath, "drizzle");
	}
	// Dev mode: relative to the monorepo framework/db/drizzle.
	// This file lives at applications/desktop/src/migrate.ts.
	// The migrations folder lives at framework/db/drizzle.
	// Relative path: ../../../framework/db/drizzle from applications/desktop/src/
	const currentDir =
		typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(currentDir, "..", "..", "..", "framework", "db", "drizzle");
}

/**
 * Run migrations for the desktop app.
 * Checks for schema downgrade before running migrations.
 * Does NOT seed — desktop starts with empty database.
 *
 * @throws if schema downgrade detected or migration fails.
 */
export async function runMigrations(
	dbPath: string,
	migrationsFolder: string,
): Promise<MigrationOrchestrationResult> {
	if (await isDowngrade(dbPath, migrationsFolder)) {
		throw new Error(
			`Schema downgrade detected: the database at ${dbPath} was created by a newer version of the app. ` +
				"Please update the application or restore from a backup.",
		);
	}

	const result = await applyMigrations(dbPath, migrationsFolder);
	return { applied: result.applied, schemaVersion: result.schemaVersion };
}
