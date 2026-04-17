/**
 * Work/Bet page — bet detail view composed from Tier 2 components (BetCard, TaskCard)
 * and DaisyUI primitives. Shows bet details + task list for that bet.
 */
import type { TaskState } from "@hyperidle/shared";
import type { JSX } from "react";
import { useParams } from "react-router-dom";
import { BetCard } from "../components/BetCard";
import { TaskCard } from "../components/TaskCard";

interface MockBetDetail {
	id: string;
	title: string;
	product: string;
	status: "shaped" | "committed";
	appetite: string;
	progress: { done: number; total: number };
	tasks: Array<{
		id: string;
		title: string;
		owner: string;
		state: TaskState;
		cost: string;
	}>;
}

const MOCK_BETS: Record<string, MockBetDetail> = {
	b1: {
		id: "b1",
		title: "User auth flow",
		product: "Alpha",
		status: "committed",
		appetite: "2 weeks",
		progress: { done: 3, total: 8 },
		tasks: [
			{
				id: "t1",
				title: "Implement login endpoint",
				owner: "Dev Agent 1",
				state: "done" as TaskState,
				cost: "$4.20",
			},
			{
				id: "t2",
				title: "Design signup form",
				owner: "Dev Agent 2",
				state: "in_progress" as TaskState,
				cost: "$1.80",
			},
			{
				id: "t3",
				title: "JWT refresh logic",
				owner: "Dev Agent 1",
				state: "review" as TaskState,
				cost: "$6.50",
			},
		],
	},
	b2: {
		id: "b2",
		title: "Dashboard redesign",
		product: "Beta",
		status: "shaped",
		appetite: "3 weeks",
		progress: { done: 0, total: 5 },
		tasks: [
			{
				id: "t4",
				title: "Wireframe layouts",
				owner: "Designer Agent",
				state: "accepted" as TaskState,
				cost: "$2.00",
			},
			{
				id: "t5",
				title: "Component inventory",
				owner: "Dev Agent 1",
				state: "accepted" as TaskState,
				cost: "$1.50",
			},
		],
	},
};

const FALLBACK_BET: MockBetDetail = {
	id: "unknown",
	title: "Unknown Bet",
	product: "Unknown",
	status: "shaped",
	appetite: "—",
	progress: { done: 0, total: 0 },
	tasks: [],
};

export function WorkBet(): JSX.Element {
	const { betId } = useParams<{ betId: string }>();
	const bet = (betId && MOCK_BETS[betId]) || FALLBACK_BET;
	const loading = false;
	const error: string | null = null;

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<div className="skeleton h-20 w-full" />
				<div className="skeleton h-6 w-32" />
				<div className="skeleton h-16 w-full" />
				<div className="skeleton h-16 w-full" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<div role="alert" className="alert alert-error text-sm">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
			<BetCard
				title={bet.title}
				product={bet.product}
				status={bet.status}
				appetite={bet.appetite}
				progress={bet.progress}
			/>

			<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Tasks
			</h2>

			{bet.tasks.length === 0 ? (
				<p className="text-sm text-base-content/50">No tasks yet</p>
			) : (
				<div className="flex flex-col gap-2">
					{bet.tasks.map((task) => (
						<TaskCard
							key={task.id}
							title={task.title}
							owner={task.owner}
							state={task.state}
							cost={task.cost}
						/>
					))}
				</div>
			)}
		</div>
	);
}
