/**
 * Q3 — Bet formatting utilities shared between server and web client.
 *
 * @lore Q3 W-3 design critique: deriveTitleFromPitch was previously duplicated
 * in the server route (bets.ts). Moving it here eliminates duplication and lets
 * the BetCreateDialog preview use the same logic as the canvas endpoint.
 *
 * @lore U1: Renamed `deriveTitleFromPitch` to `deriveTitle`, parameter `pitch`
 * to `description`. The old name is kept as a deprecated alias for consumers
 * that haven't migrated yet.
 */

/**
 * Derive a display title from the bet's description markdown.
 * Takes the first non-empty line, strips leading "# " (or "## " etc.) markers,
 * and truncates to 60 characters. Falls back to betId when no heading is found.
 *
 * @lore L14: description is freeform markdown so the first line may not be a heading.
 * The fallback (betId) ensures the API never returns an empty title field.
 *
 * @lore U1: Renamed from `deriveTitleFromPitch`. Parameter renamed from `pitch`
 * to `description`. Semantics are identical.
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

