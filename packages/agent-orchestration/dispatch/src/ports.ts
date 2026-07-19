/**
 * `dispatch` Service (agent-orchestration) — outbound composition-boundary
 * (Mechanism C) DI ports, per architecture §10.2's census (as refined during
 * this migration — the census is "a floor, refinable during migration",
 * §14). `dispatch`'s real outbound edges (`work`/`routine`/`conversation`/
 * `users`/`settings`/`model-gateway`/`agent-selection`/`run-orchestration`/
 * `session-requests`/`cost`/`review`/`knowledge`) are ordinary
 * downward-or-intra-layer edges, wired by the caller
 * (`packages/server/src/services/dispatch-bindings.ts`, the not-yet-split
 * composition root) to each target's real exported functions.
 * `agent-selection`/`run-orchestration`/`session-requests`/`cost` are real,
 * same-layer (agent-orchestration) targets — Mechanism C still requires a
 * port for these (confirmed by `run-orchestration`'s own `→ session-requests`
 * port, both agent-orchestration; `session-requests`' own `→
 * trigger-resolution` port established the precedent first).
 * `toolHandlers`/`harness-registry`'s `workspaceFactory` are INTERIM
 * forward-references (`tool-handlers` is not yet a package, scheduled
 * Increment 4's C1 split; `harness-registry`'s `LocalSandboxAdapter`/
 * `AdapterPool` construction/registration surface beyond the Increment-0
 * `harness-capabilities.ts` slice is not yet migrated, scheduled Increment
 * 4) — wired at the composition root to those Services' still-flat
 * `packages/server` files, same shape as `run-orchestration`'s own interim
 * `sessionLifecycle`/`dispatch` ports before THIS migration.
 *
 * @lore AU19 Increment 3h: two call shapes needed a genuine COLLAPSE (not a
 * 1:1 port-per-function mirror) because Mechanism C forbids `dispatch` from
 * importing the Services `builtin-routine-handlers.ts` used to wire itself:
 *
 *  1. `runPracticeMeetingRoutine` used to build a `PracticeMeetingKnowledgeStore`
 *     (9 raw `@hyperidle/knowledge` accessor functions) and pass it as an
 *     argument to `@hyperidle/review`'s `createPracticeMeeting`. `dispatch`
 *     can no longer import `@hyperidle/knowledge`'s raw accessors OR
 *     `@hyperidle/review`'s `PracticeMeetingKnowledgeStore` type (even
 *     type-only) to build that store itself — the wiring is composition-root
 *     work, not `dispatch`'s own domain logic (`dispatch` only ever needs
 *     "review, run a practice meeting", never the knowledge-store plumbing
 *     underneath). `DispatchReviewAccessor.createPracticeMeeting` collapses
 *     the whole `practiceMeetingKnowledgeStore` construction + `review` call
 *     into ONE port method; the composition root
 *     (`dispatch-bindings.ts`) performs the exact same 9-function wiring
 *     `builtin-routine-handlers.ts` used to do inline.
 *  2. `runKnowledgePromotion` used to build `AttentionServiceDeps.work`/
 *     `.review` sub-ports (from `@hyperidle/work`'s `findItemByReasoningMarker`
 *     and `@hyperidle/review`'s `buildCreateReviewItemForKnowledge`/
 *     `attentionReviewReasoningMarker`) and pass them into
 *     `@hyperidle/knowledge`'s `buildAttentionService(...).recomputeScope(...)`.
 *     Same reasoning: `dispatch` cannot construct `knowledge`'s OWN required
 *     `work`/`review` ports. `DispatchKnowledgeAccessor.recomputeAttentionForCandidates`
 *     collapses this into ONE port method; the composition root performs the
 *     identical `buildAttentionService({db, eventBus, work, review}).recomputeScope(filter)`
 *     call. `dispatch` itself still owns the surrounding branching logic
 *     (the `sweep.scanned > 0` / `candidateIds.length > 0` checks) — only the
 *     cross-Service wiring collapsed, not `dispatch`'s own domain decision of
 *     WHEN to recompute.
 *
 * `runAutoPromotionSweep`/`runStaleSweep` stay 1:1 (both take only
 * `db`/`eventBus` — no sub-port wiring to collapse) and the NEW
 * `dispatch -> knowledge` portfolio-retro read (`listRecentByLayers`, added
 * this migration — see `@hyperidle/knowledge`'s `portfolio-retro-store.ts`)
 * is also 1:1.
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or typed directly off `@hyperidle/db`/`@hyperidle/shared` row types
 * per §7.3 W4) rather than imported from the target package — a Service
 * NEVER imports another Service, even for a type-only reference.
 */

