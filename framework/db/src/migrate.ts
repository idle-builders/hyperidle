import * as fs from "node:fs";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

export interface MigrationResult {
	readonly applied: number;
	readonly schemaVersion: number;
}

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

/** Does NOT seed — seeding is only for the setup-cli development workflow. */
export async function applyMigrations(
	dataDir: string,
	migrationsFolder: string,
): Promise<MigrationResult> {
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

/** Returns true when the DB has applied migrations the bundled journal doesn't know about. Returns false on fresh install. */
export async function isDowngrade(dataDir: string, migrationsFolder: string): Promise<boolean> {
	if (!fs.existsSync(dataDir)) {
		return false;
	}

	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	let bundledCount = 0;
	try {
		const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
			entries: unknown[];
		};
		bundledCount = journal.entries.length;
	} catch {
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
