/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 *
 * @lore L15: drag-to-move was removed from the Kanban. Tasks are
 * agent-team-owned. The founder REQUESTS a state change via the kebab,
 * which posts a plain message into the task's thread (`host_kind=task`).
 * On first request for a task without a thread, we lazy-bootstrap the
 * thread via POST /api/threads (atomic create + initialMessage). See
 * plans/L15/architecture.md §3.4 + §4.1.
 */
import { requestMessageText, type TaskRequestVerb } from "@hyperidle/shared";
import { type JSX, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
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

type ToastTone = "info" | "error";

interface ToastState {
	id: string;
	tone: ToastTone;
	message: string;
}

const FOUNDER_IDENTITY = "u-founder";

function isThreadCreateResponse(value: unknown): value is { thread: { id: string } } {
	if (typeof value !== "object" || value === null) return false;
	const thread = (value as { thread?: unknown }).thread;
	if (typeof thread !== "object" || thread === null) return false;
	const id = (thread as { id?: unknown }).id;
	return typeof id === "string" && id.length > 0;
}

export function WorkTeam(): JSX.Element {
	const navigate = useNavigate();
	const [tasks, setTasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);
	const [toast, setToast] = useState<ToastState | null>(null);
	// L15 (AR1/SR1/DR5): per-task in-flight guard. Maps taskId → the verb (or
	// "open-thread") currently being awaited. While an entry exists, the
	// kebab is disabled and the matching menu row shows a spinner. Approved
	// §5 + architecture §3.4: this is the front-line guard against
	// double-firing — without it two distinct UUIDs sneak past the server
	// idempotency unique-constraint and produce two real messages per click.
	const [pendingByTask, setPendingByTask] = useState<
		Record<string, TaskRequestVerb | "open-thread">
	>({});

	const showToast = useCallback((message: string, tone: ToastTone): void => {
		const id = crypto.randomUUID();
		setToast({ id, message, tone });
		setTimeout(() => {
			setToast((current) => (current && current.id === id ? null : current));
		}, 4000);
	}, []);

	// @lore L15: handleMoveBet / handleAddToCanvas are no-op mocks — bet
	// persistence is owned by a downstream workpackage. They exist here so
	// the Canvas / PitchSelector handlers remain wired (component contracts
	// require the prop) without requiring a real backend write in L15.
	const handleMoveBet = useCallback(
		(_betId: string, _targetStatus: "shaped" | "committed"): void => {
			// no-op — see @lore above.
		},
		[],
	);

	const handleSelectPitch = useCallback((pitchId: string): void => {
		setSelectedPitchIds((prev) =>
			prev.includes(pitchId) ? prev.filter((id) => id !== pitchId) : [...prev, pitchId],
		);
	}, []);

	const handleAddToCanvas = useCallback((_pitchId: string): void => {
		// no-op — see @lore on handleMoveBet.
	}, []);

	const handleOpenThread = useCallback(
		async (taskId: string): Promise<void> => {
			const task = tasks.find((t) => t.id === taskId);
			if (!task) return;
			const threadId = task.threadId;
			if (threadId) {
				navigate(`/conversations/review?id=${encodeURIComponent(threadId)}`);
				return;
			}
			// L15 DR4 (BLOCKER): No thread yet — bootstrap server-side then
			// navigate. Approved.md §5 row "Populated, no thread": *"Open
			// thread row present; on activation, creates the thread
			// server-side then navigates."* POST /api/threads with no
			// initialMessage so the founder lands on a clean thread shell.
			if (pendingByTask[taskId]) return;
			setPendingByTask((prev) => ({ ...prev, [taskId]: "open-thread" }));
			let response: Response;
			try {
				response = await fetch("/api/threads", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Identity": FOUNDER_IDENTITY,
					},
					body: JSON.stringify({
						hostKind: "task",
						hostId: task.id,
						participants: [FOUNDER_IDENTITY],
						pinned: false,
					}),
				});
			} catch {
				setPendingByTask((prev) => {
					const { [taskId]: _, ...rest } = prev;
					return rest;
				});
				showToast("Could not open thread — try again.", "error");
				return;
			}
			if (!response.ok) {
				setPendingByTask((prev) => {
					const { [taskId]: _, ...rest } = prev;
					return rest;
				});
				showToast("Could not open thread — try again.", "error");
				return;
			}
			const json: unknown = await response.json();
			if (!isThreadCreateResponse(json)) {
				setPendingByTask((prev) => {
					const { [taskId]: _, ...rest } = prev;
					return rest;
				});
				showToast("Could not open thread — try again.", "error");
				return;
			}
			const newThreadId = json.thread.id;
			setTasks((prev) =>
				prev.map((t) =>
					t.id === taskId ? { ...t, threadId: newThreadId, threadUnreadCount: 0 } : t,
				),
			);
			setPendingByTask((prev) => {
				const { [taskId]: _, ...rest } = prev;
				return rest;
			});
			navigate(`/conversations/review?id=${encodeURIComponent(newThreadId)}`);
		},
		[navigate, tasks, pendingByTask, showToast],
	);

	const handleRequestStateChange = useCallback(
		async (taskId: string, verb: TaskRequestVerb): Promise<void> => {
			const task = tasks.find((t) => t.id === taskId);
			if (!task) return;
			// L15 AR1/SR1/DR5: in-flight guard. Architecture §3.4 names this
			// as the front-line guard against duplicate posts.
			if (pendingByTask[taskId]) return;
			setPendingByTask((prev) => ({ ...prev, [taskId]: verb }));
			const clearPending = (): void => {
				setPendingByTask((prev) => {
					const { [taskId]: _, ...rest } = prev;
					return rest;
				});
			};
			const text = requestMessageText(verb);
			const clientKey = crypto.randomUUID();

			// Network errors and CORS rejections surface as fetch throws — catch
			// only those and turn them into a user-facing error toast. A 2xx
			// with a malformed body is handled below as a server contract bug;
			// JSON parse errors propagate (they are bugs, not network failures).
			let response: Response;
			try {
				if (task.threadId) {
					response = await fetch(`/api/threads/${encodeURIComponent(task.threadId)}/messages`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Identity": FOUNDER_IDENTITY,
						},
						body: JSON.stringify({
							type: "plain",
							payload: { text },
							clientKey,
						}),
					});
				} else {
					response = await fetch("/api/threads", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Identity": FOUNDER_IDENTITY,
						},
						body: JSON.stringify({
							hostKind: "task",
							hostId: task.id,
							participants: [FOUNDER_IDENTITY],
							pinned: false,
							initialMessage: {
								type: "plain",
								payload: { text },
								clientKey,
							},
						}),
					});
				}
			} catch {
				clearPending();
				showToast("Could not post request — try again.", "error");
				return;
			}

			if (!response.ok) {
				clearPending();
				showToast("Could not post request — try again.", "error");
				return;
			}

			if (!task.threadId) {
				const json: unknown = await response.json();
				if (!isThreadCreateResponse(json)) {
					// Server returned 2xx but the body is missing thread.id.
					// Treat as a server-side error; do not toast success.
					clearPending();
					showToast("Could not post request — try again.", "error");
					return;
				}
				const newThreadId = json.thread.id;
				setTasks((prev) =>
					prev.map((t) =>
						t.id === taskId ? { ...t, threadId: newThreadId, threadUnreadCount: 0 } : t,
					),
				);
			}
			clearPending();
			showToast("Request posted to thread", "info");
		},
		[tasks, showToast, pendingByTask],
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
						onOpenThread={(taskId) => {
							void handleOpenThread(taskId);
						}}
						onRequestStateChange={(taskId, verb) => {
							void handleRequestStateChange(taskId, verb);
						}}
						pendingByTask={pendingByTask}
					/>
				</div>
			)}
			{toast && (
				<div className="toast toast-end z-50">
					<div
						className={`alert ${toast.tone === "info" ? "alert-info" : "alert-error"} alert-sm text-[11px]`}
						role="status"
					>
						<span>{toast.message}</span>
					</div>
				</div>
			)}
		</div>
	);
}
