/**
 * Work/Team page — composes Canvas (top) + Kanban (bottom) + PitchSelector
 * (overlay). Spec: HUMAN_INTERFACE_LAYER.md §4 — Team view shows the team's
 * current bets at the top and a per-task kanban board beneath.
 *
 * @lore L15: handleMoveTask + COLUMN_TO_STATE are deleted (drag is gone from
 * the Kanban). On mount we fetch per-task thread metadata via
 * `GET /api/threads?host_kind=task&host_id={id}` for each visible task. The
 * fan-out uses Promise.allSettled — a single failed fetch falls back to
 * `threadId=null, threadCount=0` for that card. SLO: ≤ 800ms p95 for ≤ 25
 * tasks (plan §5.3).
 */
import { type JSX, useCallback, useEffect, useState } from "react";
import { decodeThreadDetail } from "../lib/thread-detail";
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

/**
 * @lore L15: `ownerAgentId` is fixture-only synthetic data. Real agent-team
 * membership tracking is in the follow-up `team-scoped-tasks-and-agent-
 * membership`. Don't promote these ids to a contract.
 */
const INITIAL_TASKS: KanbanTask[] = [
	{
		id: "t1",
		title: "Implement login endpoint",
		owner: "Dev Agent 1",
		ownerAgentId: "agent-dev-1",
		state: "in_progress",
		cost: "$4.20",
		betTag: "Auth",
	},
	{
		id: "t2",
		title: "Design signup form",
		owner: "Dev Agent 2",
		ownerAgentId: "agent-dev-2",
		state: "accepted",
		cost: "$1.80",
		betTag: "Auth",
	},
	{
		id: "t3",
		title: "JWT refresh logic",
		owner: "Dev Agent 1",
		ownerAgentId: "agent-dev-1",
		state: "review",
		cost: "$6.50",
		betTag: "Auth",
	},
	{
		id: "t4",
		title: "Write auth tests",
		owner: "Dev Agent 2",
		ownerAgentId: "agent-dev-2",
		state: "done",
		cost: "$3.10",
		betTag: "Auth",
	},
	{
		id: "t5",
		title: "Rate limit middleware",
		owner: "Dev Agent 1",
		ownerAgentId: "agent-dev-1",
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

/*
 * @lore L15 review (apply Arch SF-1 / Security SHOULD-2): replaced
 * `as ThreadListResponse` / `as ThreadDetailResponse` casts with explicit
 * runtime decoders. The list shape is narrow enough (just `id`) to inline;
 * the detail shape reuses the canonical `decodeThreadDetail`.
 */
function decodeThreadList(value: unknown): Array<{ id: string }> {
	if (typeof value !== "object" || value === null) return [];
	const threads = (value as { threads?: unknown }).threads;
	if (!Array.isArray(threads)) return [];
	const out: Array<{ id: string }> = [];
	for (const row of threads) {
		if (typeof row === "object" && row !== null) {
			const id = (row as { id?: unknown }).id;
			if (typeof id === "string") out.push({ id });
		}
	}
	return out;
}

async function fetchThreadMetaForTask(
	taskId: string,
	signal: AbortSignal,
): Promise<{ taskId: string; threadId: string | null; threadCount: number }> {
	const listRes = await fetch(`/api/threads?host_kind=task&host_id=${encodeURIComponent(taskId)}`, {
		signal,
	});
	if (!listRes.ok) {
		return { taskId, threadId: null, threadCount: 0 };
	}
	const threadsList = decodeThreadList(await listRes.json());
	const first = threadsList[0];
	if (!first) {
		return { taskId, threadId: null, threadCount: 0 };
	}
	const detailRes = await fetch(`/api/threads/${first.id}`, { signal });
	if (!detailRes.ok) {
		return { taskId, threadId: first.id, threadCount: 0 };
	}
	try {
		const detail = decodeThreadDetail(await detailRes.json());
		return { taskId, threadId: first.id, threadCount: detail.messages.length };
	} catch {
		return { taskId, threadId: first.id, threadCount: 0 };
	}
}

export function WorkTeam(): JSX.Element {
	const [tasks, setTasks] = useState<KanbanTask[]>(INITIAL_TASKS);
	const [pitchSelectorOpen, setPitchSelectorOpen] = useState(false);
	const [selectedPitchIds, setSelectedPitchIds] = useState<string[]>([]);

	useEffect(() => {
		// L15: per-task thread-metadata fan-out at mount. Promise.allSettled so
		// a single failed fetch does not abort the batch.
		const ac = new AbortController();
		(async (): Promise<void> => {
			const results = await Promise.allSettled(
				INITIAL_TASKS.map((t) => fetchThreadMetaForTask(t.id, ac.signal)),
			);
			if (ac.signal.aborted) return;
			const byId = new Map<string, { threadId: string | null; threadCount: number }>();
			for (const r of results) {
				if (r.status === "fulfilled") {
					byId.set(r.value.taskId, {
						threadId: r.value.threadId,
						threadCount: r.value.threadCount,
					});
				}
			}
			setTasks((prev) =>
				prev.map((t) => {
					const meta = byId.get(t.id);
					if (!meta) return t;
					/*
					 * @lore L15 review (apply C / Adversary M2): mount-fetch +
					 * popover-create race. If the user opened the popover and
					 * created a thread BEFORE this fetch resolved, `t.threadId`
					 * is already a real id. Do NOT clobber it with the stale
					 * fetch result (which still saw zero threads). Only adopt
					 * the fetched threadId when state currently has none. The
					 * threadCount may also have been bumped optimistically by
					 * `handleTaskRequestSent`; keep the larger value.
					 */
					const threadId = t.threadId ?? meta.threadId;
					const currentCount = t.threadCount ?? 0;
					const threadCount = Math.max(currentCount, meta.threadCount);
					return { ...t, threadId, threadCount };
				}),
			);
		})();
		return () => ac.abort();
	}, []);

	const handleSelectPitch = useCallback((pitchId: string): void => {
		setSelectedPitchIds((prev) =>
			prev.includes(pitchId) ? prev.filter((id) => id !== pitchId) : [...prev, pitchId],
		);
	}, []);

	const handleAddToCanvas = useCallback((_pitchId: string): void => {
		// Mock — real implementation promotes the pitch to a canvas bet.
	}, []);

	const handleMoveBet = useCallback(
		(_betId: string, _targetStatus: "shaped" | "committed"): void => {
			// Mock — the team-board canvas does not persist bet moves yet.
		},
		[],
	);

	const handleTaskRequestSent = useCallback(
		(taskId: string, result: { threadId: string }): void => {
			setTasks((prev) =>
				prev.map((t) =>
					t.id === taskId
						? {
								...t,
								threadId: result.threadId,
								threadCount: (t.threadCount ?? 0) + 1,
							}
						: t,
				),
			);
		},
		[],
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
					<Kanban tasks={tasks} groupByBet onTaskRequestSent={handleTaskRequestSent} />
				</div>
			)}
		</div>
	);
}
