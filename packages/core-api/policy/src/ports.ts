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
			},
		): Promise<{ readonly id: string; readonly idempotencyKey: string }>;
		abort(sessionId: string): Promise<boolean>;
	};
}
