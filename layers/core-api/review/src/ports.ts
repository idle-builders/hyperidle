/**
 * `review` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports, collapsed to ONE composite `ReviewPorts` bag per AU20 Am9.
 *
 * @lore AU20 Am9: the original 8+ individual port interfaces
 * (`ReviewWorkStore`, `ReviewConversationStore`, `ReviewUserDirectory`,
 * `ReviewOrgRouting`, `ReviewRoutingContext`, `ReviewTaskPatch`,
 * `TaskRiskTierReader`, and 4 `ReviewAgentWorkIntent*` types) are bundled
 * into a single `ReviewPorts` composite. Callers that wire these ports now
 * pass ONE bag; adding a new dependency is a new FIELD, not a new exported
 * interface. The practice-meeting knowledge port
 * (`PracticeMeetingKnowledgeStore` + 9 `Raw*` mirror types) evaporates
 * entirely: that sub-module relocated to `@hyperidle/knowledge` (its actual
 * data owner) where it can touch the tables directly (Mechanism A), no longer
 * needing a 9-accessor DI port from inside `review`.
 *
 * `ReviewAgentWorkIntentInput` is the one payload type kept as the recorder's
 * contract — callers of `transitionProposedCall({to:'granted',...})` must
 * supply it via `ports.intentRecorder`.
 */
import type {
	Bet,
	HyperIdleDb,
	NewItem,
	NewThread,
	Task,
	Team,
	Thread,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type {
	AgentWorkIntentRecorderInput,
	SessionKnowledgeItemLike,
	AgentWorkIntentRecorder as SharedAgentWorkIntentRecorder,
} from "@hyperidle/work-intent-port";

// ---------------------------------------------------------------------------
// ReviewAgentWorkIntentInput — exported (the recorder's contract)
// ---------------------------------------------------------------------------

/**
 * AU21 §6 Decision G (recorder unification) — `review` used to re-declare its
 * own single-kind local mirror (`ReviewAgentWorkIntentInput`, narrowed to
 * `reengagement`/`proposed_call` only) instead of importing
 * `@hyperidle/work-intent-port`'s canonical seven-kind `AgentWorkIntentRecorderInput`
 * union — a redundant re-declaration now deleted. `review` only ever
 * constructs the `reengagement` member of the shared union (narrowed here via
 * `Extract`), but the CONTRACT callers depend on is the one shared type, so
 * `tsc` enforces conformance mechanically instead of by convention.
 */
export type ReviewAgentWorkIntentInput = Extract<
	AgentWorkIntentRecorderInput,
	{ kind: "reengagement" }
>;

// ---------------------------------------------------------------------------
// Internal helper types — NOT exported from barrel (bundled inside ReviewPorts)
// ---------------------------------------------------------------------------

type ReviewAgentWorkIntentRecorder = SharedAgentWorkIntentRecorder<WriteExecutor>;

/** Narrow patch shape `review` writes onto a task. */
interface ReviewTaskPatch {
	readonly threadId: string;
}

/** Org-routing context for resolving review recipients. */
interface ReviewRoutingContext {
	userId?: string;
	agentRole?: string;
	teamId?: string;
}

// ---------------------------------------------------------------------------
// ReviewPorts — the single composite outbound-dependency bag
// ---------------------------------------------------------------------------

/**
 * All outbound DI edges for the `review` service, bundled into one bag.
 * Add a new dependency as a new field; no new exported type required.
 *
 * @lore AU20 Am9: `no knowledge port` — practice-meeting relocated to
 * `@hyperidle/knowledge`, so the `review` → `knowledge` edge that required
 * the 9-accessor `PracticeMeetingKnowledgeStore` no longer exists.
 */
export interface ReviewPorts {
	readonly work: {
		getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
		updateTaskById(db: WriteExecutor, id: string, patch: ReviewTaskPatch): Promise<void>;
		createItem(db: WriteExecutor, values: NewItem): Promise<void>;
		getRiskTierByTaskId(db: HyperIdleDb, taskId: string): Promise<string | null>;
	};
	readonly conversation: {
		insertThread(db: HyperIdleDb, values: NewThread): Promise<void>;
		updateThread(db: HyperIdleDb, id: string, patch: Partial<NewThread>): Promise<void>;
		getThreadById(db: HyperIdleDb, id: string): Promise<Thread | undefined>;
	};
	readonly users: {
		getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
		listUsersByKind(db: HyperIdleDb, kind: string): Promise<User[]>;
	};
	readonly org: {
		resolveReviewRecipients(
			db: HyperIdleDb,
			context: ReviewRoutingContext,
			users: { listUsersByKind(db: HyperIdleDb, kind: string): Promise<User[]> },
		): Promise<string[]>;
	};
	readonly intentRecorder: ReviewAgentWorkIntentRecorder;
	/**
	 * AU21 §6 Decision B — the shared ast-`<userId>` runnability invariant
	 * (`@hyperidle/users`' `requireRunnableAgent`), injected because `review`
	 * cannot statically import `@hyperidle/users` (Mechanism C). Used by
	 * `proposed-call-workflow.ts`'s `resolveReengagementRequest` (via
	 * `registerReviewSubscriptions`'s liveness-net wiring) to validate the
	 * grant's resolved agent at emit time, never trusting the flagging actor.
	 * Widened `Promise<unknown>` → `Promise<User>` in Increment 12 Wave B (H2
	 * precedent) — the real wired implementation (`@hyperidle/users`'
	 * `requireRunnableAgent`, `server-factory.ts:516`) already returns
	 * `Promise<User>`; this is a type-only widening, no behavior change.
	 */
	readonly requireRunnableAgent: (db: HyperIdleDb, agentId: string) => Promise<User>;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/work`'s own
	 * `bets` table + `@hyperidle/org`'s `getTeam`, injected (Mechanism C —
	 * `review` cannot import `work`/`org` directly). Forwarded into
	 * `resolveReengagementRequest`'s deps (via `applyLivenessRetry`/
	 * `handleUnconsumedGrantOnSessionEnd`/`reengageOnAdmissionFailure`) so the
	 * liveness-net re-provision bakes the same `contextBundle` the primary
	 * `transitionProposedCall({to:"granted"})` emit site does.
	 */
	readonly getBetById?: (db: HyperIdleDb, id: string) => Promise<Bet | undefined>;
	readonly getTeamById?: (db: HyperIdleDb, id: string) => Promise<Team | undefined>;
	/** AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/knowledge`'s `assembleSessionKnowledge`, injected for the same Mechanism C reason. */
	readonly assembleSessionKnowledge?: (
		db: HyperIdleDb,
		input: {
			readonly teamId: string;
			readonly agentRole: string;
			readonly taskDescription: string;
		},
	) => Promise<readonly SessionKnowledgeItemLike[]>;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — optional: `@hyperidle/settings`'s
	 * `readServerConfig`, injected (Mechanism C) for the `harnessDisabled` bake
	 * `resolveReengagementRequest` forwards onto every `reengagement` request.
	 */
	readonly readServerConfig?: (
		db: HyperIdleDb,
	) => Promise<{ readonly harnessDisabled: readonly string[] }>;
	/**
	 * AU27 Increment 1 (Decision 0) — optional: resolve-or-create the task's
	 * `hostKind:"task"` calling thread, injected (Mechanism C — `review`
	 * cannot import `@hyperidle/conversation` directly) for the
	 * `callingThreadId` bake `resolveReengagementRequest` forwards onto every
	 * `reengagement` request.
	 */
	readonly resolveOrCreateCallingThread?: (
		db: HyperIdleDb,
		taskId: string,
		agentId: string,
	) => Promise<string>;
}
