/**
 * deriveInitials — AI5 E5: canonical avatar-initials derivation.
 *
 * @lore AI5: Consolidates 3 distinct inline algorithms across 6 sites
 * (slice+upper, bare slice, word-initials) into ONE rendering, per AC1
 * "identity renders identically everywhere". Canonical algorithm =
 * `slice(0,2)` (the majority form), NOT word-initials. The intentional
 * delta: WorkBet used word-initials ("Growth Team" → "GT"); now slice
 * ("GR"). DS Avatar stays a dumb renderer taking pre-derived initials —
 * derivation lives in the web layer (concept rejection list).
 *
 *   deriveInitials("Ada Lovelace") === "AD"   (slice, not "AL")
 *   deriveInitials("  x ")        === "X"
 *   deriveInitials("")            === "?"
 */
export function deriveInitials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";
	return trimmed.slice(0, 2).toUpperCase();
}
