/**
 * Escape SQLite LIKE-pattern metacharacters so a user-supplied substring is
 * matched literally.
 *
 * SQLite's LIKE recognizes:
 *   - `%` — match any sequence (including empty)
 *   - `_` — match any single character
 *   - the escape character (we use `\`) when paired with `ESCAPE '\\'` in the
 *     SQL clause; without that pairing, the backslash is literal.
 *
 * Callers MUST append `ESCAPE '\\'` to the LIKE clause they build with the
 * returned pattern. The backslash is escaped first so the `\` chars we
 * insert while escaping `%` and `_` are not double-escaped.
 *
 * @lore I2 V4: previously `routes/knowledge.ts` built `\`%${q}%\`` from raw
 * input. A query of `_` matched every row (single-char wildcard) and `%`
 * matched every row (any sequence).
 */
export function escapeLikePattern(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
