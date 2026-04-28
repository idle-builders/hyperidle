/**
 * GFM heading slug — pinned to github-slugger.
 *
 * Returns "<empty>" sentinel for empty / all-stripped / all-emoji input.
 * The angle brackets in the sentinel are stripped by the slugger if used as
 * heading text, so a literal "<root>" / "<empty>" heading cannot collide
 * with the sentinel value.
 */

import GithubSlugger from "github-slugger";

export const EMPTY_SLUG_SENTINEL = "<empty>";
export const ROOT_OUTLINE_SENTINEL = "<root>";

/**
 * Strip emoji code points (broad ranges covering common emoji blocks).
 * Emoji slugs would otherwise survive github-slugger as empty input → "".
 */
const EMOJI_RE =
	// biome-ignore lint/suspicious/noMisleadingCharacterClass: emoji ranges include surrogate pairs intentionally.
	/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

/**
 * @lore Per-call slugger instance — github-slugger holds an internal cache
 * keyed by previously-emitted slugs for de-duplication. Reusing a module-level
 * singleton with `.reset()` between calls is not safe under interleaved
 * concurrent execution (Promise.all, async iterators) because two interleaved
 * `slug()` calls would clobber each other's cache. `deriveBlocks` is pure and
 * tests its purity under interleaved conditions; instantiating per call
 * guarantees that property.
 */
export function slug(text: string): string {
	// Strip emoji first so all-emoji headings don't accidentally pass through.
	const stripped = text.replace(EMOJI_RE, "").trim();
	const slugger = new GithubSlugger();
	let out = slugger.slug(stripped);
	// Collapse runs of hyphens (github-slugger preserves `---` verbatim).
	out = out.replace(/-+/g, "-").replace(/^-|-$/g, "");
	if (!out) return EMPTY_SLUG_SENTINEL;
	return out;
}
