/**
 * A role is a string on an agent — a plugin or a person introduces one by
 * creating an agent with it; there is no catalog. This derives a display
 * label from any role string: split on `_`, `-` or whitespace and
 * title-case each word ("growth_hacker" → "Growth Hacker"). Blank → "", so
 * the caller picks its own fallback.
 */
export function roleLabel(role: string): string {
	const trimmed = role.trim();
	if (!trimmed) return "";

	return trimmed
		.split(/[_\s-]+/)
		.filter((w) => w.length > 0)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
