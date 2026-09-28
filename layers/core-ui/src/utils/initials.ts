export function deriveInitials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length === 1) return (words[0]?.[0] ?? "?").toUpperCase();
	return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}
