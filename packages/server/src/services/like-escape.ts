/**
 * Escape SQLite LIKE-pattern metacharacters so a user-supplied substring is
 * matched literally.
 *
 * SQLite's LIKE recognizes:
 *   - `%` — match any sequence (including empty)
 *   - `_` — match any single character
 *   - the escape character (we use `\`) when paired with `ESCAPE '\\'` in the
 *     SQL clause; without that paring, the backslash is literal.
 *
 * The escape MUST be applied to `\` first; otherwise we'd double-escape the
 * backslashes we ourselves inserted while escaping `%` and `_`.
 *
 * @lore I2 V4: previously `routes/knowledge.ts` built `\`%${q}%\`` from raw
 * input. A query of `_` matched every row (single-char wildcard) and `%`
 * matched every row (any sequence). The escape character must be declared
 * to SQLite via the LIKE clause's `ESCAPE '\\'` modifier.
 */
export const LIKE_ESCAPE_CHAR = "\\";

export function escapeLikePattern(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
