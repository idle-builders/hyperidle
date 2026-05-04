import { useEffect, useRef } from "react";
import { TaskCard } from "./TaskCard";

export default {
	title: "TaskCard",
	tier: "2" as const,
	uses: ["StatusChip", "Tag", "KeyValue"],
	order: [
		"InProgress",
		"Blocked",
		"Done",
		"WithUnreadDot",
		"WithReadDot",
		"NoThread",
		"KebabOpen",
		"RequestInFlight",
		"BlockedState",
		"DoneState",
		"AllStates",
	],
};

export const InProgress = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Implement login flow"
			owner="Bob Smith"
			state="in_progress"
			cost="$1.50"
			betTag="Mobile V2"
		/>
	</div>
);

export const Blocked = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard title="Fix CI pipeline" owner="Alice Chen" state="blocked" cost="$0.80" />
	</div>
);

export const Done = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Write unit tests"
			owner="Carol Davis"
			state="done"
			cost="$2.00"
			betTag="Sprint 1"
		/>
	</div>
);

export const WithUnreadDot = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Login endpoint review"
			owner="Bob Smith"
			state="in_progress"
			threadUnreadCount={3}
			onOpenThread={() => {}}
			onRequestStateChange={() => {}}
		/>
	</div>
);

export const WithReadDot = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Login endpoint review"
			owner="Bob Smith"
			state="in_progress"
			threadUnreadCount={0}
			onOpenThread={() => {}}
			onRequestStateChange={() => {}}
		/>
	</div>
);

export const NoThread = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Fresh task"
			owner="Bob Smith"
			state="accepted"
			onOpenThread={() => {}}
			onRequestStateChange={() => {}}
		/>
	</div>
);

/**
 * KebabOpen — programmatically opens the kebab menu so the dropdown shape
 * (Open thread / Request state change section / Kill danger row, with
 * dividers between sections per approved.md §4.1) is captured in the
 * catalog.
 */
export const KebabOpen = (): React.JSX.Element => {
	const ref = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const button = ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
		button?.click();
	}, []);
	return (
		<div className="max-w-[320px]" ref={ref}>
			<TaskCard
				title="Design signup form"
				owner="Dev Agent 2"
				state="accepted"
				cost="$1.80"
				betTag="Auth"
				threadUnreadCount={2}
				onOpenThread={() => {}}
				onRequestStateChange={() => {}}
			/>
		</div>
	);
};

/**
 * RequestInFlight — Pause is the pending verb; the menu stays open with a
 * `loading-xs` spinner inline; the kebab is disabled. Approved.md §5 row
 * "Request in flight".
 */
export const RequestInFlight = (): React.JSX.Element => {
	const ref = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const button = ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
		button?.click();
	}, []);
	return (
		<div className="max-w-[320px]" ref={ref}>
			<TaskCard
				title="Implement login flow"
				owner="Bob Smith"
				state="in_progress"
				cost="$3.50"
				betTag="Auth"
				threadUnreadCount={0}
				onOpenThread={() => {}}
				onRequestStateChange={() => {}}
				pendingVerb="pause"
			/>
		</div>
	);
};

export const BlockedState = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Blocked task with kebab"
			owner="Alice"
			state="blocked"
			onOpenThread={() => {}}
			onRequestStateChange={() => {}}
		/>
	</div>
);

export const DoneState = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<TaskCard
			title="Completed task"
			owner="Carol"
			state="done"
			onOpenThread={() => {}}
			onRequestStateChange={() => {}}
		/>
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
