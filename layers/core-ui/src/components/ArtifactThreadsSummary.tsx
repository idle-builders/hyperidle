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
import { EmptyState, ErrorState, Skeleton } from "../ds";
import { useArtifactThreadSummary } from "../hooks/useArtifactThreadSummary.js";
import { relativeShort } from "../utils/time.js";

export interface ArtifactThreadsSummaryProps {
	taskId: string;
}

export function ArtifactThreadsSummary({ taskId }: ArtifactThreadsSummaryProps): JSX.Element | null {
	const { data, error, isLoading } = useArtifactThreadSummary(taskId);

	if (isLoading) {
		return (
			<div className="p-3">
				{/* AI5: shared Skeleton single bar (skeleton-pulse, not animate-pulse). */}
				<Skeleton
					height="16px"
					width="33%"
					ariaLabel="Loading discussions"
					dataTestId="artifact-threads-summary-loading"
				/>
			</div>
		);
	}

	// M3: surface error state when hook errors (design: ErrorState row inside section)
	if (error !== null) {
		return (
			<section
				data-testid="artifact-threads-summary"
				aria-label="Artifact discussion"
				className="flex flex-col gap-[9px]"
			>
				<h3 className="type-label   uppercase  text-[var(--text-tertiary)]">ARTIFACT DISCUSSION</h3>
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
			className="flex flex-col gap-[9px]"
		>
			{/* M4: header copy matches design — "ARTIFACT DISCUSSION" */}
			<h3 className="type-label   uppercase  text-[var(--text-tertiary)]">ARTIFACT DISCUSSION</h3>

			{data.summaries.length === 0 ? (
				/* AI5: shared compact EmptyState. */
				<EmptyState
					compact
					title="No discussions"
					description="No artifact discussions yet."
					dataTestId="artifact-threads-summary-empty"
				/>
			) : (
				<ul className="flex flex-col gap-[3px]">
					{data.summaries.map((summary) => (
						<li key={summary.artifactId}>
							<Link
								to={`/artifacts/${summary.artifactId}`}
								data-artifact-id={summary.artifactId}
								className="type-control flex flex-col gap-[3px] px-3 py-2 rounded-[var(--r-subtle)] hover:bg-[var(--surface-container)] "
							>
								<div className="flex items-center justify-between gap-[9px]">
									<span className="type-small  text-[var(--text-primary)] truncate">
										{summary.artifactTitle}
									</span>
									<div className="type-metadata flex items-center gap-[9px] shrink-0  text-[var(--text-tertiary)]">
										{summary.lastMessageAt && <span>{relativeShort(summary.lastMessageAt)}</span>}
										<span>{summary.messageCount}</span>
									</div>
								</div>
								{summary.lastMessageSnippet && (
									<span className="type-metadata  text-[var(--text-tertiary)] truncate">
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
					to={`/artifacts?taskId=${taskId}`}
					className="type-control  text-[var(--text-tertiary)] px-3 py-1 hover:text-[var(--text-primary)]"
				>
					+{remaining} more artifact discussions →
				</Link>
			)}
		</section>
	);
}
