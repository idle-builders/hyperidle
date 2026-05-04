// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted states
// map to the "Planned" column. Tasks with hold, review, or killed states are excluded.
//
// @lore L15: drag/drop is deleted. Tasks are agent-team-owned per v3 — humans
// request, agents decide. The DnD scaffolding (DndContext, useDraggable,
// useDroppable, KeyboardSensor, PointerSensor, COLUMN_TO_STATE,
// resolveKanbanDrop, DraggableTaskCard, KanbanDropZone, handleDragStart/End,
// DragOverlay) is gone from this file. `STATE_TO_COLUMN` survives — it's the
// read-direction map for grouping. The card body uses `data-testid=
// "task-card-{id}"` (was `draggable-task-{id}` under DnD). Drag survives ONLY
// on the Canvas (Shaped → Committed) — Canvas.tsx is untouched.
import { dsShellProps, EmptyState, Tag, TaskCard } from "@hyperidle/design-system";
import { requestableVerbsFor, type TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { TaskRequestPopover } from "./TaskRequestPopover";

export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	/** L15 — server agent id used as a thread participant. */
	ownerAgentId: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
	/** L15 — server-confirmed thread id; null when no thread exists yet. */
	threadId?: string | null;
	/** L15 — total messages in the attached thread. */
	threadCount?: number;
	/** L15 — unread count; defaults 0 in L15 (read-state ships in a follow-up). */
	threadUnread?: number;
}

export interface KanbanProps {
	tasks: KanbanTask[];
	/**
	 * J5: when true, tasks within each column are grouped under a
	 * collapsible bet header (bet name + task count). Tasks without a
	 * `betTag` group under an "Unassigned" header.
	 */
	groupByBet?: boolean;
	/** L15 — founder identity for participant + actor-name on requests. */
	founderId?: string;
	founderName?: string;
	/**
	 * L15 — invoked after a request post succeeds, so the parent can update
	 * the cached `threadId` and bump the unread/count chip optimistically.
	 */
	onTaskRequestSent?: (taskId: string, result: { threadId: string }) => void;
}

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done";

/**
 * Maps every TaskState to a Kanban column, or `null` for states the board
 * deliberately hides (hold, killed). Exhaustive `Record<TaskState, …>` so the
 * type checker flags any new TaskState — a partial map would silently drop
 * tasks on union growth, which is what @lore at the top of the file warns
 * against.
 *
 * @lore I4 cross-cutting: the point of the exhaustiveness story is that any
 * new TaskState forces a decision here. Do not loosen to `Partial<…>`.
 */
const STATE_TO_COLUMN: Record<TaskState, KanbanColumnState | null> = {
	proposed: "planned",
	accepted: "planned",
	hold: null,
	blocked: "blocked",
	in_progress: "in_progress",
	review: "in_progress",
	done: "done",
	killed: null,
};

const COLUMNS: { key: KanbanColumnState; label: string }[] = [
	{ key: "planned", label: "Planned" },
	{ key: "blocked", label: "Blocked" },
	{ key: "in_progress", label: "In Progress" },
	{ key: "done", label: "Done" },
];

const DEFAULT_FOUNDER_ID = "u-founder";
const DEFAULT_FOUNDER_NAME = "A. Founder";

/**
 * Pure helper: groups a list of tasks by `betTag` preserving input order.
 * Tasks without a `betTag` collapse under the sentinel key "Unassigned".
 * Extracted so the group-headers story can be unit-tested without mounting
 * the whole Kanban.
 */
export function groupTasksByBet(
	tasks: readonly KanbanTask[],
): Array<{ bet: string; tasks: KanbanTask[] }> {
	const order: string[] = [];
	const groups = new Map<string, KanbanTask[]>();
	for (const task of tasks) {
		const bet = task.betTag ?? "Unassigned";
		let bucket = groups.get(bet);
		if (!bucket) {
			bucket = [];
			groups.set(bet, bucket);
			order.push(bet);
		}
		bucket.push(task);
	}
	return order.map((bet) => ({ bet, tasks: groups.get(bet) ?? [] }));
}

interface TaskCardActionsProps {
	task: KanbanTask;
	founderId: string;
	founderName: string;
	onSent: (result: { threadId: string }) => void;
}

function TaskCardActions({
	task,
	founderId,
	founderName,
	onSent,
}: TaskCardActionsProps): JSX.Element | null {
	const verbs = requestableVerbsFor(task.state);
	const hasRequest = verbs.length > 0;
	const threadCount = task.threadCount ?? 0;
	const threadUnread = task.threadUnread ?? 0;
	const hasThread = task.threadId != null && threadCount > 0;
	if (!(hasRequest || hasThread)) {
		return null;
	}
	// L15: AQ-015 — every interactive element must be ≥ 44 CSS px at viewport
	// ≤ 1024 px. Tailwind responsive variants didn't reliably override
	// DaisyUI's chrome cascade; inline style is a sledgehammer that always
	// wins. Desktop visually inherits the same 44px footprint — small price
	// for a stable touch contract. Tracked: `kanban-thread-chip-density-tokens`.
	const threadLinkClass =
		"text-[12px] text-[var(--text-mid)] hover:text-[var(--text-hi)] ml-auto inline-flex items-center";
	const touchTargetStyle = { minHeight: 44, minWidth: 44 } as const;
	return (
		<div className="flex items-center justify-between">
			{hasRequest ? (
				<TaskRequestPopover
					task={{ id: task.id, state: task.state, ownerAgentId: task.ownerAgentId }}
					founderId={founderId}
					founderName={founderName}
					threadId={task.threadId ?? null}
					onSent={onSent}
				/>
			) : null}
			{hasThread ? (
				<a
					href={`/work/team/tasks/${task.id}/thread`}
					aria-label={
						threadUnread > 0
							? `Open thread (${threadCount} messages, ${threadUnread} unread)`
							: `Open thread (${threadCount} messages)`
					}
					className={threadLinkClass}
					style={touchTargetStyle}
				>
					<Tag label={`Thread (${threadCount})`} unread={threadUnread > 0} />
				</a>
			) : (
				<a
					href={`/work/team/tasks/${task.id}/thread`}
					className={threadLinkClass}
					style={touchTargetStyle}
				>
					<span className="font-heading text-[11px] uppercase tracking-wider">Open thread</span>
				</a>
			)}
		</div>
	);
}

