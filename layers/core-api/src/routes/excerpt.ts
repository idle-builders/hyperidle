/** Characters kept on each side of the match. */
const AROUND = 60;

/**
 * The stretch of `text` around the first match of `query`, ignoring case, as plain words: Markdown
 * marks and line breaks dropped, cut at word ends with "…" where it was cut. Null when nothing
 * matches.
 */
export function excerpt(text: string, query: string): string | null {
	const plain = text
		.replace(/[#*`>]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const at = plain.toLowerCase().indexOf(query.toLowerCase());
	if (at < 0) return null;
	let start = Math.max(0, at - AROUND);
	let end = Math.min(plain.length, at + query.length + AROUND);
	if (start > 0) start = plain.indexOf(" ", start) + 1 || start;
	if (end < plain.length)
		end = plain.lastIndexOf(" ", end) > at ? plain.lastIndexOf(" ", end) : end;
	return `${start > 0 ? "…" : ""}${plain.slice(start, end).trim()}${end < plain.length ? "…" : ""}`;
}
