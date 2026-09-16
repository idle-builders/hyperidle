import type {
	HyperIdleDb,
	Item,
	Message,
	NewItem,
	NewThread,
	Task,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type { ActionResult, EditTaskInput, TaskView } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * `edit_task`'s own bound `run`. Injected because `policy` is a SIBLING
 * Service to `task` and cannot import it directly (Mechanism C) — same
 * shape `app.ts` threads into `service-bootstrap.ts`'s
 * `registerWorkSessionStartedReactions`. Lifecycle propagation writes
 * through this instead of the deleted `transitionTaskState`
 * (the architecture doc §6 rows 4/5).
 */
export type PolicyEditTask = (
	ctx: {
		readonly actor: string;
		readonly db: HyperIdleDb;
		readonly eventBus: EventBus;
		readonly now: string;
	},
	input: EditTaskInput,
) => Promise<ActionResult<TaskView>>;

/** One composition contract for policy's reactive and query capabilities. */
export interface PolicyDeps {
	readonly work: {
		getItemById(db: WriteExecutor, id: string): Promise<Item | undefined>;
		updateItemById(db: WriteExecutor, id: string, patch: Partial<NewItem>): Promise<void>;
		listItemIdsBySourceAgent(db: WriteExecutor, sourceAgentId: string): Promise<string[]>;
		getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
		/**
		 * BB1: list all direct children of the given parent task. Used by the
		 * recursive completion rollup to check whether all siblings are terminal
		 * before propagating upward.
		 */
		listChildTasks(db: WriteExecutor, parentTaskId: string): Promise<Task[]>;
		/**
		 * BB1: return ancestor IDs nearest-first, excluding the task itself.
		 * Used by `propagateTaskToParent` to walk the full ancestor chain in
		 * one call (rather than relying solely on the event-chain re-trigger).
		 */
		listAncestorIds(db: WriteExecutor, taskId: string): Promise<string[]>;
	};
	readonly conversation: {
		insertMessage(
			db: WriteExecutor,
			values: {
				readonly id: string;
				readonly senderId: string;
				readonly threadId: string;
				readonly type: string;
				readonly payload: string;
				readonly clientKey: string;
				readonly legacyItemId?: string;
				readonly createdAt: string;
				readonly resolvedAt?: string;
			},
		): Promise<void>;
		resolveMessageIfUnresolved(
			db: WriteExecutor,
			id: string,
			resolvedAt: string,
		): Promise<{ id: string }[]>;
		listMessagesByThread(
			db: WriteExecutor,
			threadId: string,
			opts?: {
				readonly type?: string;
				readonly order?: "createdAt";
				readonly dir?: "asc" | "desc";
				readonly limit?: number;
			},
		): Promise<Message[]>;
		insertThread(db: WriteExecutor, values: NewThread): Promise<void>;
		updateThread(db: WriteExecutor, id: string, patch: Partial<NewThread>): Promise<void>;
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
		listVerdictMessagesByItemIds(
			db: WriteExecutor,
			itemIds: string[],
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
	readonly users: {
		getFirstUserByKind(db: WriteExecutor, kind: string): Promise<User | undefined>;
	};
	/** See {@link PolicyEditTask}. */
	readonly editTask: PolicyEditTask;
}