import type {
	AgentSessionRequest,
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

// ---------------------------------------------------------------------------
// work — DispatchWorkAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `work`'s read/write surface this Service calls directly today. */
export interface DispatchWorkAccessor {
	listTasks(db: HyperIdleDb, opts: { readonly state: string }): Promise<readonly Task[]>;
	getTaskById(db: HyperIdleDb, id: string): Promise<Task | undefined>;
	getBetById(db: HyperIdleDb, id: string): Promise<Bet | undefined>;
	createItem(exec: WriteExecutor, values: NewItem): Promise<void>;
	findRetroItemByThreadIds(
		db: HyperIdleDb,
		threadIds: string[],
		marker: string,
	): Promise<{ readonly id: string } | undefined>;
}

// ---------------------------------------------------------------------------
// routine — DispatchRoutineAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/**
 * Structural mirror of `@hyperidle/routine`'s `RoutinePatch` — a plain
 * `Partial<NewRoutine>` is assignable to the real (wider, SQL-fragment-
 * accepting) mapped type since `dispatch` only ever patches plain values,
 * never a raw `SQL` fragment.
 */
export type DispatchRoutinePatch = Partial<NewRoutine>;

/** Port for `routine`'s read/write surface this Service calls directly today. */
export interface DispatchRoutineAccessor {
	insertRoutine(
		exec: WriteExecutor,
		values: NewRoutine,
		opts?: { readonly onConflictDoNothing?: boolean },
	): Promise<void>;
	getRoutineById(db: HyperIdleDb, id: string): Promise<Routine | undefined>;
	insertRoutineRun(exec: WriteExecutor, values: NewRoutineRun): Promise<void>;
	updateRoutineById(exec: WriteExecutor, id: string, patch: DispatchRoutinePatch): Promise<void>;
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
}

// ---------------------------------------------------------------------------
// conversation — DispatchConversationAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `conversation`'s read/write surface this Service calls directly today. */
export interface DispatchConversationAccessor {
	insertMessage(exec: HyperIdleDb, values: NewMessage): Promise<void>;
	listMessagesByThread(
		exec: HyperIdleDb,
		threadId: string,
		opts?: { readonly order?: "createdAt"; readonly dir?: "asc" | "desc" },
	): Promise<readonly Message[]>;
	getThreadById(exec: HyperIdleDb, id: string): Promise<Thread | undefined>;
	updateThread(exec: HyperIdleDb, id: string, patch: Partial<NewThread>): Promise<void>;
	getThreadIdsByHost(exec: HyperIdleDb, hostKind: string, hostId: string): Promise<string[]>;
	insertThread(exec: HyperIdleDb, values: NewThread): Promise<void>;
}

// ---------------------------------------------------------------------------
// users — DispatchUserAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' read/write surface this Service calls directly today. */
export interface DispatchUserAccessor {
	getOrCreateUser(exec: HyperIdleDb, id: string, create: NewUser): Promise<User>;
	getUserById(exec: HyperIdleDb, id: string): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// settings — DispatchSettingsAccessor (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/** The `server_config` fields this Service reads (cost cap + model gateway config). */
export interface DispatchServerConfigSnapshot {
	readonly cost: { readonly capMinor: number };
	readonly modelGateway: ModelGatewayConfig;
}

/** Port for `settings`' read surface this Service calls directly today. */
export interface DispatchSettingsAccessor {
	readServerConfig(db: HyperIdleDb): Promise<DispatchServerConfigSnapshot>;
}

// ---------------------------------------------------------------------------
// model-gateway — DispatchModelGatewayAccessor (ordinary downward edge, real
// target)
// ---------------------------------------------------------------------------

/**
 * Structural mirror of `@hyperidle/connections`'s `CredentialResolver` —
 * same idiom `@hyperidle/model-gateway`'s own `ModelGatewayCredentialResolver`
 * uses (a Service never imports another Service's type, even type-only).
 * Every real production caller already constructs a concrete
 * `DbCredentialResolver`/`EnvCredentialResolver` (both from
 * `@hyperidle/connections`), which structurally satisfies this port
 * unchanged.
 */
export interface DispatchCredentialResolver {
	resolve(name: CredentialName): Promise<string | null>;
}

/** Structural mirror of `@hyperidle/model-gateway`'s `AgentModelParams`. */
export interface DispatchAgentModelParams {
	readonly modelId: string | null;
	readonly modelProvider: string | null;
}

/** Port for `model-gateway`'s resolution surface this Service calls directly today. */
export interface DispatchModelGatewayAccessor {
	resolveAgentModel(
		agent: DispatchAgentModelParams,
		tierFallback: string,
		config: ModelGatewayConfig,
		credentialResolver: DispatchCredentialResolver,
	): Promise<ResolvedModel>;
	resolveModelTier(
		tier: "fast" | "workhorse",
		config: ModelGatewayConfig,
		credentialResolver: DispatchCredentialResolver,
	): Promise<ResolvedModel>;
}

// ---------------------------------------------------------------------------
// agent-selection — DispatchAgentSelectionAccessor (ordinary same-layer edge,
// real target — Mechanism C still requires a port, see this file's top `@lore`)
// ---------------------------------------------------------------------------

/**
 * Structural mirror of `@hyperidle/agent-selection`'s `ScaffoldRequest` — fields
 * this Service supplies for the `user_assistant` trigger.
 *
 * @lore AU20 Ag1b: replaces `DispatchAssistantFormationRequest` + the degenerate
 * `resolveAssistantFormation` stub. Dispatch now calls the same general
 * `resolveScaffoldSpecs` path that team-scaffold and agent-added already use,
 * parameterised by `trigger: "user_assistant"`. No behavior change: the resolver
 * returns the same system-prompt string that `resolveAssistantFormation` constant-
 * returned, but now through the real `composeRoster` path.
 */
export interface DispatchScaffoldRequest {
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
}

/** Structural mirror of `@hyperidle/agent-selection`'s `AgentScaffoldSpec` — only `systemPrompt` is read by dispatch. */
export interface DispatchAgentScaffoldSpec {
	readonly systemPrompt: string | null;
}

/** Port for `agent-selection`'s scaffold-spec surface dispatch calls today. */
export interface DispatchAgentSelectionAccessor {
	resolveScaffoldSpecs(
		request: DispatchScaffoldRequest,
	): Promise<readonly DispatchAgentScaffoldSpec[]>;
}

// ---------------------------------------------------------------------------
// run-orchestration — DispatchRunOrchestrationAccessor (ordinary same-layer
// edge, real target)
// ---------------------------------------------------------------------------

/**
 * Narrow mirror of `@hyperidle/run-orchestration`'s `RunOrchestrationProvisionDeps`
 * PLUS the extra runtime-only fields (`adapterPool`/`workspace`/
 * `mcpBridgeRegistry`/`mcpBaseUrl`) that flow through opaquely and are only
 * actually read deep inside `session-lifecycle`'s (not-yet-migrated)
 * `session-provisioning.ts` — same "same real object, narrower type crossing
 * the boundary" idiom `run-orchestration`'s own `ports.ts` documents. This
 * Service never inspects these fields itself, only constructs/forwards them.
 */
export interface DispatchProvisionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly onHarnessStarted?: () => void;
	/** Opaque pass-through — the real `AdapterPool` (harness-registry, INTERIM — see this file's top `@lore`). */
	readonly adapterPool: unknown;
	/** Opaque pass-through — this Service's own `workspaceFactory.create()` result. */
	readonly workspace: unknown;
	/** Opaque pass-through — the real `McpBridgeRegistry` (mcp-provider, INTERIM). */
	readonly mcpBridgeRegistry?: unknown;
	readonly mcpBaseUrl?: string;
}

/** Narrow mirror of `RunOrchestrationProvisionParams["conversational"]`'s real (`session-provisioning.ts`) shape — every field this Service constructs. */
export interface DispatchConversationalOptions {
	readonly threadId: string;
	readonly assistantAgentId: string;
	/** Opaque pass-through — this Service's own `toolHandlers.buildAssistantDraftRegistry` result. Never inspected by `run-orchestration`. */
	readonly draftRegistry: unknown;
	readonly messages: readonly ConversationMessage[];
	readonly systemPromptOverride: string | null;
}

/** Narrow mirror of `@hyperidle/run-orchestration`'s `ConsumeAgentSessionRequestOptions` — only the fields this Service supplies. */
export interface DispatchConsumeOptions {
	readonly sandboxBasePath: string;
	readonly resolvedModel?: ResolvedModel;
	readonly resolvedFastModel?: ResolvedModel;
	readonly conversational?: DispatchConversationalOptions;
}

/** Full mirror of `@hyperidle/run-orchestration`'s `RunOrchestrationProvisionResult` — every field is already `@hyperidle/db`/`@hyperidle/shared`-typed. */
export interface DispatchProvisionResult {
	readonly sessionId: string;
	readonly outcome: SessionOutcome | "budget_exhausted";
	readonly totalCostCents: number;
	readonly taskId: string | null;
	readonly returnVerdict?: "returned" | "not_returned";
	readonly forceReturnCount: number;
	readonly metrics?: SessionMetrics;
	readonly conversationalReply?: string;
	readonly conversationalToolCalls?: readonly CapturedToolCall[];
}

/** Port for `run-orchestration`'s consume-request surface this Service calls directly today. */
export interface DispatchRunOrchestrationAccessor {
	executeAgentRunRequest(
		deps: DispatchProvisionDeps,
		request: AgentSessionRequest,
		options: DispatchConsumeOptions,
	): Promise<DispatchProvisionResult>;
}

// ---------------------------------------------------------------------------
// session-requests — DispatchSessionRequestsAccessor (ordinary same-layer
// edge, real target)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/session-requests`'s `recordAgentWorkIntent` input. */
export interface DispatchAgentWorkIntentInput {
	readonly kind: string;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy: string | null;
	readonly idempotencyKey: string;
}

/** Structural mirror of `@hyperidle/session-requests`'s recorded intent row — only the fields this Service reads. */
export interface DispatchAgentWorkIntentRecord {
	readonly id: string;
	readonly idempotencyKey: string;
}

/** Port for `session-requests`' intent-recording surface this Service calls directly today. */
export interface DispatchSessionRequestsAccessor {
	recordAgentWorkIntent(
		exec: HyperIdleDb,
		input: DispatchAgentWorkIntentInput,
	): Promise<DispatchAgentWorkIntentRecord>;
}

// ---------------------------------------------------------------------------
// cost — DispatchCostAccessor (ordinary same-layer edge, real target)
// ---------------------------------------------------------------------------

/** Port for `cost`'s factory-spend read this Service calls directly today. */
export interface DispatchCostAccessor {
	getFactoryCostActual(db: HyperIdleDb): Promise<number>;
}

// ---------------------------------------------------------------------------
// review — DispatchReviewAccessor (ordinary downward edge, real target —
// collapsed call shape, see this file's top `@lore`)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/review`'s `CreatePracticeMeetingInput`. */
export interface DispatchCreatePracticeMeetingInput {
	readonly scopeId: string;
	readonly title: string;
	readonly nowMs: number;
}

/** Structural mirror of `@hyperidle/review`'s `CreatePracticeMeetingResult`. */
export interface DispatchCreatePracticeMeetingResult {
	readonly meetingId: string;
}

/** Port for `review`'s practice-meeting surface this Service calls directly today. */
export interface DispatchReviewAccessor {
	createPracticeMeeting(
		db: HyperIdleDb,
		input: DispatchCreatePracticeMeetingInput,
	): Promise<DispatchCreatePracticeMeetingResult>;
}

// ---------------------------------------------------------------------------
// knowledge — DispatchKnowledgeAccessor (ordinary downward edge, real target
// — `recomputeAttentionForCandidates` collapses a call shape, see this
// file's top `@lore`)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/knowledge`'s `AutoPromotionSweepResult` — every field this Service reads. */
export interface DispatchAutoPromotionSweepResult {
	readonly promotedIds: readonly string[];
	readonly flaggedForReviewIds: readonly string[];
	readonly skippedIds: readonly string[];
	readonly scanned: number;
}

/** Structural mirror of `@hyperidle/knowledge`'s `StaleSweepResult` — only the field this Service reads. */
export interface DispatchStaleSweepResult {
	readonly markedIds: readonly string[];
}

/** Structural mirror of `@hyperidle/knowledge`'s `RecentLayeredKnowledgeItemRow`. */
export interface DispatchRecentLayeredKnowledgeItem {
	readonly title: string;
	readonly updatedAt: string;
	readonly layer: string | null;
}

/** Structural mirror of `@hyperidle/knowledge`'s `AttentionRecomputeScopeResult`. */
export type DispatchAttentionRecomputeOutcome =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/** Port for `knowledge`'s promotion/decay/portfolio-read/attention surface this Service calls directly today. */
export interface DispatchKnowledgeAccessor {
	runAutoPromotionSweep(
		db: HyperIdleDb,
		eventBus: EventBus,
	): Promise<DispatchAutoPromotionSweepResult>;
	runStaleSweep(
		db: HyperIdleDb,
		eventBus: EventBus,
		nowMs: number,
		thresholdMs: number | undefined,
		options: { readonly silent: boolean },
	): Promise<DispatchStaleSweepResult>;
	listRecentByLayers(
		db: HyperIdleDb,
		layers: readonly string[],
		updatedSince: string,
	): Promise<readonly DispatchRecentLayeredKnowledgeItem[]>;
	/** Collapses `buildAttentionService({db, eventBus, work, review}).recomputeScope({ids})` — see this file's top `@lore`. */
	recomputeAttentionForCandidates(
		db: HyperIdleDb,
		eventBus: EventBus,
		candidateIds: readonly string[],
	): Promise<DispatchAttentionRecomputeOutcome>;
}

// ---------------------------------------------------------------------------
// tool-handlers — DispatchToolHandlersAccessor (INTERIM forward-reference —
// `tool-handlers` is not yet a package, scheduled Increment 4's C1 split,
// see this file's top `@lore`)
// ---------------------------------------------------------------------------

/** Narrow mirror of `tools/tool-registry.ts`'s (pre-migration) `ToolContext` — only the fields this Service constructs. */
export interface DispatchToolContext {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly agentId: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly sandboxPath: string;
	readonly ingestion: { readonly dispose: () => void };
}

/**
 * Port for `tool-handlers`' draft-tool surface this Service calls directly.
 *
 * @lore AU20 Am10: collapsed from 3 methods to 1. `resolveDraftTeamId` and
 * `resolveCurrentDraftBetId` are folded inside `buildAssistantDraftRegistry`;
 * callers pass raw inputs and the registry builder handles resolution internally.
 * The function is now async (returns `Promise<unknown>`).
 */
export interface DispatchToolHandlersAccessor {
	/** Opaque return — forwarded whole into `DispatchConversationalOptions.draftRegistry`, never inspected here. */
	buildAssistantDraftRegistry(
		ctx: DispatchToolContext,
		params: {
			readonly userId: string;
			readonly transcriptRows: ReadonlyArray<{
				readonly senderId: string;
				readonly payload: string;
			}>;
			readonly assistantAgentId: string;
		},
	): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// harness-registry (workspace factory) — DispatchWorkspaceFactory (INTERIM
// forward-reference — `harness-registry`'s `LocalSandboxAdapter` construction
// surface beyond the Increment-0 `harness-capabilities.ts` slice is not yet
// migrated, scheduled Increment 4, see this file's top `@lore`)
// ---------------------------------------------------------------------------

/** Port constructing a fresh per-turn sandbox workspace. Wraps `harness-registry`'s (pre-migration) `LocalSandboxAdapter` constructor. */
export interface DispatchWorkspaceFactory {
	/** Opaque return — forwarded whole into `DispatchProvisionDeps.workspace`, never inspected here. */
	create(): unknown;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/** Every real/interim outbound port this Service's 5 source files need. */
export interface DispatchPorts {
	readonly work: DispatchWorkAccessor;
	readonly routine: DispatchRoutineAccessor;
	readonly conversation: DispatchConversationAccessor;
	readonly users: DispatchUserAccessor;
	readonly settings: DispatchSettingsAccessor;
	readonly modelGateway: DispatchModelGatewayAccessor;
	readonly agentSelection: DispatchAgentSelectionAccessor;
	readonly runOrchestration: DispatchRunOrchestrationAccessor;
	readonly sessionRequests: DispatchSessionRequestsAccessor;
	readonly cost: DispatchCostAccessor;
	readonly review: DispatchReviewAccessor;
	readonly knowledge: DispatchKnowledgeAccessor;
	readonly toolHandlers: DispatchToolHandlersAccessor;
	readonly workspaceFactory: DispatchWorkspaceFactory;
}
