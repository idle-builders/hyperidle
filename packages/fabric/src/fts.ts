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
 * Maximum input length for FTS sanitisation (chars). Beyond this we
 * truncate (not throw) so a flooded query degrades to a partial match
 * rather than blowing up. @lore I3 review sec MEDIUM-5: cost-amplification
 * DoS guard. Agents are first-party today, so a hard limit is preferred
 * over a rate-limit. 1024 chars accommodates long natural-language
 * queries while bounding regex/split cost.
 */
export const FTS_MAX_QUERY_CHARS = 1024;

/**
 * Maximum number of tokens kept after splitting. @lore I3 review sec
 * MEDIUM-5: FTS5 query parser cost grows non-linearly with phrase
 * count; 64 tokens is more than any natural query and bounds the
 * parser cost.
 */
export const FTS_MAX_TOKENS = 64;

/**
 * Sanitise a user-supplied query string for FTS5 `MATCH`.
 *
 * Strategy: whitelist word-chars + internal `-`, `_`, `'`; lowercase operator
 * keywords (`AND/OR/NOT/NEAR`); wrap each surviving token in double quotes so
 * FTS5 treats it as a literal phrase. A trailing `*` on a token is preserved
 * as the FTS5 prefix-match operator (W5: prefix search support). Returns
 * `""` when all tokens are stripped — callers MUST short-circuit to `[]` on
 * empty output rather than running `MATCH ''` (which throws "syntax error").
 *
 * Bounds: input is truncated at FTS_MAX_QUERY_CHARS, token list at
 * FTS_MAX_TOKENS — anti-DoS, see sec MEDIUM-5.
 *
 * @lore I3 (TRACK-I.md L151-154): prior implementation passed raw input to
 * MATCH, enabling operator injection (`*`, `"…"`, `AND/OR/NOT/NEAR`, `()`,
 * `{}`, `^`). Keeping hyphens/underscores/apostrophes internal preserves
 * meaningful identifier tokens like `react-router`, `my_var`, `don't`.
 *
 * @lore I3 review W5: prefix search via trailing `*`. Strategy: detect
 * `token*` BEFORE the operator-strip pass, emit `"token" *` (FTS5
 * concatenates a literal phrase + the prefix-match suffix). The `*` only
 * survives when it directly suffixes a sanitised token; standalone `*`
 * or leading `*` is stripped (matches no rows, the previous behaviour).
 */
export function sanitizeFtsQuery(input: string): string {
	if (typeof input !== "string") return "";
	let trimmed = input.trim();
	if (trimmed.length === 0) return "";
	// Anti-DoS: truncate before the regex pass.
	if (trimmed.length > FTS_MAX_QUERY_CHARS) {
		trimmed = trimmed.slice(0, FTS_MAX_QUERY_CHARS);
	}

	// Split on whitespace. Each token gets its operator-relevant chars stripped.
	const rawTokens = trimmed.split(/\s+/u).slice(0, FTS_MAX_TOKENS);
	const OPERATOR_WORDS = new Set(["and", "or", "not", "near"]);
	const sanitized: string[] = [];

	for (const raw of rawTokens) {
		// W5: detect & preserve a trailing `*` for prefix search. The `*`
		// must be the FINAL char of the raw token — `*foo` and `f*o` are
		// not prefix queries and have their `*` stripped by the whitelist.
		const isPrefix = raw.endsWith("*") && raw.length > 1;
		const stripped = isPrefix ? raw.slice(0, -1) : raw;

		// Keep letters, digits, underscore, hyphen, apostrophe. Drop
		// everything else (FTS5 operators: * " ( ) { } ^ : +, and any other
		// punctuation).
		let token = stripped.replace(/[^\p{L}\p{N}_\-']/gu, "");
		// Trim leading/trailing hyphens/apostrophes — only *internal* ones
		// are meaningful. `react-router` → keep; `-foo` → `foo`.
		token = token.replace(/^['-]+|['-]+$/gu, "");
		if (token.length === 0) continue;

		// Lowercase operator words so FTS5 treats them as literals (FTS5
		// operators are case-sensitive uppercase).
		if (OPERATOR_WORDS.has(token.toLowerCase())) {
			token = token.toLowerCase();
		}

		if (isPrefix) {
			// FTS5 prefix syntax is `token*` (no quotes). Emit it bare —
			// quoting would defeat the prefix operator.
			sanitized.push(`${token}*`);
		} else {
			// Wrap in double quotes → literal phrase.
			sanitized.push(`"${token}"`);
		}
	}

	return sanitized.join(" ");
}

/**
 * Raw FTS5 search returning matching knowledge_item IDs ranked by relevance.
 * User input is sanitised before being passed to `MATCH`.
 */
export function ftsSearch(
	db: HyperIdleDb,
	query: string,
	options: FtsSearchOptions = {},
): string[] {
	const { limit = 50, offset = 0 } = options;

	const sanitized = sanitizeFtsQuery(query);
	if (sanitized.length === 0) {
		return [];
	}

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

	const rows = stmt.all(sanitized, limit, offset) as Array<{ id: string }>;
	return rows.map((r) => r.id);
}
