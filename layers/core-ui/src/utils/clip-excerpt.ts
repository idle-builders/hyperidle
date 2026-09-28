const EXCERPT_MAX = 120;

export function clipExcerpt(text: string, max = EXCERPT_MAX): string {
	if (text.length <= max) return text;
	let end = max;
	while (end > 0 && text[end] !== " ") {
		end--;
	}
	const clipped = end === 0 ? text.slice(0, max) : text.slice(0, end);
	return `${clipped.trimEnd()}…`;
}
