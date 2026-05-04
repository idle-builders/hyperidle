/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 *
 * @lore L15 §4.2: drag is removed from the team-board Kanban; humans request
 * via the TaskActionsMenu. The six callbacks below post to `/api/tasks/:id/*`.
 */
import type { RequestVerb } from "@hyperidle/shared";
import { type JSX, useCallback, useState } from "react";
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
		pendingRequest: null,
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

function buildClientKey(): string {
	return crypto.randomUUID();
}

export function WorkTeam(): JSX.Element {
	// Tasks come from INITIAL_TASKS until the live wiring lands (L15 §7
	// CONFUSION-1 resolution: page-level wire-up is a follow-up).
	const [tasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);

	const handleRequestStateChange = useCallback(
		(taskId: string, verb: RequestVerb, reason?: string): void => {
			void fetch(`/api/tasks/${encodeURIComponent(taskId)}/request`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ verb, ...(reason ? { reason } : {}), clientKey: buildClientKey() }),
			});
		},
		[],
	);

	const handleCancelPendingRequest = useCallback((taskId: string): void => {
		void fetch(`/api/tasks/${encodeURIComponent(taskId)}/request`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ verb: "cancel_request", clientKey: buildClientKey() }),
		});
	}, []);

	const handleOpenThread = useCallback((taskId: string): void => {
		// Page-level routing wire-up is a follow-up. For now log via fetch HEAD as a
		// no-op observable side effect would be wrong — use a window navigation hint.
		if (typeof window !== "undefined") {
			window.location.hash = `#/tasks/${taskId}`;
		}
	}, []);

	// @lore L15 simplification-scan SF6: the prior implementation posted
	// `verb: "request_changes"`, which is only legal in `review` state and
	// 400s elsewhere. A free-form reply belongs on `POST /api/threads/:id/
	// messages`; that wire-up is a follow-up (L15 §7 CONFUSION-1). Until
	// then the Reply menu item is a no-op rather than a state-illegal call.
	const handleReplyInThread = useCallback((_taskId: string, _body: string): void => {
		// Follow-up: route through threads endpoint once the page-level
		// thread wiring lands.
	}, []);

	const handleSnooze24h = useCallback((taskId: string): void => {
		void fetch(`/api/tasks/${encodeURIComponent(taskId)}/snooze`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ hours: 24 }),
		});
	}, []);

	const handleCopyLink = useCallback((taskId: string): void => {
		if (typeof navigator !== "undefined" && navigator.clipboard) {
			void navigator.clipboard.writeText(
				`${typeof window !== "undefined" ? window.location.origin : ""}/tasks/${taskId}`,
			);
		}
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
						groupByBet
						onRequestStateChange={handleRequestStateChange}
						onCancelPendingRequest={handleCancelPendingRequest}
						onOpenThread={handleOpenThread}
						onReplyInThread={handleReplyInThread}
						onSnooze24h={handleSnooze24h}
						onCopyLink={handleCopyLink}
					/>
				</div>
			)}
		</div>
	);
}
