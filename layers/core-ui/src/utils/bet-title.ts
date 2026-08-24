/**
 * Bet title derivation — UI-layer copy of the pure string util.
 *
 * Canonical server-side version lives in @hyperidle/work (bet-title.ts).
 * Core-ui keeps a local copy to avoid importing across the service boundary.
 *
 * @lore AU44 batch7: presentation-format dissolved; this was deriveTitle there.
 */
export function deriveTitle(description: string, betId: string): string {
	const lines = description.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const stripped = trimmed.replace(/^#{1,6}\s+/, "");
		if (stripped) {
			return stripped.slice(0, 60);
		}
	}
	return betId;
}
