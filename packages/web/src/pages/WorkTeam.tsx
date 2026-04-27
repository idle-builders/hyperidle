/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 */
import { type JSX, useCallback, useState } from "react";
import { PauseSessionButton } from "../components/PauseSessionButton";
import { useFactoryStateContext } from "../hooks/factoryStateContext";
import { useRecoveryFetch } from "../hooks/useRecoveryFetch";
import type { CanvasBet } from "../shell/Canvas";
import { Canvas } from "../shell/Canvas";
import type { KanbanColumnState, KanbanTask } from "../shell/Kanban";
import { COLUMN_TO_STATE, Kanban } from "../shell/Kanban";
import type { PitchSelectorPitch } from "../shell/PitchSelector";
import { PitchSelector } from "../shell/PitchSelector";

interface MockTeamSession {
	id: string;
	agentName: string;
	taskTitle: string;
}

// @lore L7 AC4: bet/team detail surfaces must show a Pause button per
// running session. This page used to be entirely mock; we add a small
// running-sessions strip so AC4's "team detail" requirement is met. The
// real session feed lands in a later story.
const MOCK_TEAM_SESSIONS: MockTeamSession[] = [
	{ id: "session-team-1", agentName: "Dev Agent 1", taskTitle: "Implement login endpoint" },
	{ id: "session-team-3", agentName: "Dev Agent 1", taskTitle: "JWT refresh logic" },
];

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
	const [tasks, setTasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);
	const [teamSessionStates, setTeamSessionStates] = useState<
		Record<string, "running" | "paused">
	>(() => Object.fromEntries(MOCK_TEAM_SESSIONS.map((s) => [s.id, "running" as const])));
	const factoryState = useFactoryStateContext();
	const recoveryFetch = useRecoveryFetch();

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

			{/* I4 P2: Canvas (committed bets overview) on top, Kanban below.
			    J5: PitchSelector is an overlay that REPLACES the Kanban when
			    open (not inlined above it). */}
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
					<Kanban tasks={tasks} onMoveTask={handleMoveTask} groupByBet />
				</div>
			)}

			{MOCK_TEAM_SESSIONS.length > 0 && (
				<section
					aria-label="Running sessions"
					data-testid="team-running-sessions"
					className="flex flex-col gap-2"
				>
					<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
						Running sessions
					</h2>
					<ul className="flex flex-col gap-2">
						{MOCK_TEAM_SESSIONS.map((s) => {
							const state = teamSessionStates[s.id] ?? "running";
							return (
								<li
									key={s.id}
									data-testid={`team-session-row-${s.id}`}
									className="flex items-center justify-between bg-base-200 rounded p-2"
								>
									<div className="flex flex-col">
										<span className="text-xs font-mono uppercase tracking-wider text-[var(--text-lo)]">
											{s.id}
										</span>
										<span className="text-sm text-[var(--text-hi)]">
											{s.agentName} — {s.taskTitle}
										</span>
									</div>
									<PauseSessionButton
										session={{ id: s.id, state, agentName: s.agentName }}
										factoryPaused={factoryState.state.paused}
										onPause={async (input) => {
											const res = await recoveryFetch.post(
												`/api/sessions/${encodeURIComponent(s.id)}/pause`,
												{ reason: input.reason },
											);
											if (res.ok) {
												setTeamSessionStates((prev) => ({ ...prev, [s.id]: "paused" }));
											}
										}}
										onResume={async () => {
											const res = await recoveryFetch.post(
												`/api/sessions/${encodeURIComponent(s.id)}/resume`,
												{},
											);
											if (res.ok) {
												setTeamSessionStates((prev) => ({ ...prev, [s.id]: "running" }));
											}
										}}
									/>
								</li>
							);
						})}
					</ul>
				</section>
			)}
		</div>
	);
}
