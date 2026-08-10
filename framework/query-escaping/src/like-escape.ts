/**
 * Escape LIKE-pattern metacharacters so a user-supplied substring is
 * matched literally.
 *
 * Z8-156: comment corrected from "SQLite" to reflect the actual stack
 * (Postgres/PGlite). Postgres LIKE recognizes the same metacharacters:
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
 *
 * @lore AU29: moved verbatim from `framework/db/src/like-escape.ts`. This
 * function touches no database — no SQL, no schema, no connection — so it
 * never belonged to the database package's surface (the `db:util` ANOMALY
 * `tools/governance/architecture.json` flagged since AU28). It is pure string
 * substrate, which is why it has a framework package of its own.
 */
export function escapeLikePattern(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
