/**
 * Work/Team page — composes Kanban (Tier 3) + PitchSelector (Tier 3 overlay).
 * Shows a kanban board of tasks with an optional pitch selector overlay.
 */
import type { TaskState } from "@hyperidle/shared";
import { type JSX, useCallback, useState } from "react";
import { Kanban } from "../shell/Kanban";
import type { KanbanColumnState, KanbanTask } from "../shell/Kanban";
import { PitchSelector } from "../shell/PitchSelector";
import type { PitchSelectorPitch } from "../shell/PitchSelector";

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

	const handleMoveTask = useCallback((taskId: string, targetState: KanbanColumnState): void => {
		setTasks((prev) =>
			prev.map((t) => (t.id === taskId ? { ...t, state: targetState as TaskState } : t)),
		);
	}, []);

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

			<Kanban tasks={tasks} onMoveTask={handleMoveTask} />
		</div>
	);
}
