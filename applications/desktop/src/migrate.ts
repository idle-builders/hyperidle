import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, isDowngrade } from "@hyperidle/db";
import { app } from "electron";

export interface MigrationOrchestrationResult {
	applied: number;
	schemaVersion: number;
}

// @lore: packaged app — import.meta.url → dist/main.cjs (esbuild CJS shim); migrations at process.resourcesPath/drizzle via electron-builder extraResources
export function resolveMigrationsFolder(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "drizzle");
	}
	const currentDir =
		typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(currentDir, "..", "..", "..", "framework", "db", "drizzle");
}

/** Does NOT seed — desktop starts with empty database. */
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
