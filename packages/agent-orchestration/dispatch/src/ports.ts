import type {
	AgentSessionRequest,
	HyperIdleDb,
	Message,
	NewMessage,
	NewThread,
	NewUser,
	Thread,
	User,
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

/**
 * Composition-boundary capabilities required by dispatch.
 *
 * @lore AU21 §9 Increment 4: `routine`/`review`/`knowledge`/`cost`/
 * `sessionRequests` shrink or disappear — the routine scheduler + all four
 * builtin-routine bodies relocated to `@hyperidle/routine`'s
 * `routine-scheduler.ts` (architecture.md §6 Decision B′/B″ ruling #4).
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): `routine`
 * is gone entirely now too — `provisionTeamRoutinesInternal` (routine
 * *definition* seeding at team-creation time, dispatch's last remaining
 * direct `routine` table write) relocated to `@hyperidle/routine`'s
 * `routine-scheduler.ts` (`provisionTeamRoutines`, an intra-package call
 * there). `dispatch` has zero `agent-orchestration -> routine` edge left —
 * see `service.ts`'s own `@lore` for the full reasoning.
 */
export interface DispatchPorts {
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
