import type { KanbanTask } from "./Kanban";
import { Kanban } from "./Kanban";

export default { title: "Kanban", tier: "3" as const, uses: ["TaskCard"] };

const sampleTasks: KanbanTask[] = [
	{ id: "t1", title: "Setup CI Pipeline", owner: "Agent Alpha", state: "accepted" },
	{ id: "t2", title: "Build REST API", owner: "Agent Beta", state: "in_progress", cost: "$4.20" },
	{ id: "t3", title: "Write E2E Tests", owner: "Agent Gamma", state: "in_progress", betTag: "MVP" },
	{ id: "t4", title: "Review PR #42", owner: "Agent Delta", state: "review" },
	{ id: "t5", title: "Deploy Staging", owner: "Agent Alpha", state: "done" },
	{ id: "t6", title: "Fix Login Bug", owner: "Agent Beta", state: "accepted" },
];

const okStateRequest = async (): Promise<{ ok: true }> => ({ ok: true });
const noopOpenThread = (): void => {};

export const Default = (): React.JSX.Element => (
	<Kanban
		tasks={sampleTasks}
		onTaskStateRequest={okStateRequest}
		onOpenTaskThread={noopOpenThread}
	/>
);

export const EmptyBoard = (): React.JSX.Element => (
	<Kanban tasks={[]} onTaskStateRequest={okStateRequest} onOpenTaskThread={noopOpenThread} />
);

export const Grouped = (): React.JSX.Element => (
	<Kanban
		tasks={sampleTasks}
		onTaskStateRequest={okStateRequest}
		onOpenTaskThread={noopOpenThread}
		groupByBet
	/>
);

export const SingleColumn = (): React.JSX.Element => {
	const tasks: KanbanTask[] = [
		{ id: "t1", title: "Task A", owner: "Agent A", state: "in_progress" },
		{ id: "t2", title: "Task B", owner: "Agent B", state: "in_progress" },
	];
	return (
		<Kanban tasks={tasks} onTaskStateRequest={okStateRequest} onOpenTaskThread={noopOpenThread} />
	);
};
