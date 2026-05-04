import type { JSX } from "react";
import { MemoryRouter } from "react-router-dom";
import type { TaskThreadClient } from "../services/task-thread-client";
import { TaskActionsMenu } from "./TaskActionsMenu";

export default { title: "TaskActionsMenu" };

const mockClient: TaskThreadClient = {
	findOrCreateTaskThread: async () => ({ threadId: "th-mock" }),
	postPlainMessage: async () => undefined,
};

const failingClient: TaskThreadClient = {
	findOrCreateTaskThread: async () => ({ threadId: "th-mock" }),
	postPlainMessage: async () => {
		throw new Error("Network unavailable");
	},
};

export function Default(): JSX.Element {
	return (
		<MemoryRouter>
			<div className="p-4 bg-[var(--surface-1)] inline-block">
				<TaskActionsMenu
					task={{ id: "t-1", title: "Implement login endpoint", state: "in_progress" }}
					client={mockClient}
				/>
			</div>
		</MemoryRouter>
	);
}

export function StateAccepted(): JSX.Element {
	return (
		<MemoryRouter>
			<div className="p-4 bg-[var(--surface-1)] inline-block">
				<TaskActionsMenu
					task={{ id: "t-2", title: "Design signup form", state: "accepted" }}
					client={mockClient}
				/>
			</div>
		</MemoryRouter>
	);
}

export function ErrorOnRequest(): JSX.Element {
	return (
		<MemoryRouter>
			<div className="p-4 bg-[var(--surface-1)] inline-block">
				<TaskActionsMenu
					task={{ id: "t-3", title: "JWT refresh logic", state: "in_progress" }}
					client={failingClient}
				/>
			</div>
		</MemoryRouter>
	);
}
