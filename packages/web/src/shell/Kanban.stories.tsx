/*
 * @lore L15 review (apply I / Design MF-4): the Kanban shell renders plain
 * `<a href>` anchors for the thread-link affordance — no react-router
 * `<Link>` is involved. Wrapping stories in `<MemoryRouter>` was leftover
 * from an earlier draft and crashed the storybook viewer when its own
 * router was present. Stories now render Kanban directly.
 */
import type { KanbanTask } from "./Kanban";
import { Kanban } from "./Kanban";

export default { title: "Kanban", tier: "3" as const, uses: ["TaskCard"] };

const sampleTasks: KanbanTask[] = [
	{
		id: "t1",
		title: "Setup CI Pipeline",
		owner: "Agent Alpha",
		ownerAgentId: "agent-alpha",
		state: "accepted",
	},
	{
		id: "t2",
		title: "Build REST API",
		owner: "Agent Beta",
		ownerAgentId: "agent-beta",
		state: "in_progress",
		cost: "$4.20",
		threadId: "thread-2",
		threadCount: 3,
		threadUnread: 2,
	},
	{
		id: "t3",
		title: "Write E2E Tests",
		owner: "Agent Gamma",
		ownerAgentId: "agent-gamma",
		state: "in_progress",
		betTag: "MVP",
		threadId: "thread-3",
		threadCount: 1,
	},
	{
		id: "t4",
		title: "Review PR #42",
		owner: "Agent Delta",
		ownerAgentId: "agent-delta",
		state: "review",
		threadId: "thread-4",
		threadCount: 5,
		threadUnread: 1,
	},
	{
		id: "t5",
		title: "Deploy Staging",
		owner: "Agent Alpha",
		ownerAgentId: "agent-alpha",
		state: "done",
	},
	{
		id: "t6",
		title: "Fix Login Bug",
		owner: "Agent Beta",
		ownerAgentId: "agent-beta",
		state: "accepted",
	},
];

export const Default = (): React.JSX.Element => <Kanban tasks={sampleTasks} />;

export const EmptyBoard = (): React.JSX.Element => <Kanban tasks={[]} />;

export const SingleColumn = (): React.JSX.Element => {
	const tasks: KanbanTask[] = [
		{
			id: "t1",
			title: "Task A",
			owner: "Agent A",
			ownerAgentId: "agent-a",
			state: "in_progress",
		},
		{
			id: "t2",
			title: "Task B",
			owner: "Agent B",
			ownerAgentId: "agent-b",
			state: "in_progress",
		},
	];
	return <Kanban tasks={tasks} />;
};

export const Grouped = (): React.JSX.Element => <Kanban tasks={sampleTasks} groupByBet />;

// L15 review (apply J / Design MF-5): exercise the populated thread-chip and
// the unread-pill so reviewers can eyeball the visual states.
export const WithThreadCounts = (): React.JSX.Element => (
	<Kanban
		tasks={[
			{
				id: "th1",
				title: "Has thread, no unread",
				owner: "Agent Alpha",
				ownerAgentId: "agent-alpha",
				state: "in_progress",
				threadId: "thread-th1",
				threadCount: 2,
			},
			{
				id: "th2",
				title: "Has thread + unread",
				owner: "Agent Beta",
				ownerAgentId: "agent-beta",
				state: "in_progress",
				threadId: "thread-th2",
				threadCount: 7,
				threadUnread: 3,
			},
			{
				id: "th3",
				title: "Terminal, no thread (no footer)",
				owner: "Agent Gamma",
				ownerAgentId: "agent-gamma",
				state: "done",
			},
			{
				id: "th4",
				title: "Terminal WITH thread",
				owner: "Agent Delta",
				ownerAgentId: "agent-delta",
				state: "done",
				threadId: "thread-th4",
				threadCount: 4,
			},
		]}
	/>
);
