// @lore: AgentOrchestrationSessionWireRow — NOT a narrowing; POST /api/sessions returns verbatim; narrowed shape would silently drop fields from responses
export interface AgentOrchestrationSessionWireRow {
	readonly id: string;
	readonly taskId: string | null;
	readonly requestId: string | null;
	readonly sourceKind: string | null;
	readonly sourceId: string | null;
	readonly sourceCorrelationJson: string | null;
	readonly agentId: string;
	readonly modelTier: string;
	readonly startedAt: string;
	readonly endedAt: string | null;
	readonly state: string;
	readonly sandboxSnapshot: string | null;
	readonly outcome: string | null;
	readonly notes: string | null;
}

export interface AgentOrchestrationSessionsPort {
	getById(sessionId: string): Promise<AgentOrchestrationSessionWireRow | null>;
}

/** Mirrors `AgentWorkIntentRecorderInput`'s discriminant (`@hyperidle/shared`). */
export type AgentOrchestrationWorkIntentKind =
	| "thread_turn"
	| "task_run"
	| "session_resume"
	| "subscription_run";

export interface AgentOrchestrationWorkIntentInput {
	readonly kind: AgentOrchestrationWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
	readonly bakedRequest?: unknown;
	/** Separate from `bakedRequest`: one starts a session, the other returns to one — a reader should not need to know the kind to know which shape arrived. */
	readonly resume?: unknown;
}

/** Mirrors the row `enqueueWorkIntent` returns — `id` + `idempotencyKey` only. */
export interface AgentOrchestrationWorkIntentReceipt {
	readonly id: string;
	readonly idempotencyKey: string;
}

export type AgentOrchestrationReviewVerdictOutcome =
	| { readonly status: "queued" }
	| { readonly status: "not_a_review_session" }
	| { readonly status: "not_resumable"; readonly reason: string };

export interface AgentOrchestrationReviewVerdictInput {
	readonly reviewMessageId: string;
	/** Mirrors `SessionResumeReply` (`@hyperidle/domain-model`). */
	readonly decision: "approve" | "decline" | "answer";
	readonly note?: string;
	readonly answer?: { readonly option: string } | { readonly text: string };
	readonly decidedBy: string;
	readonly threadId: string;
	/**
	 * The asking agent's runnable-config snapshot, baked core-side because
	 * `users` is core state.
	 *
	 * Every intent kind bakes this — a missing bake is a hard provisioning
	 * failure, never a silent allow — and a resume is no exception. Carried
	 * opaque here for the same reason `bakedRequest` is.
	 */
	readonly agentConfig?: unknown;
}

export interface AgentOrchestrationIntentsPort {
	submit(input: AgentOrchestrationWorkIntentInput): Promise<AgentOrchestrationWorkIntentReceipt>;
	/** Returns what happened — the human who approved must be told when the agent cannot be resumed. */
	recordReviewVerdict(
		input: AgentOrchestrationReviewVerdictInput,
	): Promise<AgentOrchestrationReviewVerdictOutcome>;
}

/** One run actually stopped by `runs.stopForTasks` — mirrors `StoppedRun`. */
export interface AgentOrchestrationStoppedRun {
	readonly taskId: string;
	readonly sessionId: string;
}

export interface AgentOrchestrationRunsPort {
	stopForTasks(taskIds: readonly string[]): Promise<ReadonlyArray<AgentOrchestrationStoppedRun>>;
	endForHandoff(sessionId: string, endedAt: string): Promise<void>;
}

/** Mirrors `AgentRunConfig` (`@hyperidle/agent-run-config`). */
export interface AgentOrchestrationRunConfigView {
	// The agent's identity is NOT here. It is the `agent_file` document
	// bound to the agent (scope_kind='user', scope_id = the agent's id), edited
	// like any other document. Run config is how an agent runs; the identity is
	// who it is, and it stopped being a column so a plugin could contribute one.
	readonly harnessType: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
	/**
	 * The harness options this agent's model runs with. Sparse — a key is present
	 * only where the user moved a control away from the harness's own default, so
	 * an absent key means "whatever the harness does".
	 */
	readonly modelOptions: Readonly<Record<string, string | number | boolean>>;
}

/** Mirrors `AgentRunConfigPatch` — a present key is written (incl. explicit `null`); an absent key is left alone. */
export type AgentOrchestrationRunConfigPatch = {
	-readonly [K in keyof AgentOrchestrationRunConfigView]?: AgentOrchestrationRunConfigView[K];
};

/** Admin routes stay core-hosted; only the store access crosses the seam. */
export interface AgentOrchestrationRunConfigPort {
	read(agentId: string): Promise<AgentOrchestrationRunConfigView>;
	readBatch(
		agentIds: readonly string[],
	): Promise<ReadonlyMap<string, AgentOrchestrationRunConfigView>>;
	write(agentId: string, patch: AgentOrchestrationRunConfigPatch): Promise<void>;
}

/** Mirrors `filesystem_injections`' wire-relevant columns. */
export interface AgentOrchestrationFilesystemInjectionView {
	readonly agentUserId: string;
	readonly filesystemId: string;
	readonly createdAt: string;
}

export type AgentOrchestrationPersistInjectionResult =
	| { readonly ok: true; readonly injection: AgentOrchestrationFilesystemInjectionView }
	| { readonly ok: false; readonly code: "NOT_FOUND" | "CONFLICT" };

