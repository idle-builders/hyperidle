// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted states
// map to the "Planned" column. Tasks with hold, review, or killed states are excluded.
//
// @lore L15: drag/drop was stripped wholesale per plan §4.5. The Team Board
// kanban is now read-only; the only mutation affordances are the
// `<TaskRequestMenu>` mounted in the TaskCard `actions` slot. Drag survives
// only on Canvas (Shaped → Committed) — see Canvas.tsx. The
// `Kanban.no-dnd-import.test.ts` tripwire pins this constraint.

import type { TaskRequestSubmission } from "@hyperidle/design-system";
import { dsShellProps, EmptyState, TaskCard, TaskRequestMenu } from "@hyperidle/design-system";
import type { TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";

export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
}

export interface KanbanProps {
	tasks: KanbanTask[];
	/**
	 * L15: posts a request to the task's attached thread. Returns a Promise
	 * so the menu can show a spinner during the in-flight POST.
	 */
	onSubmitTaskRequest: (taskId: string, req: TaskRequestSubmission) => Promise<void>;
	/**
	 * L15: navigate to the task's attached thread surface (Conversations).
	 */
	onOpenTaskThread: (taskId: string) => void;
	/**
	 * J5: when true, tasks within each column are grouped under a
	 * collapsible bet header (bet name + task count). Tasks without a
	 * `betTag` group under an "Unassigned" header.
	 */
	groupByBet?: boolean;
}

export type KanbanColumn = "planned" | "blocked" | "in_progress" | "done";

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
const STATE_TO_COLUMN: Record<TaskState, KanbanColumn | null> = {
	proposed: "planned",
	accepted: "planned",
	hold: null,
	blocked: "blocked",
	in_progress: "in_progress",
	review: "in_progress",
	done: "done",
	killed: null,
};

const COLUMNS: { key: KanbanColumn; label: string }[] = [
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

interface TaskCardWithMenuProps {
	task: KanbanTask;
	onSubmitTaskRequest: KanbanProps["onSubmitTaskRequest"];
	onOpenTaskThread: KanbanProps["onOpenTaskThread"];
}

function TaskCardWithMenu({
	task,
	onSubmitTaskRequest,
	onOpenTaskThread,
}: TaskCardWithMenuProps): JSX.Element {
	// @lore L15: `data-testid` (not `data-component`, which the DS reserves
	// for Tier classification per `.claude/rules/design-system.md`) scopes
	// integration-test queries to the card subtree.
	return (
		<div data-testid="task-card-with-menu" data-task-id={task.id}>
			<TaskCard
				title={task.title}
				owner={task.owner}
				state={task.state}
				cost={task.cost}
				betTag={task.betTag}
				actions={
					<TaskRequestMenu
						taskId={task.id}
						currentState={task.state}
						onSubmitRequest={(req) => onSubmitTaskRequest(task.id, req)}
						onOpenThread={() => onOpenTaskThread(task.id)}
					/>
				}
			/>
		</div>
	);
}

export function Kanban({
	tasks,
	onSubmitTaskRequest,
	onOpenTaskThread,
	groupByBet = false,
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
		const grouped: Record<KanbanColumn, KanbanTask[]> = {
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
					<div key={col.key} className="flex flex-col gap-2">
						<h3 className="text-sm font-semibold mb-1">{col.label}</h3>
						{columnTasks.length > 0 ? (
							<span className="badge badge-sm badge-ghost self-start -mt-1">
								{columnTasks.length}
							</span>
						) : null}
						<div className="flex flex-col gap-2 min-h-[48px] rounded p-1">
							{columnTasks.length === 0 ? (
								<EmptyState title={`No tasks in ${col.label.toLowerCase()}.`} />
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
												group.tasks.map((task) => (
													<TaskCardWithMenu
														key={task.id}
														task={task}
														onSubmitTaskRequest={onSubmitTaskRequest}
														onOpenTaskThread={onOpenTaskThread}
													/>
												))}
										</div>
									);
								})
							) : (
								columnTasks.map((task) => (
									<TaskCardWithMenu
										key={task.id}
										task={task}
										onSubmitTaskRequest={onSubmitTaskRequest}
										onOpenTaskThread={onOpenTaskThread}
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
