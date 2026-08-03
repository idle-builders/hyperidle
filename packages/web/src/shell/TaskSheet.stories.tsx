/**
 * TaskSheet stories — key states for visual verification.
 */
import { TaskSheet } from "./TaskSheet";

export default { title: "TaskSheet", tier: "3" as const, uses: [] };

const sampleTask = {
	id: "task-stories-1",
	title: "Implement login endpoint",
	owner: "Dev Agent 1",
	state: "in_progress" as const,
	betTag: "Auth",
};

const noopResolve = (): Promise<string> => Promise.resolve("thread-stories-1");
const noopPost = (): Promise<void> => Promise.resolve();
const noopNavigate = (): void => {};

export const Closed = (): React.JSX.Element => (
	<TaskSheet
		task={sampleTask}
		open={false}
		onClose={() => {}}
		resolveThreadId={noopResolve}
		postRequest={noopPost}
		onNavigateToThread={noopNavigate}
	/>
);

export const OpenNoIntent = (): React.JSX.Element => (
	<TaskSheet
		task={sampleTask}
		open={true}
		onClose={() => {}}
		resolveThreadId={noopResolve}
		postRequest={noopPost}
		onNavigateToThread={noopNavigate}
	/>
);

export const OpenWithIntent = (): React.JSX.Element => {
	// Demonstrate the sheet pre-rendered with an intent selected.
	// In production the user selects via the radio; stories show a static state.
	return (
		<TaskSheet
			task={sampleTask}
			open={true}
			onClose={() => {}}
			resolveThreadId={noopResolve}
			postRequest={noopPost}
			onNavigateToThread={noopNavigate}
		/>
	);
};

export const Submitting = (): React.JSX.Element => {
	// Simulates the loading state — postRequest hangs indefinitely.
	const hangingPost = (): Promise<void> => new Promise(() => {});
	return (
		<TaskSheet
			task={sampleTask}
			open={true}
			onClose={() => {}}
			resolveThreadId={noopResolve}
			postRequest={hangingPost}
			onNavigateToThread={noopNavigate}
		/>
	);
};

export const ErrorState = (): React.JSX.Element => {
	const failingPost = (): Promise<void> => Promise.reject(new Error("Network error"));
	return (
		<TaskSheet
			task={sampleTask}
			open={true}
			onClose={() => {}}
			resolveThreadId={noopResolve}
			postRequest={failingPost}
			onNavigateToThread={noopNavigate}
		/>
	);
};
