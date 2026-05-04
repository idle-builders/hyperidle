import type { JSX } from "react";
import { TaskActionsMenu } from "./TaskActionsMenu";

const noop = (): void => {};

export default { title: "TaskActionsMenu" };

export const InProgress = (): JSX.Element => (
	<TaskActionsMenu
		task={{ id: "t1", title: "Implement login", state: "in_progress" }}
		onRequestStateChange={noop}
	/>
);

export const Blocked = (): JSX.Element => (
	<TaskActionsMenu
		task={{ id: "t2", title: "Fix CI", state: "blocked" }}
		onRequestStateChange={noop}
	/>
);

export const Review = (): JSX.Element => (
	<TaskActionsMenu
		task={{ id: "t3", title: "Review PR", state: "review" }}
		onRequestStateChange={noop}
	/>
);

export const Accepted = (): JSX.Element => (
	<TaskActionsMenu
		task={{ id: "t4", title: "Plan sprint", state: "accepted" }}
		onRequestStateChange={noop}
	/>
);

export const Pending = (): JSX.Element => (
	<TaskActionsMenu
		task={{ id: "t5", title: "Pending request", state: "in_progress", hasPendingRequest: true }}
		onRequestStateChange={noop}
		onCancelPendingRequest={noop}
	/>
);

export const Proposed = (): JSX.Element => (
	<TaskActionsMenu
		task={{ id: "t6", title: "Proposed task", state: "proposed" }}
		onRequestStateChange={noop}
	/>
);
