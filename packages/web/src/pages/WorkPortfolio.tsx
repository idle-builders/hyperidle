import type { BetStatus } from "@hyperidle/shared";
/**
 * Work/Portfolio page — composes Canvas (Tier 3) for shaped/committed bet columns.
 * Uses mock bet data with drag-drop between columns.
 */
import { type JSX, useCallback, useState } from "react";
import { Canvas } from "../shell/Canvas";
import type { CanvasBet } from "../shell/Canvas";

const INITIAL_BETS: CanvasBet[] = [
	{
		id: "b1",
		title: "User auth flow",
		product: "Alpha",
		status: "shaped" as BetStatus,
		appetite: "2 weeks",
	},
	{
		id: "b2",
		title: "Dashboard redesign",
		product: "Beta",
		status: "shaped" as BetStatus,
		appetite: "3 weeks",
	},
	{
		id: "b3",
		title: "API rate limiting",
		product: "Alpha",
		status: "committed" as BetStatus,
		appetite: "1 week",
		progress: { done: 3, total: 8 },
	},
	{
		id: "b4",
		title: "Knowledge search",
		product: "Alpha",
		status: "committed" as BetStatus,
		appetite: "2 weeks",
		progress: { done: 1, total: 5 },
	},
];

export function WorkPortfolio(): JSX.Element {
	const [bets, setBets] = useState<CanvasBet[]>(INITIAL_BETS);
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);

	const handleMoveBet = useCallback((betId: string, targetStatus: "shaped" | "committed"): void => {
		setBets((prev) =>
			prev.map((b) => (b.id === betId ? { ...b, status: targetStatus as BetStatus } : b)),
		);
	}, []);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-portfolio-page">
				<div className="skeleton h-6 w-48" />
				<div className="flex gap-4">
					<div className="skeleton h-64 flex-1" />
					<div className="skeleton h-64 flex-1" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-portfolio-page">
				<div role="alert" className="alert alert-error text-sm">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="work-portfolio-page">
			<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Portfolio Canvas
			</h1>
			<Canvas bets={bets} capacity={4} onMoveBet={handleMoveBet} />
		</div>
	);
}
