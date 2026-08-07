import type {
	Bet,
	Item,
	Message,
	NewBet,
	NewItem,
	NewNotificationQueueRow,
	NewTask,
	NewThread,
	Task,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type { BakedWorkIntentRequest } from "@hyperidle/shared";

export interface PolicySessionContext {
	readonly sessionId: string;
	readonly agentId: string;
	readonly taskId: string | null;
}

/** One composition contract for policy's reactive, query, and handoff capabilities. */
export interface PolicyDeps {
	readonly work: {
		getItemById(db: WriteExecutor, id: string): Promise<Item | undefined>;
		updateItemById(db: WriteExecutor, id: string, patch: Partial<NewItem>): Promise<void>;
		listItemIdsBySourceAgent(db: WriteExecutor, sourceAgentId: string): Promise<string[]>;
		getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
		updateTaskById?(db: WriteExecutor, id: string, patch: Partial<NewTask>): Promise<void>;
		claimTaskHandoff?(
			db: WriteExecutor,
			args: { taskId: string; expectedUpdatedAt: string; claimedAt: string },
		): Promise<{ applied: boolean }>;
		createItem?(db: WriteExecutor, values: NewItem): Promise<void>;
		getBetById(db: WriteExecutor, id: string): Promise<Bet | undefined>;
		transitionBetStatus(
			db: WriteExecutor,
			args: { betId: string; fromStatus: string; patch: Partial<NewBet> },
		): Promise<{ applied: boolean }>;
		transitionTaskState(
			db: WriteExecutor,
			args: { taskId: string; fromState: string; patch: Partial<NewTask> },
		): Promise<{ applied: boolean }>;
		listTasks(db: WriteExecutor, opts?: { betId?: string }): Promise<Task[]>;
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
		updateMessage(db: WriteExecutor, id: string, patch: Partial<Message>): Promise<void>;
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
		getUserById?(db: WriteExecutor, id: string): Promise<User | undefined>;
		getFirstUserByKind(db: WriteExecutor, kind: string): Promise<User | undefined>;
		findActiveTeammateByRole?(
			db: WriteExecutor,
			role: string,
			teamMembersIds: string[],
			excludeId: string,
		): Promise<User | undefined>;
	};
	readonly org?: {
		getByTeamId(db: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
	};
	readonly silence: {
		isSilenced(
			db: WriteExecutor,
			item: { readonly sourceAgentId: string | null },
			now: Date,
		): Promise<boolean>;
	};
	readonly notifications: {
		insert(db: WriteExecutor, row: NewNotificationQueueRow): Promise<void>;
	};
	readonly sessionRequests?: {
		record(
			tx: WriteExecutor,
			input: {
				readonly kind: "task_run";
				readonly sourceKind: string;
				readonly sourceId: string;
				readonly requestedBy?: string;
				readonly idempotencyKey: string;
				/** See `BakedWorkIntentRequest`. Populated at emit time by `taskRunResolver` (AU21 Increment 3). */
				readonly bakedRequest?: BakedWorkIntentRequest;
			},
		): Promise<{ readonly id: string; readonly idempotencyKey: string }>;
		abort(sessionId: string): Promise<boolean>;
	};
	/**
	 * AU21 §6 Decision B / Increment 3 — the `task_run` emit-time resolver
	 * (`@hyperidle/work`'s `resolveTaskRunRequest`, pre-bound with the real
	 * `requireRunnableAgent`), injected because `policy` is a SIBLING Service
	 * to `work` and cannot import it directly (Mechanism C). Wired at the
	 * composition root (`policy-bindings.ts`, which already imports
	 * `@hyperidle/work` directly for `handoffDeps.work`).
	 */
	readonly taskRunResolver?: {
		resolve(tx: WriteExecutor, attemptId: string): Promise<BakedWorkIntentRequest>;
	};
	/**
	 * AU26 H1 (§D-M.1) — the run-end write a handoff performs is
	 * `agent-orchestration`'s state transition, not policy's. `policy` asks the
	 * Layer that runs sessions to end the run; it does not write the row itself.
	 *
	 * Optional for the same reason `sessionRequests`/`taskRunResolver`/`org` are:
	 * it is a HANDOFF-only dependency, and `HandoffDeps` narrows it back to
	 * required with `NonNullable<...>`. The reactive/query composition roots
	 * (`registerPolicy`, `computeApprovalRate`) never touch it.
	 *
	 * Called with the handoff's OWN `tx` handle — the run must be terminal at
	 * the same commit as the task claim, or a handoff commits with a live run
	 * and nothing behind it ever cleans up (the reaper is routine-only).
	 */
	readonly runOrchestration?: {
		endRunForHandoff(exec: WriteExecutor, sessionId: string, endedAt: string): Promise<void>;
	};
}
