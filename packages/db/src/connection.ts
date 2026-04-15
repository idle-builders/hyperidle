import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type HyperIdleDb = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(path: string): HyperIdleDb {
	const sqlite = new Database(path);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	return drizzle(sqlite, { schema });
}
