/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 *
 * @lore L15: drag-to-move on tasks was removed. Humans REQUEST state changes
 * via the per-card kebab; agents DECIDE. The card never moves on a request.
 */
import { type JSX, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CanvasBet } from "../shell/Canvas";
import { Canvas } from "../shell/Canvas";
import { ensureTaskThread } from "../shell/ensureTaskThread";
import type { KanbanColumnState, KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";
import type { PitchSelectorPitch } from "../shell/PitchSelector";
import { PitchSelector } from "../shell/PitchSelector";
import type { TaskActionsResult } from "../shell/TaskActionsMenu";
import { formatStateRequestText, makeStateRequestClientKey } from "../shell/taskStateRequest";

const CANVAS_BETS: CanvasBet[] = [
	{
		id: "tb1",
		title: "Auth migration",
		product: "HyperIdle",
		status: "committed",
		appetite: "2 weeks",
		progress: { done: 2, total: 5 },
	},
	{
		id: "tb2",
		title: "Onboarding revamp",
		product: "HyperIdle",
		status: "shaped",
		appetite: "3 weeks",
	},
];

const INITIAL_TASKS: KanbanTask[] = [
	{
		id: "t1",
		title: "Implement login endpoint",
		owner: "Dev Agent 1",
		state: "in_progress",
		cost: "$4.20",
		betTag: "Auth",
	},
	{
		id: "t2",
		title: "Design signup form",
		owner: "Dev Agent 2",
		state: "accepted",
		cost: "$1.80",
		betTag: "Auth",
	},
	{
		id: "t3",
		title: "JWT refresh logic",
		owner: "Dev Agent 1",
		state: "review",
		cost: "$6.50",
		betTag: "Auth",
	},
	{
		id: "t4",
		title: "Write auth tests",
		owner: "Dev Agent 2",
		state: "done",
		cost: "$3.10",
		betTag: "Auth",
	},
	{
		id: "t5",
		title: "Rate limit middleware",
		owner: "Dev Agent 1",
		state: "accepted",
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
		problem: "Current layout breaks below 900px; mobile users bounce at 63%.",
		solution: "Adopt a responsive grid with a mobile-first kanban collapse.",
		rabbitHoles: "Do not rebuild the whole design system. Do not ship a native app.",
	},
	{
		id: "p2",
		title: "Dark mode toggle",
		hypothesis: "User preference for theming",
		proposer: "Designer",
		status: "shaped",
		appetite: "1 week",
		problem: "Users request a dark theme; the 'factory-dark' tokens already exist.",
		solution: "Add a top-bar toggle that flips data-theme on <html>.",
		rabbitHoles: "Do not add a per-component theme override.",
	},
	{
		id: "p3",
		title: "Export to PDF",
		hypothesis: "Users want offline reports",
		proposer: "Analyst",
		status: "shaped",
		appetite: "3 weeks",
		problem: "No offline story for bet briefs; stakeholders ask for shareable PDFs.",
		solution: "Server-side render each bet detail page to PDF on demand.",
		rabbitHoles: "Do not let users customize the PDF layout per-bet.",
	},
];

export function WorkTeam(): JSX.Element {
	const [tasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);
	const navigate = useNavigate();

	const handleTaskStateRequest = useCallback(
		async (
			taskId: string,
			targetColumn: KanbanColumnState,
		): Promise<TaskActionsResult> => {
			const task = tasks.find((t) => t.id === taskId);
			if (!task) return { ok: false, reason: "validation" };
			const ensured = await ensureTaskThread(taskId);
			if (!ensured.ok) return { ok: false, reason: ensured.reason };
			const text = formatStateRequestText(task.state, targetColumn);
			const isoTimestamp = new Date().toISOString();
			const clientKey = makeStateRequestClientKey(taskId, targetColumn, isoTimestamp);
			try {
				const resp = await fetch(`/api/threads/${ensured.threadId}/messages`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						type: "plain",
						payload: { text, refs: [{ kind: "task", id: taskId }] },
						clientKey,
					}),
				});
				if (!resp.ok) {
					if (resp.status === 400) return { ok: false, reason: "validation" };
					if (resp.status === 403) return { ok: false, reason: "forbidden" };
					return { ok: false, reason: "server" };
				}
				return { ok: true };
			} catch {
				return { ok: false, reason: "network" };
			}
		},
		[tasks],
	);

	const handleOpenTaskThread = useCallback(
		(taskId: string): void => {
			navigate(`/work/team/task/${taskId}/thread`);
		},
		[navigate],
	);

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

	const handleAddToCanvas = useCallback((_pitchId: string): void => {
		// Mock — real implementation promotes the pitch to a canvas bet.
	}, []);

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

			<div data-testid="work-team-canvas">
				<Canvas bets={CANVAS_BETS} capacity={3} onMoveBet={handleMoveBet} />
			</div>
			{pitchSelectorOpen ? (
				<PitchSelector
					pitches={MOCK_PITCHES}
					selectedIds={selectedPitchIds}
					onSelect={handleSelectPitch}
					onAddToCanvas={handleAddToCanvas}
					onClose={() => setPitchSelectorOpen(false)}
				/>
			) : (
				<div data-testid="work-team-kanban">
					<Kanban
						tasks={tasks}
						onTaskStateRequest={handleTaskStateRequest}
						onOpenTaskThread={handleOpenTaskThread}
						groupByBet
					/>
				</div>
			)}
		</div>
	);
}
