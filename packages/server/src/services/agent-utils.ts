/**
 * Shared utility functions for agent name formatting.
 *
 * @lore AA1: `deriveInitials` was duplicated in teams-routes.ts and
 * routines-routes.ts. Extracted here to a single canonical implementation.
 */

/**
 * Derive 2-letter initials from an agent display name.
 * Multi-word names: first letter of word 1 + first letter of word 2, uppercased.
 * Single-word names: first two characters, uppercased.
 */
export function deriveInitials(name: string): string {
	const words = name.trim().split(/\s+/);
	const [first, second] = words;
	if (first && second) {
		return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}
