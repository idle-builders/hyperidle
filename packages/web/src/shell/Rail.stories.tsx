import type { BetStatus } from "@hyperidle/shared";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Rail, type SystemStability } from "./Rail";

export default {
	title: "Rail",
	tier: "3" as const,
	uses: ["NotificationRow", "KeyValue", "StatusChip"],
};

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
		sourceThreadId: "thread-1",
		durationMs: 47 * 60_000,
	},
	{
		id: "blocker-2",
		agent: "Agent Beta",
		reason: "Rate limited by provider",
		severity: "medium" as const,
		sourceThreadId: "thread-2",
		durationMs: 12 * 60_000,
	},
];

const sampleCost = {
	todaySpend: "$12.50",
	todayBudget: "$50.00",
	weekSpend: "$87.30",
	weekBudget: "$350.00",
};

const ZERO_STABILITY: SystemStability = {
	crashed_sessions: 0,
	cap_reached: 0,
	api_degraded: 0,
};

const ACTIVE_STABILITY: SystemStability = {
	crashed_sessions: 1,
	cap_reached: 2,
	api_degraded: 1,
};

// L8: Stories live inside MemoryRouter so the navigate() calls in interactive
// rows don't crash when rendered standalone in /designsystem.
function withRouter(node: React.JSX.Element): React.JSX.Element {
	return <MemoryRouter>{node}</MemoryRouter>;
}

export const Expanded = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded
			onToggleExpand={() => {}}
			bets={sampleBets}
			blockers={sampleBlockers}
			cost={sampleCost}
			stability={ZERO_STABILITY}
		/>,
	);

export const Minimized = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded={false}
			onToggleExpand={() => {}}
			bets={sampleBets}
			blockers={sampleBlockers}
			cost={sampleCost}
			stability={ZERO_STABILITY}
		/>,
	);

export const Interactive = (): React.JSX.Element => {
	const [expanded, setExpanded] = useState(true);
	return withRouter(
		<Rail
			expanded={expanded}
			onToggleExpand={() => setExpanded(!expanded)}
			bets={sampleBets}
			blockers={sampleBlockers}
			cost={sampleCost}
			stability={ZERO_STABILITY}
		/>,
	);
};

export const EmptyState = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded
			onToggleExpand={() => {}}
			bets={[]}
			blockers={[]}
			cost={sampleCost}
			stability={ZERO_STABILITY}
		/>,
	);

// J2: collapsed Rail with all three semantic pills (BLK/REV/PSD) present.
export const CollapsedWithPills = (): React.JSX.Element =>
	withRouter(
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
			stability={ZERO_STABILITY}
		/>,
	);

// J2: collapsed Rail with all counts zero — only the expand chevron + the
// neutral total-bets indicator should be visible.
export const CollapsedEmpty = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded={false}
			onToggleExpand={() => {}}
			bets={[]}
			blockers={[]}
			cost={sampleCost}
			stability={ZERO_STABILITY}
		/>,
	);

// J2: collapsed Rail with only blockers — BLK pill visible, REV/PSD hidden.
export const CollapsedOnlyBlk = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded={false}
			onToggleExpand={() => {}}
			bets={[]}
			blockers={sampleBlockers}
			cost={sampleCost}
			stability={ZERO_STABILITY}
		/>,
	);

// L8: expanded Rail with the system-stability strip rendered (1 crashed
// session, 2 cap-reached products, API degraded).
export const ExpandedWithStabilityStrip = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded
			onToggleExpand={() => {}}
			bets={sampleBets}
			blockers={sampleBlockers}
			cost={sampleCost}
			stability={ACTIVE_STABILITY}
		/>,
	);

// L8: collapsed Rail with the danger pills surfaced from the stability
// strip — CRASH / CAP / API stack alongside BLK.
export const CollapsedWithStabilityPills = (): React.JSX.Element =>
	withRouter(
		<Rail
			expanded={false}
			onToggleExpand={() => {}}
			bets={sampleBets}
			blockers={sampleBlockers}
			cost={sampleCost}
			stability={ACTIVE_STABILITY}
		/>,
	);
