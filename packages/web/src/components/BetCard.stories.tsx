import { BetCard } from "./BetCard";

export default { title: "BetCard" };

export const Committed = (): React.JSX.Element => (
	<BetCard title="Mobile App V2" product="HyperIdle" status="committed" appetite="6 weeks" />
);

export const WithProgress = (): React.JSX.Element => (
	<BetCard
		title="Knowledge Graph Rebuild"
		product="Fabric"
		status="in_progress"
		appetite="4 weeks"
		progress={{ done: 3, total: 8 }}
	/>
);

export const Shipped = (): React.JSX.Element => (
	<BetCard title="Agent Cost Controls" product="Runtime" status="shipped" appetite="2 weeks" />
);

export const Killed = (): React.JSX.Element => (
	<BetCard title="Deprecated Feature" product="Legacy" status="killed" appetite="1 week" />
);

export const AllStatuses = (): React.JSX.Element => (
	<div className="flex flex-col gap-2">
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
