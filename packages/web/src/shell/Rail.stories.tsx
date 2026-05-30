import type { BetStatus } from "@hyperidle/shared";
import { useState } from "react";
import { Rail } from "./Rail";

export default {
	title: "Rail",
	tier: "3" as const,
	uses: ["NotificationRow", "KeyValue", "StatusChip"],
};

const sampleBets = [
	{
		id: "bet-1",
		title: "Launch MVP",
		progress: { done: 3, total: 8 },
		status: "active" as BetStatus,
	},
	{
		id: "bet-2",
		title: "User Onboarding",
		progress: { done: 1, total: 5 },
		status: "active" as BetStatus,
	},
	{
		id: "bet-3",
		title: "Analytics V2",
		progress: { done: 0, total: 3 },
		status: "draft" as BetStatus,
	},
];

const sampleBlockers = [
	{
		taskId: "blocker-1",
		title: "Waiting for API key",
		owner: "Agent Alpha",
		durationBlockedMs: 90_000_000, // 25h — high severity
	},
	{
		taskId: "blocker-2",
		title: "Rate limited by provider",
		owner: "Agent Beta",
		durationBlockedMs: 18_000_000, // 5h — medium severity
	},
];

const sampleCost = {
	todaySpend: { minor: 1250, currency: "USD" as const },
	todayCap: { minor: 5000, currency: "USD" as const },
	weekSpend: { minor: 8730, currency: "USD" as const },
	weekCap: { minor: 35000, currency: "USD" as const },
	weekTokens: 42300,
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
// @lore U1: REV pill now counts "draft" bets, PSD pill counts "completed" bets.
export const CollapsedWithPills = (): React.JSX.Element => (
	<Rail
		expanded={false}
		onToggleExpand={() => {}}
		bets={[
			{
				id: "r1",
				title: "Draft bet",
				progress: { done: 0, total: 3 },
				status: "draft" as BetStatus,
			},
			{
				id: "p1",
				title: "Completed bet",
				progress: { done: 5, total: 5 },
				status: "completed" as BetStatus,
			},
			{
				id: "c1",
				title: "Active bet",
				progress: { done: 2, total: 4 },
				status: "active" as BetStatus,
			},
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
