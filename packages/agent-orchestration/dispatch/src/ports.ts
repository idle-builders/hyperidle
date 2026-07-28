import type {
	AgentSessionRequest,
	AgentWorkIntent,
	Bet,
	HyperIdleDb,
	Message,
	NewItem,
	NewMessage,
	NewRoutine,
	NewRoutineRun,
	NewThread,
	NewUser,
	Routine,
	Task,
	Thread,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type {
	CapturedToolCall,
	ConversationMessage,
	CredentialName,
	EventBus,
	ModelGatewayConfig,
	ResolvedModel,
	SessionMetrics,
	SessionOutcome,
} from "@hyperidle/shared";

/** Composition-boundary capabilities required by dispatch. */
export interface DispatchPorts {
	readonly work: {
		listTasks(db: HyperIdleDb, opts: { readonly state: string }): Promise<readonly Task[]>;
		getTaskById(db: HyperIdleDb, id: string): Promise<Task | undefined>;
		getBetById(db: HyperIdleDb, id: string): Promise<Bet | undefined>;
		createItem(exec: WriteExecutor, values: NewItem): Promise<void>;
		findRetroItemByThreadIds(
			db: HyperIdleDb,
			threadIds: string[],
			marker: string,
		): Promise<{ readonly id: string } | undefined>;
	};
	readonly routine: {
		insertRoutine(
			exec: WriteExecutor,
			values: NewRoutine,
			opts?: { readonly onConflictDoNothing?: boolean },
		): Promise<void>;
		getRoutineById(db: HyperIdleDb, id: string): Promise<Routine | undefined>;
		insertRoutineRun(exec: WriteExecutor, values: NewRoutineRun): Promise<void>;
		updateRoutineById(exec: WriteExecutor, id: string, patch: Partial<NewRoutine>): Promise<void>;
		findRunningRoutineRun(
			db: HyperIdleDb,
			routineId: string,
		): Promise<{ readonly id: string } | undefined>;
		listActiveRoutines(
			db: HyperIdleDb,
			opts?: { readonly triggerType?: string },
		): Promise<readonly Routine[]>;
		listScheduledRoutinesMissingNextRunAt(db: HyperIdleDb): Promise<readonly Routine[]>;
		sumRoutineRunCostSince(db: HyperIdleDb, routineId: string, since: string): Promise<number>;
	};
	readonly conversation: {
		/**
		 * @lore AU21 §9 Increment 2 (conversation wave): this call routes through
		 * the `CoreApiPort` seam (`dispatch-bindings.ts`) — the assistant-turn
		 * writes are "agent-as-user" (architecture.md §6 Decision A/C). The
		 * seam's route actor derives from `values.senderId` (always the
		 * assistant agent's own identity, `ast-<userId>`, never the human
		 * sender) — no separate actor param needed here.
		 */
		insertMessage(exec: HyperIdleDb, values: NewMessage): Promise<void>;
		listMessagesByThread(
			exec: HyperIdleDb,
			threadId: string,
			opts?: { readonly order?: "createdAt"; readonly dir?: "asc" | "desc" },
		): Promise<readonly Message[]>;
		getThreadById(exec: HyperIdleDb, id: string): Promise<Thread | undefined>;
		/**
		 * @lore AU21 §9 Increment 2 (conversation wave): this call routes through
		 * the `CoreApiPort` seam. Unlike `insertMessage`, `patch` carries no
		 * sender/actor field, so the caller (`registerAssistantTriggerInternal`)
		 * threads the assistant agent's own identity explicitly via `actorId`
		 * (architecture.md §12) — the one migrated `updateThread` call site.
		 */
		updateThread(
			exec: HyperIdleDb,
			id: string,
			patch: Partial<NewThread>,
			actorId: string,
		): Promise<void>;
		getThreadIdsByHost(exec: HyperIdleDb, hostKind: string, hostId: string): Promise<string[]>;
		insertThread(exec: HyperIdleDb, values: NewThread): Promise<void>;
	};
	readonly users: {
		getOrCreateUser(exec: HyperIdleDb, id: string, create: NewUser): Promise<User>;
		getUserById(exec: HyperIdleDb, id: string): Promise<User | undefined>;
	};
	readonly settings: {
		readServerConfig(db: HyperIdleDb): Promise<{
			readonly cost: { readonly capMinor: number };
			readonly modelGateway: ModelGatewayConfig;
		}>;
	};
	readonly modelGateway: {
		resolveAgentModel(
			agent: { readonly modelId: string | null; readonly modelProvider: string | null },
			tierFallback: string,
			config: ModelGatewayConfig,
			credentialResolver: { resolve(name: CredentialName): Promise<string | null> },
		): Promise<ResolvedModel>;
		resolveModelTier(
			tier: "fast" | "workhorse",
			config: ModelGatewayConfig,
			credentialResolver: { resolve(name: CredentialName): Promise<string | null> },
		): Promise<ResolvedModel>;
	};
	readonly agentSelection: {
		resolveScaffoldSpecs(request: {
			readonly db: HyperIdleDb;
			readonly trigger: "user_assistant";
			readonly teamId: null;
			readonly teamMembersId: null;
			readonly teamName: null;
			readonly functions: null;
			readonly role: null;
			readonly name: null;
			readonly ownerUserId: string;
			readonly ownerUserName: null;
		}): Promise<readonly { readonly systemPrompt: string | null }[]>;
	};
	readonly runOrchestration: {
		executeAgentRunRequest(
			deps: {
				readonly db: HyperIdleDb;
				readonly eventBus: EventBus;
				readonly onHarnessStarted?: () => void;
				readonly adapterPool: unknown;
				readonly workspace: unknown;
				readonly mcpBridgeRegistry?: unknown;
				readonly mcpBaseUrl?: string;
			},
			request: AgentSessionRequest,
			options: {
				readonly sandboxBasePath: string;
				readonly resolvedModel?: ResolvedModel;
				readonly resolvedFastModel?: ResolvedModel;
				readonly conversational?: {
					readonly threadId: string;
					readonly assistantAgentId: string;
					readonly draftRegistry: unknown;
					readonly messages: readonly ConversationMessage[];
					readonly systemPromptOverride: string | null;
				};
			},
		): Promise<{
			readonly sessionId: string;
			readonly outcome: SessionOutcome | "budget_exhausted";
			readonly totalCostCents: number;
			readonly taskId: string | null;
			readonly returnVerdict?: "returned" | "not_returned";
			readonly forceReturnCount: number;
			readonly metrics?: SessionMetrics;
			readonly conversationalReply?: string;
			readonly conversationalToolCalls?: readonly CapturedToolCall[];
		}>;
	};
	readonly sessionRequests: {
		enqueueWorkIntent(
			exec: WriteExecutor,
			input: {
				readonly kind:
					| "assistant_turn"
					| "routine_run"
					| "bet_decomposition"
					| "task_run"
					| "reengagement";
				readonly sourceKind:
					| "thread_message"
					| "explicit_session_start"
					| "knowledge_action"
					| "routine_run"
					| "bet"
					| "task_dispatch_attempt"
					| "proposed_call";
				readonly sourceId: string;
				readonly requestedBy?: string;
				readonly idempotencyKey: string;
			},
		): Promise<AgentWorkIntent>;
	};
	readonly cost: { getFactoryCostActual(db: HyperIdleDb): Promise<number> };
	readonly review: {
		createPracticeMeeting(
			db: HyperIdleDb,
			input: { readonly scopeId: string; readonly title: string; readonly nowMs: number },
		): Promise<{ readonly meetingId: string }>;
	};
	readonly knowledge: {
		runAutoPromotionSweep(
			db: HyperIdleDb,
			eventBus: EventBus,
		): Promise<{
			readonly promotedIds: readonly string[];
			readonly flaggedForReviewIds: readonly string[];
			readonly skippedIds: readonly string[];
			readonly scanned: number;
		}>;
		runStaleSweep(
			db: HyperIdleDb,
			eventBus: EventBus,
			nowMs: number,
			thresholdMs: number | undefined,
			options: { readonly silent: boolean },
		): Promise<{ readonly markedIds: readonly string[] }>;
		listRecentByLayers(
			db: HyperIdleDb,
			layers: readonly string[],
			updatedSince: string,
		): Promise<
			readonly {
				readonly title: string;
				readonly updatedAt: string;
				readonly layer: string | null;
			}[]
		>;
		recomputeAttentionForCandidates(
			db: HyperIdleDb,
			eventBus: EventBus,
			candidateIds: readonly string[],
		): Promise<
			| { readonly ok: true }
			| { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
		>;
	};
	readonly toolHandlers: {
		buildAssistantDraftRegistry(
			ctx: {
				readonly db: HyperIdleDb;
				readonly eventBus: EventBus;
				readonly agentId: string;
				readonly sessionId: string;
				readonly taskId: string;
				readonly sandboxPath: string;
				readonly ingestion: { readonly dispose: () => void };
			},
			params: {
				readonly userId: string;
				readonly transcriptRows: ReadonlyArray<{
					readonly senderId: string;
					readonly payload: string;
				}>;
				readonly assistantAgentId: string;
			},
		): Promise<unknown>;
	};
	readonly workspaceFactory: { create(): unknown };
}
