// Postgres migration runner for the shared-cluster (cloud) profile.
//
// Why not `drizzle-kit migrate` / drizzle's built-in migrator? Both run
// `CREATE SCHEMA IF NOT EXISTS` for their migrations-tracking table, which
// requires CREATE on the *database*. The platform's tenant role is schema-scoped
// (owns the `hyperidle` schema, no database-level CREATE), so that fails with
// "permission denied for database" even though the schema already exists.
//
// This runner instead creates the tracking table directly in the current
// search_path schema (the tenant schema) via CREATE TABLE — no CREATE SCHEMA.
// Migrations are schema-neutral (no hardcoded `public.`) and resolve through
// search_path. Application is by journal timestamp, matching drizzle's semantics.

import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { resolvePostgresSsl, sanitizePostgresUrl } from "./pg-ssl.js";

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is required");
	}

	const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
	const migrations = readMigrationFiles({ migrationsFolder });

	const sql = postgres(sanitizePostgresUrl(url), {
		ssl: resolvePostgresSsl(url),
		max: 1,
	});

	try {
		// Tracking table lives in the search_path (tenant) schema. No CREATE SCHEMA.
		await sql.unsafe(
			`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)`,
		);
		const rows = await sql.unsafe(
			`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
		);
		const last = Number(rows[0]?.created_at ?? 0);

		let applied = 0;
		for (const migration of migrations) {
			if (Number(migration.folderMillis) <= last) continue;
			await sql.begin(async (tx) => {
				for (const statement of migration.sql) {
					await tx.unsafe(statement);
				}
				await tx.unsafe(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`, [
					migration.hash,
					migration.folderMillis,
				]);
			});
			applied++;
		}
		process.stdout.write(`migrate-pg: applied ${applied} migration(s)\n`);
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().catch((err: unknown) => {
	process.stderr.write(`migrate-pg: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
