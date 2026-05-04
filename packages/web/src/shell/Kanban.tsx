// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted
// states map to the "Planned" column. Tasks with hold or killed states are
// excluded.
//
// @lore L15 §4.1: drag is removed. Tasks are agent-team-owned; humans request
// state changes via TaskActionsMenu. Canvas Shaped→Committed drag survives
// in Canvas.tsx — that's the ONE valid human-owned move (Shape Up shaping).
import {
	dsShellProps,
	EmptyState,
	TaskActionsMenu,
	TaskCard,
} from "@hyperidle/design-system";
import type { PendingRequestSummary, RequestVerb, TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";

export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
	pendingRequest?: PendingRequestSummary | null;
}

export interface KanbanProps {
	tasks: KanbanTask[];
	groupByBet?: boolean;
	onRequestStateChange: (taskId: string, verb: RequestVerb, reason?: string) => void;
	onCancelPendingRequest: (taskId: string) => void;
	onOpenThread: (taskId: string) => void;
	onReplyInThread: (taskId: string, body: string) => void;
	onSnooze24h: (taskId: string) => void;
	onCopyLink: (taskId: string) => void;
}

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done";

/**
 * Maps every TaskState to a Kanban column, or `null` for states the board
 * deliberately hides (hold, killed). Exhaustive `Record<TaskState, …>` so the
 * type checker flags any new TaskState — a partial map would silently drop
 * tasks on union growth.
 *
 * @lore L15 §4.1: kept private — the inverse `COLUMN_TO_STATE` is removed
 * because dragging into a column is no longer a thing.
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

function TaskCardWithMenu({
	task,
	onRequestStateChange,
	onCancelPendingRequest,
	onOpenThread,
	onReplyInThread,
	onSnooze24h,
	onCopyLink,
}: {
	task: KanbanTask;
	onRequestStateChange: KanbanProps["onRequestStateChange"];
	onCancelPendingRequest: KanbanProps["onCancelPendingRequest"];
	onOpenThread: KanbanProps["onOpenThread"];
	onReplyInThread: KanbanProps["onReplyInThread"];
	onSnooze24h: KanbanProps["onSnooze24h"];
	onCopyLink: KanbanProps["onCopyLink"];
}): JSX.Element {
	return (
		<TaskActionsMenu
			task={{
				id: task.id,
				title: task.title,
				state: task.state,
				pendingRequest: task.pendingRequest ?? null,
			}}
			onRequestStateChange={(verb, reason) => onRequestStateChange(task.id, verb, reason)}
			onCancelPendingRequest={() => onCancelPendingRequest(task.id)}
			onOpenThread={() => onOpenThread(task.id)}
			onReplyInThread={(body) => onReplyInThread(task.id, body)}
			onSnooze24h={() => onSnooze24h(task.id)}
			onCopyLink={() => onCopyLink(task.id)}
		>
			{/*
			 * @lore L15 design CRITICAL-2: card-body activation opens the
			 * TaskActionsMenu (parent), NOT the thread. Open-thread is a
			 * dedicated menu item. Per approved.md §1 Pull-in 1.
			 */}
			<TaskCard
				title={task.title}
				owner={task.owner}
				state={task.state}
				cost={task.cost}
				betTag={task.betTag}
				pendingRequest={task.pendingRequest ?? null}
			/>
		</TaskActionsMenu>
	);
}

export function Kanban(props: KanbanProps): JSX.Element {
	const {
		tasks,
		groupByBet = false,
		onRequestStateChange,
		onCancelPendingRequest,
		onOpenThread,
		onReplyInThread,
		onSnooze24h,
		onCopyLink,
	} = props;
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

	const renderTask = (task: KanbanTask): JSX.Element => (
		<TaskCardWithMenu
			key={task.id}
			task={task}
			onRequestStateChange={onRequestStateChange}
			onCancelPendingRequest={onCancelPendingRequest}
			onOpenThread={onOpenThread}
			onReplyInThread={onReplyInThread}
			onSnooze24h={onSnooze24h}
			onCopyLink={onCopyLink}
		/>
	);

	return (
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
									description="Tasks for this column will appear here as agents pick them up."
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
											{!collapsed && group.tasks.map(renderTask)}
										</div>
									);
								})
							) : (
								columnTasks.map(renderTask)
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
