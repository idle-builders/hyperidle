import type { HyperIdleDb, Task, WriteExecutor } from "@hyperidle/db";
import type {
	ActionResult,
	EditTaskInput,
	SendMessageInput,
	SendMessageOutput,
	TaskView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

// edit_task's bound run — policy is a sibling Service and cannot import task directly.
export type PolicyEditTask = (
	ctx: {
		readonly actor: string;
		readonly db: HyperIdleDb;
		readonly eventBus: EventBus;
		readonly now: string;
	},
	input: EditTaskInput,
) => Promise<ActionResult<TaskView>>;

// send_message's bound run — policy may not import thread directly.
// @lore: posts through action (not insertMessage) — gets changes row, WS nudge, lastActiveAt bump
export type PolicySendMessage = (
	ctx: {
		readonly actor: string;
		readonly db: HyperIdleDb;
		readonly eventBus: EventBus;
		readonly now: string;
	},
	input: SendMessageInput,
) => Promise<ActionResult<SendMessageOutput>>;

// Composition contract for policy's reactive and query capabilities.
export interface PolicyDeps {
	readonly work: {
		getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
		listChildTasks(db: WriteExecutor, parentTaskId: string): Promise<Task[]>;
		listAncestorIds(db: WriteExecutor, taskId: string): Promise<string[]>;
	};
	readonly conversation: {
		listInitiatedVerdictMessages(
			db: WriteExecutor,
			initiatorId: string,
			windowStart: string,
		): Promise<
			Array<{
				readonly id: string;
				readonly payload: string;
				readonly threadId: string;
				readonly createdAt: string;
			}>
		>;
	};
	/** See {@link PolicyEditTask}. */
	readonly editTask: PolicyEditTask;
	/** See {@link PolicySendMessage}. */
	readonly sendMessage: PolicySendMessage;
}
