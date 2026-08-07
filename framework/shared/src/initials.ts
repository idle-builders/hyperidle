/**
 * Derive 2-letter initials from an agent display name.
 *
 * Multi-word names: first letter of word 1 + first letter of word 2, uppercased.
 * Single-word names: first two characters, uppercased.
 *
 * @lore AU20 Ab4: moved from `@hyperidle/agent-selection`'s `agent-utils.ts`
 * to `@hyperidle/shared` — display-name formatting carries no selection policy
 * and should live with other display utilities. Web already implements the same
 * logic in `layers/core-ui/src/utils/initials.ts` (slightly different slice
 * semantics — the shared version is the server-side canonical form).
 */
export function deriveInitials(name: string): string {
	const words = name.trim().split(/\s+/);
	const [first, second] = words;
	if (first && second) {
		return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}
