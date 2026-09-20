import type { HyperIdleDb, Task, WriteExecutor } from "@hyperidle/db";
import type {
	ActionResult,
	EditTaskInput,
	SendMessageInput,
	SendMessageOutput,
	TaskView,
} from "@hyperidle/domain-model";
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

/**
 * `send_message`'s own bound `run`, injected for the same reason as
 * {@link PolicyEditTask} — `policy` may not import `@hyperidle/thread`
 * directly (Mechanism C). Lifecycle propagation posts the ship-confirmation
 * review through this instead of a raw `conversation.insertMessage`: going
 * through the action is what gets the `changes` row, the websocket nudge and
 * the `lastActiveAt` bump every other poster gets (the module-link rule:
 * through the action, never the table).
 */
export type PolicySendMessage = (
	ctx: {
		readonly actor: string;
		readonly db: HyperIdleDb;
		readonly eventBus: EventBus;
		readonly now: string;
	},
	input: SendMessageInput,
) => Promise<ActionResult<SendMessageOutput>>;

/**
 * One composition contract for policy's reactive and query capabilities.
 *
 * @lore BC3 architecture.md §5 B7/R3: `work.getItemById`/`updateItemById`/
 * `listItemIdsBySourceAgent` and `conversation.listVerdictMessagesByItemIds`
 * DELETED with the `items` table — their only reader, `policy-engine.ts`,
 * is deleted with them (R2). What remains here is `lifecycle-propagation.ts`'s
 * own deps; `computeApprovalRate`'s deps (Path 2 only, R4) live in
 * `approval-rate.ts`'s own narrower `ApprovalRateDeps`.
 *
 * @lore code-review finding, BC3: `conversation.insertMessage` DELETED —
 * `lifecycle-propagation.ts`'s ship-confirmation review posted through it
 * as a raw `messages` row, with no `changes` row, no websocket nudge and no
 * `lastActiveAt` bump. It now posts through {@link PolicySendMessage} instead,
 * same as every other neighbour that posts a message (module-link rule).
 */
export interface PolicyDeps {
	readonly work: {
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
		/** `computeApprovalRate`'s Path 2 (R4) — Path 1 (legacyItemId) is gone with `items`. */
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
