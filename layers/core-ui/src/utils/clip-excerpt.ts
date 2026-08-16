/**
 * UI-100/101: Word-boundary excerpt clipping.
 *
 * Clips a plain-text string to at most EXCERPT_MAX characters, breaking only
 * at a word boundary (walks back to the last space) and appending an ellipsis
 * when clipped. Falls back to a hard character cut if no space is found within
 * the limit.
 *
 * @lore UI-100: The previous inline `.slice(0, 120)` cut mid-word with no
 * ellipsis, producing "users respond to vi" / "6 or 8 days depen". This
 * utility replaces it with a space-seeking walk-back that always produces
 * a readable excerpt.
 */

const EXCERPT_MAX = 120;

/**
 * Clip `text` to at most `EXCERPT_MAX` characters at a word boundary,
 * appending "…" when truncated.
 *
 * Returns the original string when it is at or below the limit.
 */
export function clipExcerpt(text: string, max = EXCERPT_MAX): string {
	if (text.length <= max) return text;
	let end = max;
	while (end > 0 && text[end] !== " ") {
		end--;
	}
	const clipped = end === 0 ? text.slice(0, max) : text.slice(0, end);
	return `${clipped.trimEnd()}…`;
}
