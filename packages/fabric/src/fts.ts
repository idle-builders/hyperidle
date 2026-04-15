import type { HyperIdleDb } from "@hyperidle/db";

/**
 * Creates the FTS5 virtual table and triggers to keep it in sync
 * with the knowledge_items table.
 *
 * Must be called once per database connection (FTS5 virtual tables
 * are not managed by Drizzle migrations).
 */
export function setupFts(db: HyperIdleDb): void {
	// Access the underlying better-sqlite3 instance via Drizzle internals
	// biome-ignore lint/suspicious/noExplicitAny: accessing internal Drizzle session for raw SQL
	const session = (db as any).session;
	const sqlite = session.client;
	const exec = (sql: string): void => {
		sqlite.exec(sql);
	};

	exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_items_fts
		USING fts5(title, body, content='knowledge_items', content_rowid='rowid');
	`);

	// Triggers to keep FTS in sync
	exec(`
		CREATE TRIGGER IF NOT EXISTS ki_fts_insert AFTER INSERT ON knowledge_items BEGIN
			INSERT INTO knowledge_items_fts(rowid, title, body) VALUES (NEW.rowid, NEW.title, NEW.body);
		END;
	`);

	exec(`
		CREATE TRIGGER IF NOT EXISTS ki_fts_update AFTER UPDATE ON knowledge_items BEGIN
			INSERT INTO knowledge_items_fts(knowledge_items_fts, rowid, title, body) VALUES('delete', OLD.rowid, OLD.title, OLD.body);
			INSERT INTO knowledge_items_fts(rowid, title, body) VALUES (NEW.rowid, NEW.title, NEW.body);
		END;
	`);

	exec(`
		CREATE TRIGGER IF NOT EXISTS ki_fts_delete AFTER DELETE ON knowledge_items BEGIN
			INSERT INTO knowledge_items_fts(knowledge_items_fts, rowid, title, body) VALUES('delete', OLD.rowid, OLD.title, OLD.body);
		END;
	`);
}

export interface FtsSearchOptions {
	limit?: number;
	offset?: number;
}

/**
 * Raw FTS5 search returning matching knowledge_item IDs ranked by relevance.
 */
export function ftsSearch(
	db: HyperIdleDb,
	query: string,
	options: FtsSearchOptions = {},
): string[] {
	const { limit = 50, offset = 0 } = options;

	// biome-ignore lint/suspicious/noExplicitAny: accessing internal Drizzle session for raw SQL
	const session = (db as any).session;
	const sqlite = session.client;

	const stmt = sqlite.prepare(`
		SELECT ki.id
		FROM knowledge_items_fts fts
		JOIN knowledge_items ki ON ki.rowid = fts.rowid
		WHERE knowledge_items_fts MATCH ?
		ORDER BY rank
		LIMIT ? OFFSET ?
	`);

	const rows = stmt.all(query, limit, offset) as Array<{ id: string }>;
	return rows.map((r) => r.id);
}
