/**
 * Q3 — Bet formatting utilities shared between server and web client.
 *
 * @lore Q3 W-3 design critique: deriveTitleFromPitch was previously duplicated
 * in the server route (bets.ts). Moving it here eliminates duplication and lets
 * the BetCreateDialog preview use the same logic as the canvas endpoint.
 */

/**
 * Derive a display title from the bet's pitch markdown.
 * Takes the first non-empty line, strips leading "# " (or "## " etc.) markers,
 * and truncates to 60 characters. Falls back to betId when no heading is found.
 *
 * @lore L14: pitch is freeform markdown so the first line may not be a heading.
 * The fallback (betId) ensures the API never returns an empty title field.
 */
export function deriveTitleFromPitch(pitch: string, betId: string): string {
	const lines = pitch.split("\n");
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