interface RenderTaskOptions {
	task: KanbanTask;
	founderId: string;
	founderName: string;
	onSent: (taskId: string, result: { threadId: string }) => void;
}

function renderTask({ task, founderId, founderName, onSent }: RenderTaskOptions): JSX.Element {
	/*
	 * @lore L15 review (apply H / Design MF-2): only pass an `actions` slot
	 * when there is something to render. TaskCard's footer divider check is
	 * `actions ? <div>…</div> : null`; passing a `<TaskCardActions />` element
	 * is always truthy even when the component returns `null`, so terminal
	 * tasks without a thread used to render an empty 1 px divider strip. We
	 * pre-compute the same `(hasRequest || hasThread)` predicate here and
	 * omit the slot entirely otherwise.
	 */
	const hasRequest = requestableVerbsFor(task.state).length > 0;
	const hasThread = task.threadId != null && (task.threadCount ?? 0) > 0;
	const showActions = hasRequest || hasThread;
	const actionsProp = showActions ? (
		<TaskCardActions
			task={task}
			founderId={founderId}
			founderName={founderName}
			onSent={(result) => onSent(task.id, result)}
		/>
	) : undefined;
	return (
		<div key={task.id} data-testid={`task-card-${task.id}`}>
			<TaskCard
				title={task.title}
				owner={task.owner}
				state={task.state}
				cost={task.cost}
				betTag={task.betTag}
				{...(actionsProp ? { actions: actionsProp } : {})}
			/>
		</div>
	);
}

export function Kanban({
	tasks,
	groupByBet = false,
	founderId = DEFAULT_FOUNDER_ID,
	founderName = DEFAULT_FOUNDER_NAME,
	onTaskRequestSent,
}: KanbanProps): JSX.Element {
	const [collapsedBets, setCollapsedBets] = useState<Set<string>>(() => new Set());

	function toggleBet(bet: string): void {
		setCollapsedBets((prev) => {
			const next = new Set(prev);
			if (next.has(bet)) {
				next.delete(bet);
			} else {
				next.add(bet);
			}
			return next;
		});
	}

	const tasksByColumn = useMemo(() => {
		const grouped: Record<KanbanColumnState, KanbanTask[]> = {
			planned: [],
			blocked: [],
			in_progress: [],
			done: [],
		};
		for (const task of tasks) {
			const col = STATE_TO_COLUMN[task.state];
			if (col !== null) {
				grouped[col].push(task);
			}
		}
		return grouped;
	}, [tasks]);

	const handleSent = (taskId: string, result: { threadId: string }): void => {
		onTaskRequestSent?.(taskId, result);
	};

	return (
		/*
		 * @lore K11: column gap → --density-gap per density-audit.md
		 * § 3.3.K7. Column count fixed at four on `lg`; comfortable widens
		 * the gap without dropping columns (operational view).
		 */
		<div
			{...dsShellProps("Kanban")}
			className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--density-gap)]"
		>
			{COLUMNS.map((col) => {
				const columnTasks = tasksByColumn[col.key];
				return (
					<div key={col.key} className="flex flex-col gap-2">
						<div className="flex items-center gap-2 mb-1">
							<h3 className="text-sm font-semibold">{col.label}</h3>
							{columnTasks.length > 0 && (
								<span className="badge badge-sm badge-ghost">{columnTasks.length}</span>
							)}
						</div>
						<div className="flex flex-col gap-2 min-h-[48px]">
							{columnTasks.length === 0 ? (
								<EmptyState
									title={`No tasks in ${col.label.toLowerCase()}`}
									description="Tasks land here as agents pick them up."
								/>
							) : groupByBet ? (
								groupTasksByBet(columnTasks).map((group) => {
									const collapsed = collapsedBets.has(group.bet);
									const count = group.tasks.length;
									return (
										<div key={group.bet} className="flex flex-col gap-1">
											<button
												type="button"
												aria-label={`${group.bet} group (${count} ${count === 1 ? "task" : "tasks"})`}
												aria-expanded={!collapsed}
												className="flex items-center gap-2 text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] hover:text-[var(--text-hi)] px-1"
												onClick={() => toggleBet(group.bet)}
											>
												<span aria-hidden>{collapsed ? "▸" : "▾"}</span>
												<span>{group.bet}</span>
												<span className="badge badge-xs badge-neutral">{count}</span>
											</button>
											{!collapsed &&
												group.tasks.map((task) =>
													renderTask({ task, founderId, founderName, onSent: handleSent }),
												)}
										</div>
									);
								})
							) : (
								columnTasks.map((task) =>
									renderTask({ task, founderId, founderName, onSent: handleSent }),
								)
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
