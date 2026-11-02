/**
 * Put what was said between the text before and after the cursor, with one space where words
 * would otherwise run together. The caret goes right after the spoken words.
 */
export function putSpoken(
	before: string,
	said: string,
	after: string,
): { text: string; caret: number } {
	if (said === "") return { text: before + after, caret: before.length };
	const lead = before !== "" && !/\s$/.test(before) ? " " : "";
	const tail = /^[^\s.,;:!?)]/.test(after) ? " " : "";
	const head = before + lead + said;
	return { text: head + tail + after, caret: head.length };
}
