import { useState } from "react";
import type { CanvasBet } from "./Canvas";
import { Canvas } from "./Canvas";

export default { title: "Canvas" };

const sampleBets: CanvasBet[] = [
	{ id: "b1", title: "Mobile App V2", product: "HyperIdle", status: "shaped", appetite: "6 weeks" },
	{
		id: "b2",
		title: "Analytics Dashboard",
		product: "MetaDash",
		status: "shaped",
		appetite: "4 weeks",
	},
	{
		id: "b3",
		title: "User Onboarding",
		product: "HyperIdle",
		status: "committed",
		appetite: "3 weeks",
		progress: { done: 2, total: 5 },
	},
	{ id: "b4", title: "CLI Tool", product: "DevKit", status: "committed", appetite: "2 weeks" },
];

export const Default = (): React.JSX.Element => (
	<Canvas bets={sampleBets} capacity={4} onMoveBet={() => {}} />
);

export const OverCapacity = (): React.JSX.Element => (
	<Canvas bets={sampleBets} capacity={1} onMoveBet={() => {}} />
);

export const Empty = (): React.JSX.Element => (
	<Canvas bets={[]} capacity={3} onMoveBet={() => {}} />
);

export const Interactive = (): React.JSX.Element => {
	const [bets, setBets] = useState<CanvasBet[]>(sampleBets);
	return (
		<Canvas
			bets={bets}
			capacity={3}
			onMoveBet={(betId, targetStatus) => {
				setBets((prev) => prev.map((b) => (b.id === betId ? { ...b, status: targetStatus } : b)));
			}}
		/>
	);
};
