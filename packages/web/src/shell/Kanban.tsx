// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted states
// map to the "Planned" column. Tasks with hold, review, or killed states are excluded.
//
// @lore L15: drag-to-move was removed from this component. Tasks are
// agent-team-owned; humans REQUEST state changes via the per-card kebab
// (TaskActionsMenu). The card never moves on a request — it moves only when
// the agent updates TaskState. Canvas (Shaped→Committed) drag is unaffected.
import { dsShellProps, EmptyState, TaskCard } from "@hyperidle/design-system";
import type { TaskState } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TaskActionsMenu } from "./TaskActionsMenu";
import type { TaskActionsResult } from "./TaskActionsMenu";

export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
}

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done";

export interface KanbanProps {
	tasks: KanbanTask[];
	/**
	 * @lore L15: posts a state-change request to the task's thread. Returns a
	 * result type — never throws for expected errors. The Kanban renders a
	 * success or error toast based on the result; the card never moves.
	 */
	onTaskStateRequest: (
		taskId: string,
		targetColumn: KanbanColumnState,
	) => Promise<TaskActionsResult>;
	onOpenTaskThread: (taskId: string) => void;
	/**
	 * J5: when true, tasks within each column are grouped under a
	 * collapsible bet header (bet name + task count). Tasks without a
	 * `betTag` group under an "Unassigned" header.
	 */
	groupByBet?: boolean;
}

/**
 * Canonical TaskState → KanbanColumnState mapping. `null` means the task is
 * excluded from the board entirely (hold, killed). Exported so the kebab menu
 * and any future consumer share a single source of truth.
 */
export const STATE_TO_COLUMN: Record<TaskState, KanbanColumnState | null> = {
	proposed: "planned",
	accepted: "planned",
	hold: null,
	blocked: "blocked",
	in_progress: "in_progress",
	review: "in_progress",
	done: "done",
	killed: null,
};

/**
 * @lore I4 K1/K2: `"planned"` is NOT a valid TaskState. Kept exported even
 * after L15's drag removal because consumers (and the menu copy) still need
 * the column→state vocabulary.
 */
export const COLUMN_TO_STATE: Record<KanbanColumnState, TaskState> = {
	planned: "accepted",
	in_progress: "in_progress",
	blocked: "blocked",
	done: "done",
};

const COLUMNS: { key: KanbanColumnState; label: string }[] = [
	{ key: "planned", label: "Planned" },
	{ key: "blocked", label: "Blocked" },
	{ key: "in_progress", label: "In Progress" },
	{ key: "done", label: "Done" },
];

const COLUMN_TO_LABEL: Record<KanbanColumnState, string> = Object.fromEntries(
	COLUMNS.map((c) => [c.key, c.label]),
) as Record<KanbanColumnState, string>;

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

interface ToastState {
	kind: "success" | "error";
	text: string;
	seq: number;
}

const TOAST_DURATION_MS = 3000;

export function Kanban({
	tasks,
	onTaskStateRequest,
	onOpenTaskThread,
	groupByBet = false,
}: KanbanProps): JSX.Element {
	const [toast, setToast] = useState<ToastState | null>(null);
	const [liveText, setLiveText] = useState("");
	const toastSeqRef = useRef(0);
	const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const showToast = useCallback((kind: "success" | "error", text: string): void => {
		toastSeqRef.current += 1;
		const seq = toastSeqRef.current;
		setToast({ kind, text, seq });
		setLiveText(text);
		if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
		toastTimerRef.current = setTimeout(() => {
			setToast((current) => (current && current.seq === seq ? null : current));
		}, TOAST_DURATION_MS);
	}, []);
	useEffect(
		() => () => {
			if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
		},
		[],
	);
	const [collapsedBets, setCollapsedBets] = useState<Set<string>>(() => new Set());

	function toggleBet(bet: string): void {
		setCollapsedBets((prev) => {
			const next = new Set(prev);
			if (next.has(bet)) next.delete(bet);
			else next.add(bet);
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

	async function handleStateRequest(
		task: KanbanTask,
		target: KanbanColumnState,
	): Promise<TaskActionsResult> {
		const result = await onTaskStateRequest(task.id, target);
		if (result.ok) {
			showToast("success", `Requested → ${COLUMN_TO_LABEL[target]}. Posted to thread.`);
		} else {
			showToast("error", "Couldn't post request. Retry.");
		}
		return result;
	}

	function renderTaskCard(task: KanbanTask): JSX.Element {
		return (
			<TaskCard
				key={task.id}
				title={task.title}
				owner={task.owner}
				state={task.state}
				cost={task.cost}
				betTag={task.betTag}
				overflowMenu={
					<TaskActionsMenu
						task={task}
						onStateRequest={(target) => handleStateRequest(task, target)}
						onOpenThread={() => onOpenTaskThread(task.id)}
					/>
				}
			/>
		);
	}

	return (
		<>
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
							<div className="space-y-2 min-h-[48px] rounded p-1">
								{columnTasks.length === 0 ? (
									<EmptyState
										title={`No tasks in ${col.label.toLowerCase()}`}
										description="Tasks appear here once an agent moves them into this state."
									/>
								) : groupByBet ? (
									groupTasksByBet(columnTasks).map((group) => {
										const collapsed = collapsedBets.has(group.bet);
										const count = group.tasks.length;
										return (
											<div key={group.bet} data-bet-group>
												<button
													type="button"
													aria-label={`${group.bet} group (${count} ${count === 1 ? "task" : "tasks"})`}
													aria-expanded={!collapsed}
													className="flex items-center gap-2 text-xs font-heading uppercase tracking-wider text-[var(--text-lo)] hover:text-[var(--text-hi)] px-1 mb-1"
													onClick={() => toggleBet(group.bet)}
												>
													<span aria-hidden>{collapsed ? "▸" : "▾"}</span>
													<span>{group.bet}</span>
													<span className="badge badge-xs badge-neutral">{count}</span>
												</button>
												{!collapsed && group.tasks.map((task) => renderTaskCard(task))}
											</div>
										);
									})
								) : (
									columnTasks.map((task) => renderTaskCard(task))
								)}
							</div>
						</div>
					);
				})}
			</div>
			<div role="status" aria-live="polite" aria-atomic="true">
				{toast !== null ? (
					<div className="toast toast-bottom toast-end">
						<div
							className={`alert ${toast.kind === "success" ? "alert-success" : "alert-error"}`}
						>
							<span>{toast.text}</span>
						</div>
					</div>
				) : (
					<span className="sr-only">{liveText}</span>
				)}
			</div>
		</>
	);
}
