// @lore Kanban uses four columns matching the TaskState subset: hold, in_progress, review, done.
// Other TaskState values (proposed, accepted, blocked, killed) are not shown in this board.
// If tasks with those states are passed, they are silently excluded.
import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { TaskState } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { TaskCard } from "../components/TaskCard";

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
}

export type KanbanColumnState = "hold" | "in_progress" | "review" | "done";

const COLUMNS: { key: KanbanColumnState; label: string }[] = [
	{ key: "hold", label: "Hold" },
	{ key: "in_progress", label: "In Progress" },
	{ key: "review", label: "Review" },
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
	return (
		<div
			ref={setNodeRef}
			className={`flex flex-col gap-2 min-h-[48px] rounded p-1 transition-colors ${
				isOver ? "bg-accent/10" : ""
			}`}
		>
			{children}
		</div>
	);
}

export function Kanban({ tasks, onMoveTask }: KanbanProps): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(null);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	const tasksByColumn = useMemo(() => {
		const grouped: Record<KanbanColumnState, KanbanTask[]> = {
			hold: [],
			in_progress: [],
			review: [],
			done: [],
		};
		for (const task of tasks) {
			const col = task.state as KanbanColumnState;
			if (grouped[col]) {
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
		const { active, over } = event;
		if (!over) return;

		const overId = String(over.id);
		const validColumns: KanbanColumnState[] = ["hold", "in_progress", "review", "done"];
		if (validColumns.includes(overId as KanbanColumnState)) {
			onMoveTask(String(active.id), overId as KanbanColumnState);
		}
	}

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			<div className="grid grid-cols-4 gap-4">
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
									<div className="text-xs text-base-content/40 p-2">
										No tasks in {col.label.toLowerCase()}
									</div>
								) : (
									columnTasks.map((task) => (
										<div key={task.id} data-draggable={task.id}>
											<TaskCard
												title={task.title}
												owner={task.owner}
												state={task.state}
												cost={task.cost}
												betTag={task.betTag}
											/>
										</div>
									))
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
