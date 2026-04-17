import { useState } from "react";
import type { Status } from "../components/StatusChip";
import { Rail } from "./Rail";

export default { title: "Rail" };

const sampleBets = [
	{ id: "bet-1", title: "Launch MVP", product: "HyperIdle", status: "healthy" as Status },
	{ id: "bet-2", title: "User Onboarding", product: "HyperIdle", status: "behind" as Status },
	{ id: "bet-3", title: "Analytics V2", product: "MetaDash", status: "blocked" as Status },
];

const sampleBlockers = [
	{
		id: "blocker-1",
		agent: "Agent Alpha",
		reason: "Waiting for API key",
		severity: "blocked" as Status,
	},
	{
		id: "blocker-2",
		agent: "Agent Beta",
		reason: "Rate limited by provider",
		severity: "behind" as Status,
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
