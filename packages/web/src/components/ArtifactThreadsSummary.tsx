/**
 * ArtifactThreadsSummary — L18 per-bet artifact thread summary section.
 *
 * Renders a compact list of artifact threads that have at least one message,
 * capped at 10 rows by the server. Includes empty stub and "+N more" affordance.
 *
 * @lore L18 stub: the implementation renders in Phase B (write-code).
 */

import type { JSX } from "react";

export interface ArtifactThreadsSummaryProps {
	betId: string;
}

/**
 * @lore L18: stub — implementation lands in Phase B. The stub renders nothing
 * useful so tests asserting the real behavior fail (correct red state).
 */
export function ArtifactThreadsSummary({
	betId: _betId,
}: ArtifactThreadsSummaryProps): JSX.Element {
	// @lore L18: stub — see plans/L18/architecture.md §16.
	return <div data-testid="artifact-threads-summary-stub" />;
}
