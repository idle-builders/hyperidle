/**
 * AU21 — `AgentOrchestrationPort`: agent-orchestration's own read door
 * (architecture.md §6 Decision D, §9 Increment 6, §10), symmetric in shape to
 * `CoreApiPort` (Decision A/C, Increment 1) but the OPPOSITE direction: it
 * serves what agent-orchestration genuinely owns — session/run history — to
 * core-ui/core-api, never the reverse.
 *
 * @lore AU21 Increment 14a: the per-session cost read
 * (`getSessionCostBySessionId`) this door originally also served is
 * HARD-DELETED along with the rest of the cost feature — no replacement.
 *
 * TYPE-ONLY, same as `core-api-port.ts` — `@hyperidle/api-contract` stays
 * zero-runtime-deps. Every type below is a hand-written mirror of the real
 * backing route (`agent-orchestration-sessions-routes.ts`, mounted at
 * `/api/agent-orchestration` in core-api's own `app.ts` — see that route
 * file's header for why the HTTP hosting lives in core-api even though the
 * DATA and the query logic are agent-orchestration's own, per
 * `@hyperidle/session-requests`). Fidelity is a TESTED obligation (§11,
 * mirrored for this port in `agent-orchestration-port.integration.test.ts`),
 * never a compiler guarantee (`AppType` is bare `Hono`).
 *
 * The `sessions` family below is STRICTLY READ-ONLY (§12, unchanged by
 * AU31): every method reads display data only. AU31 §3/§13 item 2 adds a
 * WRITE side alongside it (`intents`/`requests`/`runs`/`runConfig`/
 * `filesystems`, defined further down this file) — supersedes AU26 H1/H2's
 * "the door stays read-only"; one door, both directions.
 */

/**
 * One session row, in full — every column `sessions` has (18), hand-typed the
 * same way as the entries above because `api-contract` stays zero-runtime-deps.
 *
 * @lore AU26 B1a (§D-A's `sessions-routes.ts` split, AC5(d)): this is deliberately NOT a narrowing.
 * `POST /api/sessions` stays core-hosted and reads its admitted session row
 * through `getById`; its 202 branch returns that row verbatim. The seven-field
 * shape the decoration reads use (`listByAgentIds`/`listByTaskId`/`listActive`,
 * D1) would silently drop 11 fields from a shipped response, and no route test
 * in the checklist would catch it.
 */
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
	readonly routineId: string | null;
	readonly effectivenessScore: string | null;
	readonly effectivenessRecordedAt: string | null;
	readonly effectivenessRecordedBy: string | null;
}

/**
 * The `sessions` capability family (Decision D/E) — session/run history read.
 */
export interface AgentOrchestrationSessionsPort {
	/**
	 * One session row by id, in FULL wire shape, or `null` when it does not exist.
	 */
	getById(sessionId: string): Promise<AgentOrchestrationSessionWireRow | null>;
}

/**
 * AU31 §3 — the write side of `AgentOrchestrationPort`. Core converses with
 * `session-requests`/`run-orchestration`/`agent-run-config`/`filesystems`
 * (all agent-orchestration-owned) exclusively through these operations from
 * this WP onward — supersedes AU26 H1/H2's "the door stays read-only"
 * (architecture.md §13 item 2). Every type below is a hand-typed mirror of
 * the real backing route, same zero-runtime-deps convention as the read
 * side above — in particular `AgentOrchestrationWorkIntentInput` mirrors
 * `@hyperidle/shared`'s `AgentWorkIntentRecorderInput` structurally (the two
 * are duck-type compatible on purpose, so a seam-backed
 * `AgentWorkIntentRecorder<HyperIdleDb>` can be built directly over this
 * port at the composition root without a third type).
 */

/** Mirrors `AgentWorkIntentRecorderInput`'s discriminant (`@hyperidle/shared`). */
export type AgentOrchestrationWorkIntentKind =
	| "assistant_turn"
	| "session_start"
	| "knowledge_action"
	| "routine_run"
	| "task_run"
	| "session_resume";

/**
 * Mirrors `AgentWorkIntentRecorderInput` — `bakedRequest` is carried opaque
 * (never inspected by the port itself, only forwarded over the wire), same
 * idiom as `CoreApiWorkPort.createArtifact`'s opaque `preview`.
 */
export interface AgentOrchestrationWorkIntentInput {
	readonly kind: AgentOrchestrationWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
	readonly bakedRequest?: unknown;
	/**
	 * BA2: `session_resume`'s payload, carried opaque like `bakedRequest` beside
	 * it. A separate field rather than a reuse of `bakedRequest` because the two
	 * describe different things — one starts a session, the other returns to one —
	 * and a reader should not have to know the kind to know which shape arrived.
	 */
	readonly resume?: unknown;
}

/** Mirrors the row `enqueueWorkIntent` returns — `id` + `idempotencyKey` only, the AC-9 shape. */
export interface AgentOrchestrationWorkIntentReceipt {
	readonly id: string;
	readonly idempotencyKey: string;
}

