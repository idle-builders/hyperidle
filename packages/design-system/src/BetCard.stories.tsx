import { BetCard } from "./BetCard";

export default {
	title: "BetCard",
	tier: "2" as const,
	uses: ["StatusChip", "Tag", "KeyValue"],
	order: ["Active", "WithProgress", "Completed", "Killed", "AllStatuses", "PortfolioMode"],
};

export const Active = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard title="Mobile App V2" product="HyperIdle" status="active" appetite="6 weeks" />
	</div>
);

export const WithProgress = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard
			title="Knowledge Graph Rebuild"
			product="Fabric"
			status="active"
			appetite="4 weeks"
			progress={{ done: 3, total: 8 }}
		/>
	</div>
);

export const Completed = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard title="Agent Cost Controls" product="Runtime" status="completed" appetite="2 weeks" />
	</div>
);

export const Killed = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard title="Deprecated Feature" product="Legacy" status="killed" appetite="1 week" />
	</div>
);

export const AllStatuses = (): React.JSX.Element => (
	<div className="flex flex-col gap-2 max-w-[320px]">
		<BetCard title="Draft Bet" product="App" status="draft" appetite="6 weeks" />
		<BetCard title="Active Bet" product="App" status="active" appetite="4 weeks" />
		<BetCard
			title="Active Bet with Progress"
			product="App"
			status="active"
			appetite="3 weeks"
			progress={{ done: 2, total: 5 }}
		/>
		<BetCard title="Completed Bet" product="App" status="completed" appetite="2 weeks" />
		<BetCard title="Killed Bet" product="App" status="killed" appetite="1 week" />
	</div>
);

export const PortfolioMode = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard
			title="HyperIdle Core"
			product="HyperIdle"
			status="active"
			appetite="Cycle 12"
			leadAvatar={{ name: "CEO Agent", initials: "CE" }}
			activeBets={4}
			shipped={12}
			progress={{ done: 3, total: 5 }}
		/>
	</div>
);
