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

import { ErrorState } from "@hyperidle/design-system";
import { relativeShort } from "@hyperidle/shared";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useArtifactThreadSummary } from "../hooks/useArtifactThreadSummary.js";

export interface ArtifactThreadsSummaryProps {
	betId: string;
}

export function ArtifactThreadsSummary({ betId }: ArtifactThreadsSummaryProps): JSX.Element | null {
	const { data, error, isLoading } = useArtifactThreadSummary(betId);

	if (isLoading) {
		return (
			<div data-testid="artifact-threads-summary-loading" className="p-3">
				<div className="animate-pulse h-4 bg-[var(--surface-elevated)] rounded w-1/3" />
			</div>
		);
	}

	// M3: surface error state when hook errors (design: ErrorState row inside section)
	if (error !== null) {
		return (
			<section
				data-testid="artifact-threads-summary"
				aria-label="Artifact discussion"
				className="flex flex-col gap-2"
			>
				<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
					ARTIFACT DISCUSSION
				</h3>
				<ErrorState
					title="Could not load artifact discussion"
					description="An error occurred while loading artifact discussions for this bet."
					dataTestId="artifact-threads-summary-error"
				/>
			</section>
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
			aria-label="Artifact discussion"
			className="flex flex-col gap-2"
		>
			{/* M4: header copy matches design — "ARTIFACT DISCUSSION" */}
			<h3 className="text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]">
				ARTIFACT DISCUSSION
			</h3>

			{data.summaries.length === 0 ? (
				<div
					data-testid="artifact-threads-summary-empty"
					className="text-sm text-[var(--text-tertiary)] px-3 py-2"
				>
					No artifact discussions yet.
				</div>
			) : (
				<ul className="flex flex-col gap-1">
					{data.summaries.map((summary) => (
						<li key={summary.artifactId}>
							<Link
								to={`/artifacts/${summary.artifactId}`}
								data-artifact-id={summary.artifactId}
								className="flex flex-col gap-0.5 px-3 py-2 rounded hover:bg-[var(--surface-container)] text-sm"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium text-[var(--text-primary)] truncate">
										{summary.artifactTitle}
									</span>
									<div className="flex items-center gap-2 shrink-0 text-xs text-[var(--text-tertiary)]">
										{summary.lastMessageAt && <span>{relativeShort(summary.lastMessageAt)}</span>}
										<span>{summary.messageCount}</span>
									</div>
								</div>
								{summary.lastMessageSnippet && (
									<span className="text-xs text-[var(--text-tertiary)] truncate">
										{summary.lastMessageSnippet}
									</span>
								)}
							</Link>
						</li>
					))}
				</ul>
			)}

			{/* M4: overflow link copy matches design — "View all (N more) →" */}
			{data.truncated && remaining > 0 && (
				<Link
					data-testid="artifact-threads-summary-more"
					to={`/artifacts?betId=${betId}`}
					className="text-xs text-[var(--text-tertiary)] px-3 py-1 hover:text-[var(--text-primary)]"
				>
					+{remaining} more artifact discussions →
				</Link>
			)}
		</section>
	);
}