export interface AgentOrchestrationFilesystemsPort {
	/** Read BEFORE `persistInjection` — the team-consistency gate must reject a mismatch without writing; persistInjection's existence check runs too late for that ordering. */
	getTeamId(filesystemId: string): Promise<string | null>;
	persistInjection(
		filesystemId: string,
		agentUserId: string,
	): Promise<AgentOrchestrationPersistInjectionResult>;
}

/**
 * A remove-style write's outcome — shared by every `folders`/`connections`
 * operation that either succeeds or reports the row was never there.
 */
export type AgentOrchestrationRemoveResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "NOT_FOUND" };

/** Mirrors `ServiceConnectionView` — hand-typed (zero-runtime-deps); held and inherited connections share this shape. */
export interface AgentOrchestrationConnectionView {
	readonly id: string;
	readonly service: string;
	readonly via: string;
	readonly authSource: "token" | "mcp" | "inherited";
	readonly health: "working" | "needs-attention";
	readonly removable: boolean;
	readonly withheldFrom: readonly string[];
}

export interface AgentOrchestrationConnectionsListView {
	readonly connections: readonly AgentOrchestrationConnectionView[];
	readonly inherited: readonly AgentOrchestrationConnectionView[];
}

/**
 * Mirrors `createConnectionSchema`'s discriminated union
 * (`agent-orchestration/src/routes/connections.ts`) — the exact input the
 * extracted `createConnectionForUser` validates and encrypts.
 */
export type AgentOrchestrationConnectionCreateInput =
	| { readonly service: string; readonly authSource: "token"; readonly token: string }
	| { readonly service?: string; readonly authSource: "mcp"; readonly serverUrl: string };

export type AgentOrchestrationCreateConnectionResult =
	| { readonly ok: true; readonly connection: AgentOrchestrationConnectionView }
	| { readonly ok: false; readonly code: "MISSING_ROOT_SECRET" | "DUPLICATE_CONNECTION" };

export interface AgentOrchestrationConnectionsPort {
	list(userId: string): Promise<AgentOrchestrationConnectionsListView>;
	add(
		userId: string,
		input: AgentOrchestrationConnectionCreateInput,
	): Promise<AgentOrchestrationCreateConnectionResult>;
	remove(userId: string, id: string): Promise<AgentOrchestrationRemoveResult>;
	/** Keep one of the user's connections from one agent (`keep: true`), or let it reach it again. */
	withhold(
		userId: string,
		id: string,
		agentUserId: string,
		keep: boolean,
	): Promise<AgentOrchestrationRemoveResult>;
}

/** Mirrors `Filesystem` (`@hyperidle/filesystems`). */
export interface AgentOrchestrationFolderView {
	readonly id: string;
	readonly teamId: string;
	readonly source: string;
	readonly kind: "code" | "doc_set";
	readonly connectionId: string | null;
	readonly resourceRef:
		| { readonly kind: "code"; readonly repo: string; readonly branch: string }
		| { readonly kind: "doc_set"; readonly folder: string };
	readonly writeback: "git" | "file" | "none";
	readonly state: "attached" | "reachable" | "needs_attention";
	readonly createdAt: string;
}

export type AgentOrchestrationFolderListQuery =
	| { readonly teamId: string }
	| { readonly agentUserId: string };

/** Mirrors `POST /filesystems` body, minus the `teamId` that `folders.add` takes separately. */
export interface AgentOrchestrationFolderCreateInput {
	readonly kind: "code" | "doc_set";
	readonly connectionId?: string | null;
	readonly resourceRef: AgentOrchestrationFolderView["resourceRef"];
	readonly writeback: "git" | "file" | "none";
}

export type AgentOrchestrationAddFolderResult =
	| { readonly ok: true; readonly folder: AgentOrchestrationFolderView }
	| { readonly ok: false; readonly code: "TEAM_NOT_FOUND" };

/** `give` is `filesystems.persistInjection` under a second name — same route, same write — so edit_user's folder verbs read as one family. */
export interface AgentOrchestrationFoldersPort {
	list(query: AgentOrchestrationFolderListQuery): Promise<readonly AgentOrchestrationFolderView[]>;
	add(
		teamId: string,
		body: AgentOrchestrationFolderCreateInput,
	): Promise<AgentOrchestrationAddFolderResult>;
	remove(id: string): Promise<AgentOrchestrationRemoveResult>;
	give(id: string, agentUserId: string): Promise<AgentOrchestrationPersistInjectionResult>;
	take(id: string, agentUserId: string): Promise<AgentOrchestrationRemoveResult>;
}

export interface AgentOrchestrationPort {
	readonly sessions: AgentOrchestrationSessionsPort;
	readonly intents: AgentOrchestrationIntentsPort;
	readonly runs: AgentOrchestrationRunsPort;
	readonly runConfig: AgentOrchestrationRunConfigPort;
	readonly filesystems: AgentOrchestrationFilesystemsPort;
	/** A team's folders, given to and taken from an agent. */
	readonly folders: AgentOrchestrationFoldersPort;
	/** One user's held connections plus the machine's inherited reach. */
	readonly connections: AgentOrchestrationConnectionsPort;
	readonly gate: AgentOrchestrationGatePort;
}

export interface AgentOrchestrationGatePort {
	linkReview(sessionId: string, reviewMessageId: string): Promise<void>;
}

export type AgentOrchestrationTransport = (req: Request) => Promise<Response>;
