import { sql } from "drizzle-orm";
import { type HyperIdleDb, createDb } from "./connection.js";

export function createTestDb(): HyperIdleDb {
	const db = createDb(":memory:");

	db.run(sql`
		CREATE TABLE factory_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`);

	return db;
}
