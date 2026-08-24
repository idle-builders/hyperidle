/**
 * Bet title derivation — merged from framework/presentation-format (AU44 batch7).
 *
 * @lore Q3 W-3: deriveTitleFromPitch was previously duplicated in the server route (bets.ts).
 * @lore U1: Renamed `deriveTitleFromPitch` to `deriveTitle`, parameter `pitch` to `description`.
 * @lore AU44 batch7: moved from @hyperidle/presentation-format to @hyperidle/work (bet domain logic).
 */

/**
 * Derive a display title from the bet's description markdown.
 * Takes the first non-empty line, strips leading "# " (or "## " etc.) markers,
 * and truncates to 60 characters. Falls back to betId when no heading is found.
 *
 * @lore L14: description is freeform markdown so the first line may not be a heading.
 * The fallback (betId) ensures the API never returns an empty title field.
 */
export function deriveTitle(description: string, betId: string): string {
	const lines = description.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		// Strip any number of leading '#' chars followed by a space
		const stripped = trimmed.replace(/^#{1,6}\s+/, "");
		if (stripped) {
			return stripped.slice(0, 60);
		}
	}
	return betId;
}
