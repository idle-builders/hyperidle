/**
 * ArtifactThreadsSummary — L18 per-bet artifact thread summary section.
 *
 * Renders a compact list of artifact threads that have at least one message,
 * capped at 10 rows by the server. Includes empty stub and "+N more" affordance.
 *
 * Behaviour:
 * - Hides entirely when `data` is null (no artifacts on the bet yet)
 * - Renders an empty stub when `data.summaries` is empty (artifacts exist but
 *   none have thread messages)
 * - Renders a row per summary with artifact title, snippet, and message count
 * - Renders a "+N more" affordance when `data.truncated` is true
 *
 * @lore L18: The component deliberately does NOT fetch data — it consumes the
 * `useArtifactThreadSummary` hook internally to follow the same pattern as other
 * summary components in the shell layer.
 */

import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useArtifactThreadSummary } from "../hooks/useArtifactThreadSummary.js";

export interface ArtifactThreadsSummaryProps {
	betId: string;
}

/**
 * Format a relative time string for display. Returns a simple relative label.
 * @lore L18: No date library is used — we derive a simple relative approximation.
 */
function relativeTime(isoString: string): string {
	const diff = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function ArtifactThreadsSummary({ betId }: ArtifactThreadsSummaryProps): JSX.Element | null {
	const { data, isLoading } = useArtifactThreadSummary(betId);

	if (isLoading) {
		return (
			<div data-testid="artifact-threads-summary-loading" className="p-3">
				<div className="animate-pulse h-4 bg-[var(--surface-3)] rounded w-1/3" />
			</div>
		);
	}

	// Hide when data is null (bet has no artifacts at all)
	if (data === null) {
		return null;
	}

	const remaining = data.totalCount - data.summaries.length;

	return (
		<section
			data-testid="artifact-threads-summary"
			aria-label="Artifact threads"
			className="flex flex-col gap-2"
		>
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-lo)]">
				Artifact threads
			</h3>

			{data.summaries.length === 0 ? (
				<div
					data-testid="artifact-threads-summary-empty"
					className="text-sm text-[var(--text-lo)] px-3 py-2"
				>
					No artifact discussions yet.
				</div>
			) : (
				<ul className="flex flex-col gap-1">
					{data.summaries.map((summary) => (
						<li key={summary.artifactId}>
							<Link
								to={`/artifacts/${summary.artifactId}`}
								className="flex flex-col gap-0.5 px-3 py-2 rounded hover:bg-[var(--surface-2)] text-sm"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium text-[var(--text-hi)] truncate">
										{summary.artifactTitle}
									</span>
									<div className="flex items-center gap-2 shrink-0 text-xs text-[var(--text-lo)]">
										{summary.lastMessageAt && <span>{relativeTime(summary.lastMessageAt)}</span>}
										<span>{summary.messageCount}</span>
									</div>
								</div>
								{summary.lastMessageSnippet && (
									<span className="text-xs text-[var(--text-lo)] truncate">
										{summary.lastMessageSnippet}
									</span>
								)}
							</Link>
						</li>
					))}
				</ul>
			)}

			{data.truncated && remaining > 0 && (
				<Link
					data-testid="artifact-threads-summary-more"
					to={`/artifacts?betId=${betId}`}
					className="text-xs text-[var(--text-lo)] px-3 py-1 hover:text-[var(--text-hi)]"
				>
					+{remaining} more
				</Link>
			)}
		</section>
	);
}
