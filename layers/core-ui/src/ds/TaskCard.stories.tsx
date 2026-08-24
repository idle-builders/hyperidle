import { TaskCard } from "./TaskCard";

export default {
	title: "TaskCard",
	tier: "2" as const,
	uses: ["StatusChip", "Tag"],
	order: ["InProgress", "Blocked", "Done", "AllStates"],
};

export const InProgress = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Implement login flow"
			owner="Bob Smith"
			state="in_progress"
			betTag="Mobile V2"
		/>
	</div>
);

export const Blocked = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard title="Fix CI pipeline" owner="Alice Chen" state="blocked" />
	</div>
);

export const Done = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard title="Write unit tests" owner="Carol Davis" state="done" betTag="Sprint 1" />
	</div>
);

export const AllStates = (): React.JSX.Element => (
	<div className="flex flex-col gap-2 max-w-[320px]">
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
