import { useState } from "react";
import type { KanbanColumnState, KanbanTask } from "./Kanban";
import { Kanban } from "./Kanban";

export default { title: "Kanban" };

const sampleTasks: KanbanTask[] = [
	{ id: "t1", title: "Setup CI Pipeline", owner: "Agent Alpha", state: "hold" },
	{ id: "t2", title: "Build REST API", owner: "Agent Beta", state: "in_progress", cost: "$4.20" },
	{ id: "t3", title: "Write E2E Tests", owner: "Agent Gamma", state: "in_progress", betTag: "MVP" },
	{ id: "t4", title: "Review PR #42", owner: "Agent Delta", state: "review" },
	{ id: "t5", title: "Deploy Staging", owner: "Agent Alpha", state: "done" },
	{ id: "t6", title: "Fix Login Bug", owner: "Agent Beta", state: "hold" },
];

export const Default = (): React.JSX.Element => (
	<Kanban tasks={sampleTasks} onMoveTask={() => {}} />
);

export const EmptyBoard = (): React.JSX.Element => <Kanban tasks={[]} onMoveTask={() => {}} />;

export const Interactive = (): React.JSX.Element => {
	const [tasks, setTasks] = useState<KanbanTask[]>(sampleTasks);
	return (
		<Kanban
			tasks={tasks}
			onMoveTask={(taskId, targetState: KanbanColumnState) => {
				setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state: targetState } : t)));
			}}
		/>
	);
};

export const SingleColumn = (): React.JSX.Element => {
	const tasks: KanbanTask[] = [
		{ id: "t1", title: "Task A", owner: "Agent A", state: "in_progress" },
		{ id: "t2", title: "Task B", owner: "Agent B", state: "in_progress" },
	];
	return <Kanban tasks={tasks} onMoveTask={() => {}} />;
};
