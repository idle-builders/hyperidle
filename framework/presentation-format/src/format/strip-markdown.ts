/**
 * stripMarkdown — remove common markdown syntax from a string so raw markdown
 * body text can be shown as a plain-text preview without leaking syntax characters.
 *
 * Handles: ATX headings (#), setext headings underlines (===, ---), bold/italic
 * (`**`, `__`, `*`, `_`), inline code backticks, fenced code blocks, blockquotes,
 * unordered list bullets (-, *, +), ordered list numbers, link syntax [text](url),
 * image syntax ![alt](url), horizontal rules.
 *
 * Preserves normal punctuation and plain prose — the goal is a readable subtitle,
 * not perfect round-trip markdown removal.
 *
 * @lore UI-046: knowledge item `body` is raw markdown stored by agents/users.
 * Without stripping, headers like "## Summary" and bullets appear verbatim in
 * list-row subtitles. Added to presentation-format (not core-ui) so any layer can
 * call the same helper.
 */

export function stripMarkdown(input: string): string {
	let s = input;

	// Remove fenced code blocks (``` or ~~~)
	s = s.replace(/^```[\s\S]*?```/gm, "");
	s = s.replace(/^~~~[\s\S]*?~~~/gm, "");

	// Remove ATX headings (# ## ### etc.)
	s = s.replace(/^#{1,6}\s+/gm, "");

	// Remove setext heading underlines (=== or ---)
	s = s.replace(/^[=-]{3,}\s*$/gm, "");

	// Remove blockquotes
	s = s.replace(/^>\s?/gm, "");

	// Remove horizontal rules
	s = s.replace(/^(\*{3,}|-{3,}|_{3,})\s*$/gm, "");

	// Remove images ![alt](url)
	s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

	// Remove links [text](url) → keep text
	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

	// Remove inline code
	s = s.replace(/`([^`]*)`/g, "$1");

	// Remove bold+italic ***text*** or ___text___
	s = s.replace(/\*{3}([^*]+)\*{3}/g, "$1");
	s = s.replace(/_{3}([^_]+)_{3}/g, "$1");

	// Remove bold **text** or __text__
	s = s.replace(/\*{2}([^*]+)\*{2}/g, "$1");
	s = s.replace(/_{2}([^_]+)_{2}/g, "$1");

	// Remove italic *text* or _text_ (paired markers)
	s = s.replace(/\*([^*]+)\*/g, "$1");
	s = s.replace(/_([^_]+)_/g, "$1");

	// Remove dangling/unclosed emphasis markers (single * or _ with no closing match)
	// These appear in truncated excerpts like "answer *what are user…"
	s = s.replace(/(?<!\*)\*(?!\*)/g, "");
	s = s.replace(/(?<!_)_(?!_)/g, "");

	// Remove list bullets (unordered: -, *, +)
	s = s.replace(/^[\s]*[-*+]\s+/gm, "");

	// Remove ordered list numbers
	s = s.replace(/^[\s]*\d+\.\s+/gm, "");

	// Collapse multiple blank lines / trim
	s = s
		.replace(/\n{2,}/g, " ")
		.replace(/\n/g, " ")
		.trim();

	// Collapse multiple spaces
	s = s.replace(/\s{2,}/g, " ");

	return s;
}
