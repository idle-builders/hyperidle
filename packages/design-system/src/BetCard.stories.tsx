import { BetCard } from "./BetCard";

export default {
	title: "BetCard",
	tier: "2" as const,
	uses: ["StatusChip", "Tag", "KeyValue"],
	order: ["Committed", "WithProgress", "Shipped", "Killed", "AllStatuses", "PortfolioMode"],
};

export const Committed = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard title="Mobile App V2" product="HyperIdle" status="committed" appetite="6 weeks" />
	</div>
);

export const WithProgress = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard
			title="Knowledge Graph Rebuild"
			product="Fabric"
			status="in_progress"
			appetite="4 weeks"
			progress={{ done: 3, total: 8 }}
		/>
	</div>
);

export const Shipped = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard title="Agent Cost Controls" product="Runtime" status="shipped" appetite="2 weeks" />
	</div>
);

export const Killed = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard title="Deprecated Feature" product="Legacy" status="killed" appetite="1 week" />
	</div>
);

export const AllStatuses = (): React.JSX.Element => (
	<div className="flex flex-col gap-2 max-w-[320px]">
		<BetCard title="Shaped Bet" product="App" status="shaped" appetite="6 weeks" />
		<BetCard title="Committed Bet" product="App" status="committed" appetite="4 weeks" />
		<BetCard
			title="In Progress Bet"
			product="App"
			status="in_progress"
			appetite="3 weeks"
			progress={{ done: 2, total: 5 }}
		/>
		<BetCard title="Shipped Bet" product="App" status="shipped" appetite="2 weeks" />
		<BetCard title="Killed Bet" product="App" status="killed" appetite="1 week" />
	</div>
);

export const PortfolioMode = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<BetCard
			title="HyperIdle Core"
			product="HyperIdle"
			status="committed"
			appetite="Cycle 12"
			leadAvatar={{ name: "CEO Agent", initials: "CE" }}
			activeBets={4}
			shipped={12}
			progress={{ done: 3, total: 5 }}
		/>
	</div>
);
