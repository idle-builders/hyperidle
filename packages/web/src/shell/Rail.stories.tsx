import type { BetStatus } from "@hyperidle/shared";
import { useState } from "react";
import { Rail } from "./Rail";

export default { title: "Rail" };

const sampleBets = [
	{ id: "bet-1", title: "Launch MVP", product: "HyperIdle", status: "in_progress" as BetStatus },
	{ id: "bet-2", title: "User Onboarding", product: "HyperIdle", status: "behind" as BetStatus },
	{ id: "bet-3", title: "Analytics V2", product: "MetaDash", status: "blocked" as BetStatus },
];

const sampleBlockers = [
	{
		id: "blocker-1",
		agent: "Agent Alpha",
		reason: "Waiting for API key",
		severity: "high" as const,
	},
	{
		id: "blocker-2",
		agent: "Agent Beta",
		reason: "Rate limited by provider",
		severity: "medium" as const,
	},
];

const sampleCost = {
	todaySpend: "$12.50",
	todayBudget: "$50.00",
	weekSpend: "$87.30",
	weekBudget: "$350.00",
};

export const Expanded = (): React.JSX.Element => (
	<Rail
		expanded
		onToggleExpand={() => {}}
		bets={sampleBets}
		blockers={sampleBlockers}
		cost={sampleCost}
	/>
);

export const Minimized = (): React.JSX.Element => (
	<Rail
		expanded={false}
		onToggleExpand={() => {}}
		bets={sampleBets}
		blockers={sampleBlockers}
		cost={sampleCost}
	/>
);

export const Interactive = (): React.JSX.Element => {
	const [expanded, setExpanded] = useState(true);
	return (
		<Rail
			expanded={expanded}
			onToggleExpand={() => setExpanded(!expanded)}
			bets={sampleBets}
			blockers={sampleBlockers}
			cost={sampleCost}
		/>
	);
};

export const EmptyState = (): React.JSX.Element => (
	<Rail expanded onToggleExpand={() => {}} bets={[]} blockers={[]} cost={sampleCost} />
);

// J2: collapsed Rail with all three semantic pills (BLK/REV/PSD) present.
export const CollapsedWithPills = (): React.JSX.Element => (
	<Rail
		expanded={false}
		onToggleExpand={() => {}}
		bets={[
			{ id: "r1", title: "Review me", product: "Alpha", status: "review" as BetStatus },
			{ id: "p1", title: "Paused bet", product: "Alpha", status: "paused" as BetStatus },
			{ id: "c1", title: "Committed", product: "Alpha", status: "committed" as BetStatus },
		]}
		blockers={sampleBlockers}
		cost={sampleCost}
	/>
);

// J2: collapsed Rail with all counts zero — only the expand chevron + the
// neutral total-bets indicator should be visible.
export const CollapsedEmpty = (): React.JSX.Element => (
	<Rail expanded={false} onToggleExpand={() => {}} bets={[]} blockers={[]} cost={sampleCost} />
);

// J2: collapsed Rail with only blockers — BLK pill visible, REV/PSD hidden.
export const CollapsedOnlyBlk = (): React.JSX.Element => (
	<Rail
		expanded={false}
		onToggleExpand={() => {}}
		bets={[]}
		blockers={sampleBlockers}
		cost={sampleCost}
	/>
);
