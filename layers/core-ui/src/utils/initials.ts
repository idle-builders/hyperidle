/**
 * deriveInitials — AI5 E5: canonical avatar-initials derivation.
 *
 * @lore AI5: Consolidates 3 distinct inline algorithms across 6 sites
 * (slice+upper, bare slice, word-initials) into ONE rendering, per AC1
 * "identity renders identically everywhere". Original canonical algorithm
 * was `slice(0,2)` (the majority form at the time). Reversed by founder
 * ruling 2026-08-16: switched to word-initials because all five Acme
 * team agents shared "AC" initials (their names share the team prefix),
 * making the agent roster unreadable. "Acme Builder" → "AB",
 * "Maya Chen" → "MC", single word "Founder" → "F". Also affects user
 * avatars — intentional (same readability problem applies).
 * DS Avatar stays a dumb renderer taking pre-derived initials —
 * derivation lives in the web layer (concept rejection list).
 *
 *   deriveInitials("Ada Lovelace") === "AL"
 *   deriveInitials("Maya Chen")   === "MC"
 *   deriveInitials("Founder")     === "F"
 *   deriveInitials("  x ")        === "X"
 *   deriveInitials("")            === "?"
 */
export function deriveInitials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length === 1) return (words[0]?.[0] ?? "?").toUpperCase();
	return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}
