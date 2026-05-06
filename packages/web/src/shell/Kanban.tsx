// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted states
// map to the "Planned" column. Tasks with hold, review, or killed states are excluded.
import { dsShellProps, EmptyState, TaskCard } from "@hyperidle/design-system";
import type { SessionOutcome, TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";

export interface KanbanTask {
	id: string;
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
	// L19: latest session metadata (all optional — callers that don't have session data don't break)
	latestSessionOutcome?: SessionOutcome | null;
	latestSessionCost?: number | null;
	latestSessionTokensInput?: number | null;
	latestSessionTokensOutput?: number | null;
	latestSessionHarnessUrl?: string | null;
}

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done";

export interface KanbanProps {
	tasks: KanbanTask[];
	/**
	 * L15: Raised when the user activates a task card (click / Enter / Space).
	 * Optional so existing call sites that don't wire the Sheet yet don't break.
	 */
	onSelectTask?: (taskId: string) => void;
	/**
	 * J5: when true, tasks within each column are grouped under a
	 * collapsible bet header (bet name + task count).
	 * Tasks without a `betTag` group under an "Unassigned" header.
	 */
	groupByBet?: boolean;
}

/**
 * Maps every TaskState to a Kanban column, or `null` for states the board
 * deliberately hides (hold, killed). Exhaustive `Record<TaskState, …>` so the
 * type checker flags any new TaskState — a partial map would silently drop
 * tasks on union growth.
 *
 * @lore I4 cross-cutting: the point of the exhaustiveness story is that any
 * new TaskState forces a decision here. Do not loosen to `Partial<…>`.
 *
 * @lore L15: `COLUMN_TO_STATE` (inverse) is deleted — drag is gone and the
 * column-key → TaskState translation had zero non-drag callers. `STATE_TO_COLUMN`
 * stays because the board still needs to place tasks into columns for display.
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

export function Kanban({ tasks, onSelectTask, groupByBet = false }: KanbanProps): JSX.Element {
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
		// I4 R3: responsive grid — single column on phones, 2 on small, 4 on large viewports.
		// @lore K11: column gap → --density-gap per density-audit.md § 3.3.K7.
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
						<div className="flex flex-col gap-2 min-h-[48px] rounded p-1">
							{columnTasks.length === 0 ? (
								<EmptyState
									title={`No tasks in ${col.label.toLowerCase()}`}
									description="No tasks yet."
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
												group.tasks.map((task) => (
													<button
														key={task.id}
														type="button"
														data-testid="task-card"
														className="text-left w-full"
														onClick={() => onSelectTask?.(task.id)}
													>
														<TaskCard
															title={task.title}
															owner={task.owner}
															state={task.state}
															cost={task.cost}
															betTag={task.betTag}
														/>
													</button>
												))}
										</div>
									);
								})
							) : (
								columnTasks.map((task) => (
									<button
										key={task.id}
										type="button"
										data-testid="task-card"
										className="text-left w-full"
										onClick={() => onSelectTask?.(task.id)}
									>
										<TaskCard
											title={task.title}
											owner={task.owner}
											state={task.state}
											cost={task.cost}
											betTag={task.betTag}
										/>
									</button>
								))
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
