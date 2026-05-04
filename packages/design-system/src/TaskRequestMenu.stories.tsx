/**
 * L15 — TaskRequestMenu stories.
 *
 * Each named export renders one variant covered by the test suite so the
 * design-system gallery shows all states at /designsystem.
 */

import type { JSX } from "react";
import { TaskRequestMenu } from "./TaskRequestMenu";

const noopSubmit = async (): Promise<void> => {};
const noopOpen = (): void => {};

export default { title: "TaskRequestMenu" };

export function InProgress(): JSX.Element {
	return (
		<TaskRequestMenu
			taskId="task-1"
			currentState="in_progress"
			onSubmitRequest={noopSubmit}
			onOpenThread={noopOpen}
		/>
	);
}

export function Accepted(): JSX.Element {
	return (
		<TaskRequestMenu
			taskId="task-2"
			currentState="accepted"
			onSubmitRequest={noopSubmit}
			onOpenThread={noopOpen}
		/>
	);
}

export function Blocked(): JSX.Element {
	return (
		<TaskRequestMenu
			taskId="task-3"
			currentState="blocked"
			onSubmitRequest={noopSubmit}
			onOpenThread={noopOpen}
		/>
	);
}

export function Killed(): JSX.Element {
	return (
		<TaskRequestMenu
			taskId="task-4"
			currentState="killed"
			onSubmitRequest={noopSubmit}
			onOpenThread={noopOpen}
		/>
	);
}
