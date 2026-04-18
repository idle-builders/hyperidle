/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 */
import type { BetStatus, TaskState } from "@hyperidle/shared";
import { type JSX, useCallback, useState } from "react";
import { Canvas } from "../shell/Canvas";
import type { CanvasBet } from "../shell/Canvas";
import { Kanban } from "../shell/Kanban";
import type { KanbanColumnState, KanbanTask } from "../shell/Kanban";
import { PitchSelector } from "../shell/PitchSelector";
import type { PitchSelectorPitch } from "../shell/PitchSelector";

/**
 * I4 K1/K2: single source of truth for translating a Kanban column key to
 * the persisted TaskState. The Kanban itself emits the column key (e.g.
 * "planned"), and the page maps it to the TaskState the API expects.
 *
 * @lore "planned" is NOT a valid TaskState. The previous implementation
 * cast the column key to TaskState which silently broke the state machine.
 */
export const COLUMN_TO_STATE: Record<KanbanColumnState, TaskState> = {
	planned: "accepted",
	in_progress: "in_progress",
	blocked: "blocked",
	done: "done",
};

const CANVAS_BETS: CanvasBet[] = [
	{
		id: "tb1",
		title: "Auth migration",
		product: "HyperIdle",
		status: "committed" as BetStatus,
		appetite: "2 weeks",
		progress: { done: 2, total: 5 },
	},
	{
		id: "tb2",
		title: "Onboarding revamp",
		product: "HyperIdle",
		status: "shaped" as BetStatus,
		appetite: "3 weeks",
	},
];

const INITIAL_TASKS: KanbanTask[] = [
	{
		id: "t1",
		title: "Implement login endpoint",
		owner: "Dev Agent 1",
		state: "in_progress" as TaskState,
		cost: "$4.20",
		betTag: "Auth",
	},
	{
		id: "t2",
		title: "Design signup form",
		owner: "Dev Agent 2",
		state: "accepted" as TaskState,
		cost: "$1.80",
		betTag: "Auth",
	},
	{
		id: "t3",
		title: "JWT refresh logic",
		owner: "Dev Agent 1",
		state: "review" as TaskState,
		cost: "$6.50",
		betTag: "Auth",
	},
	{
		id: "t4",
		title: "Write auth tests",
		owner: "Dev Agent 2",
		state: "done" as TaskState,
		cost: "$3.10",
		betTag: "Auth",
	},
	{
		id: "t5",
		title: "Rate limit middleware",
		owner: "Dev Agent 1",
		state: "accepted" as TaskState,
		cost: "$2.00",
		betTag: "API",
	},
];

const MOCK_PITCHES: PitchSelectorPitch[] = [
	{
		id: "p1",
		title: "Mobile responsive layout",
		hypothesis: "Users need mobile access",
		proposer: "CPO",
		status: "shaped",
		appetite: "2 weeks",
	},
	{
		id: "p2",
		title: "Dark mode toggle",
		hypothesis: "User preference for theming",
		proposer: "Designer",
		status: "shaped",
		appetite: "1 week",
	},
	{
		id: "p3",
		title: "Export to PDF",
		hypothesis: "Users want offline reports",
		proposer: "Analyst",
		status: "shaped",
		appetite: "3 weeks",
	},
];

export function WorkTeam(): JSX.Element {
	const [tasks, setTasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);

	const handleMoveTask = useCallback((taskId: string, targetColumn: KanbanColumnState): void => {
		// I4 K1: map the Kanban column key to the canonical TaskState.
		const targetState = COLUMN_TO_STATE[targetColumn];
		setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state: targetState } : t)));
	}, []);

	const handleMoveBet = useCallback(
		(_betId: string, _targetStatus: "shaped" | "committed"): void => {
			// Mock — the team-board canvas does not persist bet moves yet.
		},
		[],
	);

	const handleSelectPitch = useCallback((pitchId: string): void => {
		setSelectedPitchIds((prev) =>
			prev.includes(pitchId) ? prev.filter((id) => id !== pitchId) : [...prev, pitchId],
		);
	}, []);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-team-page">
				<div className="skeleton h-6 w-48" />
				<div className="grid grid-cols-4 gap-4">
					<div className="skeleton h-48" />
					<div className="skeleton h-48" />
					<div className="skeleton h-48" />
					<div className="skeleton h-48" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-team-page">
				<div role="alert" className="alert alert-error text-sm">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="work-team-page">
			<div className="flex items-center justify-between">
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
					Team Board
				</h1>
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					onClick={() => setPitchSelectorOpen((p) => !p)}
				>
					{pitchSelectorOpen ? "Close Pitches" : "Select Pitches"}
				</button>
			</div>

			{pitchSelectorOpen && (
				<PitchSelector
					pitches={MOCK_PITCHES}
					selectedIds={selectedPitchIds}
					onSelect={handleSelectPitch}
					onClose={() => setPitchSelectorOpen(false)}
				/>
			)}

			{/* I4 P2: Canvas (committed bets overview) on top, Kanban below. */}
			<div data-testid="work-team-canvas">
				<Canvas bets={CANVAS_BETS} capacity={3} onMoveBet={handleMoveBet} />
			</div>
			<div data-testid="work-team-kanban">
				<Kanban tasks={tasks} onMoveTask={handleMoveTask} />
			</div>
		</div>
	);
}
