// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted states
// map to the "Planned" column. Tasks with hold, review, or killed states are excluded.
//
// @lore L15: drag-to-move was REMOVED in L15. Tasks are agent-team-owned —
// the founder requests a state change via the TaskCard kebab menu instead
// of dragging. Drag survives only on Canvas (Shaped → Committed). See
// plans/L15/design/approved.md §1, §7.
import { dsShellProps, EmptyState, TaskCard } from "@hyperidle/design-system";
import type { TaskRequestVerb, TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";

export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
	threadId?: string;
	/**
	 * undefined → no thread yet → no dot.
	 * 0         → thread exists, all read → grey dot.
	 * > 0       → unread → primary-tint dot + interactive title row.
	 */
	threadUnreadCount?: number;
}

export interface KanbanProps {
	tasks: KanbanTask[];
	/**
	 * J5: when true, tasks within each column are grouped under a
	 * collapsible bet header (bet name + task count). Tasks without a
	 * `betTag` group under an "Unassigned" header.
	 */
	groupByBet?: boolean;
	/**
	 * L15: per-task callbacks. Called with the task id so the page-level
	 * smart container (WorkTeam.tsx) can route the request through the
	 * thread-message API.
	 */
	onOpenThread?: (taskId: string) => void;
	onRequestStateChange?: (taskId: string, verb: TaskRequestVerb) => void;
	/**
	 * L15 (AR1/SR1/DR5): per-task in-flight pending state. Maps taskId →
	 * the verb (or "open-thread") currently being awaited. The kebab on
	 * each card disables itself and shows a `loading-xs` spinner on the
	 * matching menu row while the value is set.
	 */
	pendingByTask?: Record<string, TaskRequestVerb | "open-thread">;
}

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done";

/**
 * Maps every TaskState to a Kanban column, or `null` for states the board
 * deliberately hides (hold, killed). Exhaustive `Record<TaskState, …>` so the
 * type checker flags any new TaskState — a partial map would silently drop
 * tasks on union growth.
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

/**
 * Pure helper: groups a list of tasks by `betTag` preserving input order.
 * Tasks without a `betTag` collapse under the sentinel key "Unassigned".
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

function TaskCell({
	task,
	onOpenThread,
	onRequestStateChange,
	pendingVerb,
}: {
	task: KanbanTask;
	onOpenThread?: (taskId: string) => void;
	onRequestStateChange?: (taskId: string, verb: TaskRequestVerb) => void;
	pendingVerb?: TaskRequestVerb | "open-thread" | null;
}): JSX.Element {
	return (
		<TaskCard
			title={task.title}
			owner={task.owner}
			state={task.state}
			cost={task.cost}
			betTag={task.betTag}
			threadUnreadCount={task.threadUnreadCount}
			onOpenThread={onOpenThread ? () => onOpenThread(task.id) : undefined}
			onRequestStateChange={
				onRequestStateChange ? (verb) => onRequestStateChange(task.id, verb) : undefined
			}
			pendingVerb={pendingVerb ?? null}
		/>
	);
}

export function Kanban({
	tasks,
	groupByBet = false,
	onOpenThread,
	onRequestStateChange,
	pendingByTask,
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

	return (
		<div
			{...dsShellProps("Kanban")}
			className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--density-gap)]"
		>
			{COLUMNS.map((col) => {
				const columnTasks = tasksByColumn[col.key];
				return (
					<div
						key={col.key}
						data-kanban-column={col.key}
						className="flex flex-col gap-[var(--density-gap)]"
					>
						<div className="flex items-center gap-[var(--density-gap)] mb-[var(--density-gap)]">
							<h3 className="text-sm font-semibold">{col.label}</h3>
							{columnTasks.length > 0 && (
								<span className="badge badge-sm badge-ghost">{columnTasks.length}</span>
							)}
						</div>
						<div className="flex flex-col gap-[var(--density-gap)] min-h-[48px] rounded-[var(--r1)] p-[var(--density-pad-x)]">
							{columnTasks.length === 0 ? (
								<EmptyState
									title={`No tasks in ${col.label.toLowerCase()}`}
									description="Tasks land here when the team commits to them."
								/>
							) : groupByBet ? (
								groupTasksByBet(columnTasks).map((group) => {
									const collapsed = collapsedBets.has(group.bet);
									const count = group.tasks.length;
									return (
										<div key={group.bet} className="flex flex-col gap-[var(--density-gap)]">
											<button
												type="button"
												aria-label={`${group.bet} group (${count} ${count === 1 ? "task" : "tasks"})`}
												aria-expanded={!collapsed}
												className="flex items-center gap-[var(--density-gap)] text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] hover:text-[var(--text-hi)] px-[var(--density-pad-x)]"
												onClick={() => toggleBet(group.bet)}
											>
												<span aria-hidden>{collapsed ? "▸" : "▾"}</span>
												<span>{group.bet}</span>
												<span className="badge badge-xs badge-neutral">{count}</span>
											</button>
											{!collapsed &&
												group.tasks.map((task) => (
													<TaskCell
														key={task.id}
														task={task}
														onOpenThread={onOpenThread}
														onRequestStateChange={onRequestStateChange}
														pendingVerb={pendingByTask?.[task.id] ?? null}
													/>
												))}
										</div>
									);
								})
							) : (
								columnTasks.map((task) => (
									<TaskCell
										key={task.id}
										task={task}
										onOpenThread={onOpenThread}
										onRequestStateChange={onRequestStateChange}
										pendingVerb={pendingByTask?.[task.id] ?? null}
									/>
								))
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
