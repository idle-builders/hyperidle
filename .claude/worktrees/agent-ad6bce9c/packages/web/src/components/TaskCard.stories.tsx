import { TaskCard } from "./TaskCard";

export default { title: "TaskCard" };

export const InProgress = (): React.JSX.Element => (
	<TaskCard
		title="Implement login flow"
		owner="Bob Smith"
		state="in_progress"
		cost="$1.50"
		betTag="Mobile V2"
	/>
);

export const Blocked = (): React.JSX.Element => (
	<TaskCard title="Fix CI pipeline" owner="Alice Chen" state="blocked" cost="$0.80" />
);

export const Done = (): React.JSX.Element => (
	<TaskCard
		title="Write unit tests"
		owner="Carol Davis"
		state="done"
		cost="$2.00"
		betTag="Sprint 1"
	/>
);

export const AllStates = (): React.JSX.Element => (
	<div className="flex flex-col gap-2">
		<TaskCard title="Proposed task" owner="Agent" state="proposed" />
		<TaskCard title="Accepted task" owner="Agent" state="accepted" />
		<TaskCard title="On hold" owner="Agent" state="hold" />
		<TaskCard title="In progress" owner="Agent" state="in_progress" />
		<TaskCard title="Blocked task" owner="Agent" state="blocked" />
		<TaskCard title="In review" owner="Agent" state="review" />
		<TaskCard title="Completed" owner="Agent" state="done" />
		<TaskCard title="Killed" owner="Agent" state="killed" />
	</div>
);
