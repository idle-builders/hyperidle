/**
 * Shared relative time formatter for agent activity and team views.
 *
 * Converts an ISO 8601 timestamp to a human-readable relative string:
 *   <60s → "just now"
 *   1–59m → "Nm ago"
 *   1–23h → "Nh ago"
 *   1+d   → "Nd ago"
 *
 * The `now` parameter is injectable for deterministic tests.
 *
 * @lore AB1 S3: Extracted from AgentProfile.tsx and WorkTeam.tsx where both
 * defined their own formatRelativeTime. WorkTeam's version includes seconds
 * granularity — this is the more comprehensive version.
 */

/**
 * Format an ISO datetime string as a human-readable relative time label.
 *
 * @param isoString - ISO 8601 timestamp string
 * @param now - Current time in ms epoch (defaults to Date.now())
 */
export function formatRelativeTime(isoString: string, now?: number): string {
	const diffMs = (now ?? Date.now()) - new Date(isoString).getTime();
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.floor(diffHr / 24);
	return `${diffDay}d ago`;
}