/**
 * BA2: what a verdict did about the review a gate denial produced. Mirrors
 * `GateVerdictOutcome` — the port carries it as data so a core-api route can
 * tell the human without ever reading `gate_reviews`.
 */
export type AgentOrchestrationGateVerdictOutcome =
	| { readonly status: "queued" }
	| { readonly status: "not_a_gate_review" }
	| { readonly status: "not_resumable"; readonly reason: string };

/** BA2: a human's verdict on a review, as it crosses into agent-orchestration. */
export interface AgentOrchestrationGateVerdictInput {
	readonly reviewMessageId: string;
	readonly decision: "approve" | "decline";
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

/** The intent-write family (`intents.*`). */
export interface AgentOrchestrationIntentsPort {
	/** The durable enqueue — mirrors `enqueueWorkIntent`'s row-level identity/idempotency semantics. */
	submit(input: AgentOrchestrationWorkIntentInput): Promise<AgentOrchestrationWorkIntentReceipt>;
	/**
	 * BA2: record a verdict on a gate-caused review and queue the resume that
	 * carries it back to the agent. Returns what happened, because the human who
	 * approved has to be told when the agent cannot be sent back.
	 */
	recordGateVerdict(
		input: AgentOrchestrationGateVerdictInput,
	): Promise<AgentOrchestrationGateVerdictOutcome>;
}

/** The requests family — outstanding-work readers and session-start lifecycle writers. */
export interface AgentOrchestrationRequestsPort {
	/** `listPendingIntentsByKind` — the B‴ coherence trigger's outstanding-work reader. */
	listPendingIntentsByKind(kind: AgentOrchestrationWorkIntentKind): Promise<
		ReadonlyArray<{
			readonly id: string;
			readonly sourceId: string;
			readonly requestedBy: string | null;
		}>
	>;
	/**
	 * Mark an explicit session-start row as failed.
	 * Called by core-api's `session_start` admission-failure reaction.
	 */
	failExplicitSessionStart(startId: string, failureCode: string): Promise<void>;
}

/** One run actually stopped by `runs.stopForTasks` — mirrors `StoppedRun`. */
export interface AgentOrchestrationStoppedRun {
	readonly taskId: string;
	readonly sessionId: string;
}

/** The "request-about-request" family (`runs.*`) — run lifecycle verbs. */
export interface AgentOrchestrationRunsPort {
	// @lore AU44 batch6: `reason` param dropped — STOP_DISPOSITIONS was a one-key
	// map with only "bet_killed" as a legal value. Disposition is now hardcoded.
	stopForTasks(taskIds: readonly string[]): Promise<ReadonlyArray<AgentOrchestrationStoppedRun>>;
	endForHandoff(sessionId: string, endedAt: string): Promise<void>;
	/** In-process registry abort — never crosses the seam itself; exposed here so a caller need not reach `sessionRunRegistry` directly. */
	abort(sessionId: string): Promise<void>;
}

/** Mirrors `AgentRunConfig` (`@hyperidle/agent-run-config`). */
export interface AgentOrchestrationRunConfigView {
	// The agent's identity is NOT here. It is the `agent_file` knowledge document
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

/** §2.2/§3 clause 2 — the persistence spelling for `agent_run_config`; admin routes stay core-hosted, only the store access crosses the seam. */
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

/** §2.6 — the one core-hosted injection route's persist step, seam-backed instead of a direct `@hyperidle/filesystems` import. */
export interface AgentOrchestrationFilesystemsPort {
	/**
	 * The team-consistency gate's own pre-write read: the filesystem's owning
	 * team, or `null` when the filesystem does not exist. Read BEFORE
	 * `persistInjection` — the gate must reject a team mismatch without
	 * writing, and `persistInjection`'s own existence check runs too late
	 * for that ordering.
	 */
	getTeamId(filesystemId: string): Promise<string | null>;
	persistInjection(
		filesystemId: string,
		agentUserId: string,
	): Promise<AgentOrchestrationPersistInjectionResult>;
}

/**
 * `AgentOrchestrationPort` — agent-orchestration's own door, symmetric to
 * `CoreApiPort` (architecture.md §10, §6 Decision D) but now carrying both
 * the original read side (`sessions`) and the AU31 write side.
 */
export interface AgentOrchestrationPort {
	readonly sessions: AgentOrchestrationSessionsPort;
	readonly intents: AgentOrchestrationIntentsPort;
	readonly requests: AgentOrchestrationRequestsPort;
	readonly runs: AgentOrchestrationRunsPort;
	readonly runConfig: AgentOrchestrationRunConfigPort;
	readonly filesystems: AgentOrchestrationFilesystemsPort;
}

/**
 * The seam's injectable transport — identical shape to `CoreApiTransport`
 * (single-`Request` fetch-handler, `===` Hono's own `app.fetch` signature),
 * so `buildAgentOrchestrationPort` supports the same in-process/network
 * transport duality (architecture.md §10).
 */
export type AgentOrchestrationTransport = (req: Request) => Promise<Response>;
