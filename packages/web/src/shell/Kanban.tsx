// @lore Kanban uses four columns matching UI_DESIGN.md Section 4 (line 100):
// "Planned / Blocked / In Progress / Done". Tasks with proposed or accepted states
// map to the "Planned" column. Tasks with hold, review, or killed states are excluded.
import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { TaskCard } from "@hyperidle/design-system";
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
	onMoveTask: (taskId: string, targetState: KanbanColumnState) => void;
	/**
	 * J5: when true, tasks within each column are grouped under a
	 * collapsible bet header (bet name + task count). Drag-drop behaviour
	 * is unchanged because the draggable wrappers stay rendered inside the
	 * same `KanbanDropZone` for the column. Tasks without a `betTag` group
	 * under an "Unassigned" header.
	 */
	groupByBet?: boolean;
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

/**
 * Inverse of `STATE_TO_COLUMN`: when a card is dragged into a column, this
 * is the canonical TaskState the API should receive. Co-located with the
 * forward map so the lossy round-trip (proposed/accepted both collapse to
 * `planned`; dragging into `planned` promotes to `accepted`) is visible in
 * one file.
 *
 * @lore I4 K1/K2: `"planned"` is NOT a valid TaskState — dragging into the
 * Planned column promotes `proposed` pitches to `accepted` tasks.
 */
export const COLUMN_TO_STATE: Record<KanbanColumnState, TaskState> = {
	planned: "accepted",
	in_progress: "in_progress",
	blocked: "blocked",
	done: "done",
};

/**
 * Pure helper that resolves a @dnd-kit `DragEndEvent` to a Kanban move.
 * Returns the `(taskId, column)` tuple to forward to `onMoveTask`, or
 * `null` when the drop did not land on a known column.
 *
 * @lore I4 DoD B2: extracted from `handleDragEnd` so the move-resolution
 * logic can be exhaustively unit-tested with a synthesized `DragEndEvent`
 * (jsdom can't fully drive @dnd-kit's KeyboardSensor through collision
 * detection because it returns 0×0 rects for every element). The
 * integration test mocks `getBoundingClientRect` and drives the live
 * sensor; this helper is the shared logic both paths exercise.
 */
export function resolveKanbanDrop(
	event: DragEndEvent,
): { taskId: string; column: KanbanColumnState } | null {
	const { active, over } = event;
	if (!over) return null;
	const overId = String(over.id);
	const validColumns: KanbanColumnState[] = ["planned", "blocked", "in_progress", "done"];
	if (!validColumns.includes(overId as KanbanColumnState)) return null;
	return { taskId: String(active.id), column: overId as KanbanColumnState };
}

const COLUMNS: { key: KanbanColumnState; label: string }[] = [
	{ key: "planned", label: "Planned" },
	{ key: "blocked", label: "Blocked" },
	{ key: "in_progress", label: "In Progress" },
	{ key: "done", label: "Done" },
];

function KanbanDropZone({
	columnKey,
	children,
}: {
	columnKey: string;
	children: React.ReactNode;
}): JSX.Element {
	const { setNodeRef, isOver } = useDroppable({ id: columnKey });
	// @lore I4 DoD B2: `data-droppable-column` mirrors Canvas's `data-droppable`
	// pattern so Playwright/E2E tests can locate a column subtree without
	// relying on text-filter ancestors (the spec for keyboard-drag E2E
	// requires asserting the card lives in the target column's DOM after the
	// move). Production code never reads this attribute.
	return (
		<div
			ref={setNodeRef}
			data-droppable-column={columnKey}
			className={`flex flex-col gap-2 min-h-[48px] rounded p-1 transition-colors ${
				isOver ? "bg-accent/10" : ""
			}`}
		>
			{children}
		</div>
	);
}

function DraggableTaskCard({ task }: { task: KanbanTask }): JSX.Element {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
	return (
		<div
			ref={setNodeRef}
			{...listeners}
			{...attributes}
			data-testid={`draggable-task-${task.id}`}
			style={{ opacity: isDragging ? 0.4 : 1 }}
		>
			<TaskCard
				title={task.title}
				owner={task.owner}
				state={task.state}
				cost={task.cost}
				betTag={task.betTag}
			/>
		</div>
	);
}

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

export function Kanban({ tasks, onMoveTask, groupByBet = false }: KanbanProps): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(null);
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

	// I4 KB1: KeyboardSensor lets users drive the kanban via keyboard.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor),
	);

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

	const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined;

	function handleDragStart(event: DragStartEvent): void {
		setActiveId(String(event.active.id));
	}

	function handleDragEnd(event: DragEndEvent): void {
		setActiveId(null);
		const move = resolveKanbanDrop(event);
		if (move) {
			onMoveTask(move.taskId, move.column);
		}
	}

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			{/* I4 R3: responsive grid — single column on phones, 2 on small,
				4 on large viewports. */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
							<KanbanDropZone columnKey={col.key}>
								{columnTasks.length === 0 ? (
									<div className="text-xs text-[var(--text-lo)] p-2">
										No tasks in {col.label.toLowerCase()}
									</div>
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
														<DraggableTaskCard key={task.id} task={task} />
													))}
											</div>
										);
									})
								) : (
									columnTasks.map((task) => <DraggableTaskCard key={task.id} task={task} />)
								)}
							</KanbanDropZone>
						</div>
					);
				})}
			</div>
			<DragOverlay>
				{activeTask ? (
					<TaskCard
						title={activeTask.title}
						owner={activeTask.owner}
						state={activeTask.state}
						cost={activeTask.cost}
						betTag={activeTask.betTag}
					/>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
