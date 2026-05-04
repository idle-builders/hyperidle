/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 *
 * @lore L15 § 4.2: drag-to-move on the Kanban is removed. Humans request
 * state changes via the per-card TaskActionsMenu, which POSTs to
 * /api/tasks/:id/request. Agents own state machine transitions.
 */
import { TaskActionsMenu } from "@hyperidle/design-system";
import type { RequestVerb } from "@hyperidle/shared";
import { type JSX, useCallback, useRef, useState } from "react";
import type { CanvasBet } from "../shell/Canvas";
import { Canvas } from "../shell/Canvas";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";
import type { PitchSelectorPitch } from "../shell/PitchSelector";
import { PitchSelector } from "../shell/PitchSelector";

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
		pendingRequest: null,
	},
	{
		id: "t2",
		title: "Design signup form",
		owner: "Dev Agent 2",
		state: "accepted",
		cost: "$1.80",
		betTag: "Auth",
		pendingRequest: null,
	},
	{
		id: "t3",
		title: "JWT refresh logic",
		owner: "Dev Agent 1",
		state: "review",
		cost: "$6.50",
		betTag: "Auth",
		// Demo fixture: a pending `request_changes` so the L15 pending chip
		// has a render path on /work/team. Live data wiring is a follow-up
		// (depends on `GET /api/tasks` projection — out of L15 scope).
		pendingRequest: {
			messageId: "demo-msg-pending-1",
			verb: "request_changes",
			createdAt: new Date().toISOString(),
		},
	},
	{
		id: "t4",
		title: "Write auth tests",
		owner: "Dev Agent 2",
		state: "done",
		cost: "$3.10",
		betTag: "Auth",
		pendingRequest: null,
	},
	{
		id: "t5",
		title: "Rate limit middleware",
		owner: "Dev Agent 1",
		state: "accepted",
		cost: "$2.00",
		betTag: "API",
		pendingRequest: null,
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

const NOOP_MOVE_BET = (_betId: string, _targetStatus: "shaped" | "committed"): void => {
	// Canvas drag binding wired by L19; Team Board does not move bets.
};

async function postRequest(
	taskId: string,
	verb: RequestVerb,
	clientKey: string,
	reason?: string,
): Promise<void> {
	await fetch(`/api/tasks/${taskId}/request`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ verb, reason, clientKey }),
	});
}

export function WorkTeam(): JSX.Element {
	const [tasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);

	// L15 review CRITICAL-1: per-(taskId, verb) clientKey ref so a double-tap
	// (or React StrictMode double-fire) reuses the SAME key and is deduped by
	// the server's `(threadId, senderId, clientKey)` unique index. Generating
	// a fresh UUID per click defeats server-side idempotency.
	const clientKeyCacheRef = useRef<Map<string, string>>(new Map());
	const keyFor = useCallback((taskId: string, verb: RequestVerb): string => {
		const cacheKey = `${taskId}:${verb}`;
		const cache = clientKeyCacheRef.current;
		const existing = cache.get(cacheKey);
		if (existing) return existing;
		const fresh = crypto.randomUUID();
		cache.set(cacheKey, fresh);
		return fresh;
	}, []);

	const handleRequestStateChange = useCallback(
		(taskId: string, verb: RequestVerb, reason?: string): void => {
			void postRequest(taskId, verb, keyFor(taskId, verb), reason);
		},
		[keyFor],
	);

	const handleCancelPendingRequest = useCallback(
		(taskId: string): void => {
			void postRequest(taskId, "cancel_request", keyFor(taskId, "cancel_request"));
		},
		[keyFor],
	);

	const handleSelectPitch = useCallback((pitchId: string): void => {
		setSelectedPitchIds((prev) =>
			prev.includes(pitchId) ? prev.filter((id) => id !== pitchId) : [...prev, pitchId],
		);
	}, []);

	const handleOpenThread = useCallback((taskId: string): void => {
		// L18 will implement deep-linking to the task's thread surface; for
		// now log + leave as a no-op (predictable affordance, no silent UI
		// activity). The server-side `/api/threads/:id` route exists.
		void taskId;
	}, []);

	const renderTaskActions = useCallback(
		(task: KanbanTask): JSX.Element => (
			<TaskActionsMenu
				task={{
					id: task.id,
					title: task.title,
					state: task.state,
					hasPendingRequest: Boolean(task.pendingRequest),
				}}
				onRequestStateChange={(verb, reason) => handleRequestStateChange(task.id, verb, reason)}
				onCancelPendingRequest={() => handleCancelPendingRequest(task.id)}
				onOpenThread={() => handleOpenThread(task.id)}
			/>
		),
		[handleRequestStateChange, handleCancelPendingRequest, handleOpenThread],
	);

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
				<Canvas bets={CANVAS_BETS} capacity={3} onMoveBet={NOOP_MOVE_BET} />
			</div>
			{pitchSelectorOpen ? (
				<PitchSelector
					pitches={MOCK_PITCHES}
					selectedIds={selectedPitchIds}
					onSelect={handleSelectPitch}
					onClose={() => setPitchSelectorOpen(false)}
				/>
			) : (
				<div data-testid="work-team-kanban">
					<Kanban
						tasks={tasks}
						renderTaskActions={renderTaskActions}
						onTaskPendingChipClick={handleOpenThread}
						groupByBet
					/>
				</div>
			)}
		</div>
	);
}
