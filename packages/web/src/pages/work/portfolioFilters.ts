/**
 * AG2 — Portfolio filter predicates (pure, exported for tests).
 *
 * These are the testable seam for the derived-visibility model.
 * Component imports these — one source of truth for gates and filter logic.
 *
 * @lore AG2: "Completed" bucket folds completed + killed (matches existing
 * filteredBets logic in WorkPortfolio.tsx). Keeping the folding in one place
 * prevents the status-gate from showing a control that the filter can't honour.
 */

// Type for the minimal bet shape needed by predicates.
// WorkPortfolio uses BetListItem from useBets; keep the predicate type minimal
// so it can be tested without importing the full hook type.
export type BetFilterInput = {
	id: string;
	teamId: string;
	status: string;
	outcomeVerdict: string | null | undefined;
};

/**
 * Status buckets visible to the user. Killed is folded into "completed"
 * to match the filteredBets logic (the "Completed" filter tab catches both).
 */
export type StatusFilter = "all" | "active" | "completed" | "draft";

/**
 * Returns true iff at least one bet has a recorded outcome verdict
 * (outcomeVerdict is non-null and non-undefined).
 *
 * Gate for showing the verdict filter zone (AC-2).
 */
export function hasAnyRecordedOutcome(bets: BetFilterInput[]): boolean {
	return bets.some((b) => b.outcomeVerdict != null);
}

/**
 * Returns the set of distinct *user-visible* status buckets present in bets.
 * "killed" folds into the "completed" bucket (matches filteredBets logic).
 * Excludes "all" (not a real status).
 *
 * Gate for showing the status filter (AC-3): show iff size ≥ 2.
 */
export function distinctStatusBuckets(bets: BetFilterInput[]): Set<StatusFilter> {
	const buckets = new Set<StatusFilter>();
	for (const b of bets) {
		const raw = b.status;
		if (raw === "killed" || raw === "completed") {
			buckets.add("completed");
		} else if (raw === "active" || raw === "draft") {
			buckets.add(raw as StatusFilter);
		}
		// Unknown statuses are ignored — they can't be shown in the filter UI.
	}
	return buckets;
}

/**
 * Returns the set of distinct team IDs from the bets array.
 * Uses bets only — teams from the teams list are a label lookup, never part of the gate.
 *
 * Gate for showing the team filter (AC-3): show iff size ≥ 2.
 */
export function distinctTeamIds(bets: BetFilterInput[]): Set<string> {
	return new Set(bets.map((b) => b.teamId));
}

/**
 * Formats a portfolio count sub-line: "N bet(s) · M team(s)".
 * Returns empty string for empty bets array.
 */
export function formatPortfolioCount(bets: BetFilterInput[]): string {
	if (bets.length === 0) return "";
	const betCount = bets.length;
	const teamCount = distinctTeamIds(bets).size;
	const betLabel = betCount === 1 ? "bet" : "bets";
	const teamLabel = teamCount === 1 ? "team" : "teams";
	return `${betCount} ${betLabel} · ${teamCount} ${teamLabel}`;
}
