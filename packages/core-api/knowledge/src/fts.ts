import type { HyperIdleDb } from "@hyperidle/db";
import { sql } from "drizzle-orm";

// @lore PGlite migration: Replaced SQLite FTS5 with Postgres tsvector/tsquery.
// PGlite supports standard Postgres full-text search natively. The tsvector
// column + GIN index approach is simpler than FTS5 (no virtual tables or
// triggers) and uses Postgres' built-in text search dictionaries.

/**
 * Creates a generated tsvector column and GIN index on knowledge_items
 * for full-text search. Idempotent — safe to call on every connection.
 */
async function initializeTextSearch(db: HyperIdleDb): Promise<void> {
	await db.execute(sql`
		ALTER TABLE knowledge_items
		ADD COLUMN IF NOT EXISTS fts_vector tsvector
		GENERATED ALWAYS AS (
			to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
		) STORED
	`);

	await db.execute(sql`
		CREATE INDEX IF NOT EXISTS knowledge_items_fts_idx
		ON knowledge_items USING gin(fts_vector)
	`);
}

interface FtsSearchOptions {
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
const FTS_MAX_QUERY_CHARS = 1024;

/**
 * Maximum number of tokens kept after splitting. @lore I3 review sec
 * MEDIUM-5: FTS5 query parser cost grows non-linearly with phrase
 * count; 64 tokens is more than any natural query and bounds the
 * parser cost.
 */
const FTS_MAX_TOKENS = 64;

/**
 * Sanitise a user-supplied query string for Postgres tsquery.
 *
 * Tokenization: whitelist word-chars + internal `-`, `_`; emit each
 * surviving token joined with `&` (AND). A trailing `*` on a token is
 * preserved as the Postgres prefix-match operator (:*). Returns `""`
 * when all tokens are stripped — callers MUST short-circuit to `[]`.
 *
 * Bounds: input is truncated at FTS_MAX_QUERY_CHARS, token list at
 * FTS_MAX_TOKENS — anti-DoS, see sec MEDIUM-5.
 *
 * @lore I3 (TRACK-I.md L151-154): prior implementation passed raw input to
 * MATCH, enabling operator injection. Keeping hyphens/underscores/apostrophes
 * internal preserves meaningful identifier tokens like `react-router`, `my_var`.
 *
 * @lore PGlite migration: Postgres tsquery uses `&` (AND), `|` (OR), `!` (NOT),
 * `:*` (prefix). We emit sanitized tokens joined with `&` for AND semantics.
 */
function sanitizeFtsQuery(input: string): string {
	if (typeof input !== "string") return "";
	let trimmed = input.trim();
	if (trimmed.length === 0) return "";
	if (trimmed.length > FTS_MAX_QUERY_CHARS) {
		trimmed = trimmed.slice(0, FTS_MAX_QUERY_CHARS);
	}

	const rawTokens = trimmed.split(/\s+/u).slice(0, FTS_MAX_TOKENS);
	const sanitized: string[] = [];

	for (const raw of rawTokens) {
		const isPrefix = raw.endsWith("*") && raw.length > 1;
		const stripped = isPrefix ? raw.slice(0, -1) : raw;

		let token = stripped.replace(/[^\p{L}\p{N}_-]/gu, "");
		token = token.replace(/^[-]+|[-]+$/gu, "");
		if (token.length === 0) continue;

		if (isPrefix) {
			sanitized.push(`${token}:*`);
		} else {
			sanitized.push(token);
		}
	}

	return sanitized.join(" & ");
}

/**
 * Full-text search returning matching knowledge_item IDs ranked by relevance.
 * User input is sanitised before being passed to tsquery.
 */
async function executeTextSearch(
	db: HyperIdleDb,
	query: string,
	options: FtsSearchOptions = {},
): Promise<string[]> {
	await initializeTextSearch(db);
	const { limit = 50, offset = 0 } = options;

	const sanitized = sanitizeFtsQuery(query);
	if (sanitized.length === 0) {
		return [];
	}

	const result = await db.execute(sql`
		SELECT id
		FROM knowledge_items
		WHERE fts_vector @@ to_tsquery('english', ${sanitized})
		ORDER BY ts_rank(fts_vector, to_tsquery('english', ${sanitized})) DESC
		LIMIT ${limit} OFFSET ${offset}
	`);

	const rows = (result as { rows: Array<{ id: string }> }).rows;
	return rows.map((r) => r.id);
}

export { executeTextSearch, FTS_MAX_QUERY_CHARS, FTS_MAX_TOKENS, sanitizeFtsQuery };
