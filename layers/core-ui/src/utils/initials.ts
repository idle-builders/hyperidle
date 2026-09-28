// @lore: word-initials not slice(0,2) — team-prefix names share first two chars, making avatar rosters unreadable; derivation lives in web layer
export function deriveInitials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length === 1) return (words[0]?.[0] ?? "?").toUpperCase();
	return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}
