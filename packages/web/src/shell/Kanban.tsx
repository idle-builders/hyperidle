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

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done";

/** Maps TaskState values to their Kanban column. States not listed (hold, killed) are excluded. */
const STATE_TO_COLUMN: Partial<Record<TaskState, KanbanColumnState>> = {
	proposed: "planned",
	accepted: "planned",
	blocked: "blocked",
	in_progress: "in_progress",
	review: "in_progress",
	done: "done",
};

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

function DraggableTaskCard({ task }: { task: KanbanTask }): JSX.Element {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
	return (
		<div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.4 : 1 }}>
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

export function Kanban({ tasks, onMoveTask }: KanbanProps): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(null);

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
			if (col) {
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
		const validColumns: KanbanColumnState[] = ["planned", "blocked", "in_progress", "done"];
		if (validColumns.includes(overId as KanbanColumnState)) {
			onMoveTask(String(active.id), overId as KanbanColumnState);
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
									<div className="text-xs text-base-content/40 p-2">
										No tasks in {col.label.toLowerCase()}
									</div>
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
