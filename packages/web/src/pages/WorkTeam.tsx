/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 *
 * @lore L15: drag/drop is removed from the Kanban; tasks are agent-team-owned.
 * Humans interact via `<TaskRequestMenu>` (request a state change) and
 * `Open thread` (navigate to Conversations). The legacy move-task callback
 * plumbing is gone — task state lives server-side.
 */
import type { TaskRequestSubmission } from "@hyperidle/design-system";
import { generateRequestMessageText, type InlineRef, verbLabelFor } from "@hyperidle/shared";
import { type JSX, useCallback, useRef, useState } from "react";
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

// L15 adversary C3: memoise the clientKey per (taskId, requestedState,
// note-text-hash) within a 2-second window so a rapid double-click before
// the first POST is in flight still dedupes server-side. The TaskRequestMenu's
// in-flight guard alone does not cover the case where the SECOND click fires
// before React has flushed `setSubmitting(true)`.
const CLIENT_KEY_DEDUPE_WINDOW_MS = 2000;

interface ClientKeyCacheEntry {
	readonly key: string;
	readonly mintedAt: number;
}

function hashNote(note: string | null): string {
	// Tiny non-cryptographic hash — only needs to differ when the note text
	// differs. Used purely as a cache key qualifier.
	if (note === null) return "0";
	let h = 0;
	for (let i = 0; i < note.length; i += 1) {
		h = (h * 31 + note.charCodeAt(i)) | 0;
	}
	return h.toString(36);
}

export function WorkTeam(): JSX.Element {
	const navigate = useNavigate();
	const [tasks] = useState<readonly KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);
	const clientKeyCache = useRef<Map<string, ClientKeyCacheEntry>>(new Map());

	const mintOrReuseClientKey = useCallback(
		(taskId: string, targetState: string | null, note: string | null): string => {
			const cacheKey = `${taskId}|${targetState ?? "null"}|${hashNote(note)}`;
			const now = Date.now();
			const existing = clientKeyCache.current.get(cacheKey);
			if (existing && now - existing.mintedAt < CLIENT_KEY_DEDUPE_WINDOW_MS) {
				return existing.key;
			}
			const fresh = crypto.randomUUID();
			clientKeyCache.current.set(cacheKey, { key: fresh, mintedAt: now });
			return fresh;
		},
		[],
	);

	const handleSubmitTaskRequest = useCallback(
		async (taskId: string, req: TaskRequestSubmission): Promise<void> => {
			const task = tasks.find((t) => t.id === taskId);
			if (!task) return;
			const verbLabel = req.targetState === null ? null : verbLabelFor(task.state, req.targetState);
			const text = generateRequestMessageText({
				taskTitle: task.title,
				targetState: req.targetState,
				targetVerbLabel: verbLabel,
				note: req.note,
			});
			const refs: InlineRef[] = [];
			if (req.targetState !== null) {
				refs.push({
					kind: "request_state_change",
					taskId,
					requestedState: req.targetState,
				});
			}
			const body = {
				type: "plain" as const,
				payload: { text, refs },
				clientKey: mintOrReuseClientKey(taskId, req.targetState, req.note),
			};
			const res = await fetch(`/api/tasks/${taskId}/thread/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				throw new Error(`Request failed: ${res.status}`);
			}
		},
		[tasks, mintOrReuseClientKey],
	);

	const handleOpenTaskThread = useCallback(
		(taskId: string): void => {
			void (async () => {
				const res = await fetch(`/api/tasks/${taskId}/thread`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});
				if (res.status === 404) {
					// L15 F1: GET is non-mutating; if no thread has been minted yet,
					// land on the conversations page filtered by task — the user can
					// initiate from there or via the request menu.
					navigate(`/conversations?taskId=${encodeURIComponent(taskId)}`);
					return;
				}
				if (!res.ok) {
					throw new Error(`Failed to open task thread: ${res.status}`);
				}
				const data = (await res.json()) as { thread: { id: string } };
				navigate(`/conversations?id=${encodeURIComponent(data.thread.id)}`);
			})();
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
						tasks={[...tasks]}
						onSubmitTaskRequest={handleSubmitTaskRequest}
						onOpenTaskThread={handleOpenTaskThread}
						groupByBet
					/>
				</div>
			)}
		</div>
	);
}
