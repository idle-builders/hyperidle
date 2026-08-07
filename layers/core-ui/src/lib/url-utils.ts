/**
 * Shared URL utility functions for the web package.
 */

/**
 * L19: Validates that a harness URL is safe to render as an href.
 * Rejects non-http(s) protocols to prevent XSS via javascript:// or similar.
 * Case-insensitive scheme check to handle HTTPS:// and HTTP://.
 *
 * @lore L19: Extracted from WorkBet.tsx and TaskSheet.tsx to avoid duplication.
 * Both components display harness jump-out links and need the same security guard.
 */
export function isValidHarnessUrl(url: string): boolean {
	const lower = url.toLowerCase();
	return lower.startsWith("http://") || lower.startsWith("https://");
}
