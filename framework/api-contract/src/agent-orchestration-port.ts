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

/** One session/run-history entry — mirrors the backing route's per-row shape. */
export interface AgentOrchestrationSessionHistoryEntry {
	readonly id: string;
	readonly sessionId: string | null;
	readonly status: string;
}

/**
 * One session-activity entry — a hand-typed, structural mirror of
 * `@hyperidle/shared`'s `ActivityEntry` discriminated union (AM3). `api-
 * contract` stays zero-runtime-deps (header note above), so this is a
 * deliberate type-only duplication, not an import — same idiom as
 * `AgentOrchestrationSessionHistoryEntry`. `data`'s shape varies by `type`
 * (`tool_call`/`reasoning`/…); callers that need the narrowed
 * shape reconstruct it the same way `useSessionActivity.ts` already does
 * for the WS/REST wire format (this door serves the identical JSON shape).
 */
export interface AgentOrchestrationSessionActivityEntry {
	readonly type: string;
	readonly timestamp: number;
	readonly data: unknown;
}

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
 * The `sessions` capability family (Decision D/E) — session/run history
 * for a given work source + the relocated session-activity stream (§9
 * Increment 7: `agent-execution` owns the buffer, this door gateways it).
 */
export interface AgentOrchestrationSessionsPort {
	/** All `agentSessionRequests` rows for one `(sourceKind, sourceId)`, oldest first. */
	listSessionHistoryBySource(
		sourceKind: string,
		sourceId: string,
	): Promise<ReadonlyArray<AgentOrchestrationSessionHistoryEntry>>;
	/**
	 * Recent activity entries for one session, oldest first, capped at the
	 * buffer's own ring size (100). Mirrors the relocated `SessionActivityBuffer`
	 * (now in `@hyperidle/agent-execution`)'s own `unknown session → []`
	 * semantics — no DB-existence check here; the REST route this door
	 * ultimately backs (`sessions-routes.ts`'s `GET /:id/activity`) keeps its
	 * own `sessions`-table 404 check and calls this only for the entries.
	 */
	getRecentActivity(
		sessionId: string,
	): Promise<ReadonlyArray<AgentOrchestrationSessionActivityEntry>>;
	/**
	 * One session row by id, in FULL wire shape, or `null` when it does not
	 * exist. The door core-hosted `POST /api/sessions` reads its admitted
	 * session through (§D-A's `sessions-routes.ts` split) — a read, so it goes through the Port; the
	 * Port stays strictly read-only.
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
	| "reengagement";

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
}

/** Mirrors the row `enqueueWorkIntent` returns — `id` + `idempotencyKey` only, the AC-9 shape. */
export interface AgentOrchestrationWorkIntentReceipt {
	readonly id: string;
	readonly idempotencyKey: string;
}

/**
 * §3.2 — the atomic explicit-start pair: creates `explicitSessionStarts` and
 * records the baked `session_start` intent in ONE orchestration-side
 * transaction, preserving the atomicity `sessions-routes.ts` has today
 * (feasibility.md P3). Core resolves `bakedRequest` from its own domain
 * BEFORE calling — the seam never reaches back into core state.
 */
export interface AgentOrchestrationExplicitStartRequest {
	readonly startId: string;
	readonly taskId: string;
	readonly requestedAgentId: string;
	readonly requestedModelTier?: string;
	readonly requestedBy: string;
	readonly idempotencyKey: string;
	readonly intentIdempotencyKey: string;
	readonly bakedRequest?: unknown;
}

/** Mirrors `explicitSessionStarts`' wire-relevant columns. */
export interface AgentOrchestrationExplicitStartView {
	readonly id: string;
	readonly status: string;
	readonly taskId: string;
	readonly requestedAgentId: string;
	readonly requestedModelTier: string | null;
	readonly requestedBy: string;
	readonly idempotencyKey: string;
	readonly sessionId: string | null;
}

export interface AgentOrchestrationExplicitStartResult {
	readonly start: AgentOrchestrationExplicitStartView;
	/** `null` only on the reused-idempotency-key replay path, where no new intent is recorded. */
	readonly intent: AgentOrchestrationWorkIntentReceipt | null;
}

/** The intent-write family (§3.2 `intents.*`). */
export interface AgentOrchestrationIntentsPort {
	/** The durable enqueue — mirrors `enqueueWorkIntent`'s row-level identity/idempotency semantics. */
	submit(input: AgentOrchestrationWorkIntentInput): Promise<AgentOrchestrationWorkIntentReceipt>;
	/** The atomic explicit-start pair (see the request type's doc comment above). */
	createExplicitStart(
		input: AgentOrchestrationExplicitStartRequest,
	): Promise<AgentOrchestrationExplicitStartResult>;
}

/** **[D1]** — the three read shapes production actually uses (feasibility.md P3), never a general `FindQuery` mirror. */
export interface AgentOrchestrationRequestsPort {
	/** The idempotency-gate probe (`sessions-routes.ts`'s pre-insert check — a real "use", gates a 409). */
	findExplicitStartByIdempotencyKey(
		requestedBy: string,
		idempotencyKey: string,
	): Promise<AgentOrchestrationExplicitStartView | null>;
	/** The status poll (`sessions-routes.ts`'s freshness re-check while the projection promise waits). */
	findExplicitStartById(startId: string): Promise<AgentOrchestrationExplicitStartView | null>;
	/** `listPendingIntentsByKind` — the B‴ coherence trigger's outstanding-work reader. */
	listPendingIntentsByKind(
		kind: AgentOrchestrationWorkIntentKind,
	): Promise<ReadonlyArray<{ readonly id: string; readonly sourceId: string }>>;
}

/** One run actually stopped by `runs.stopForTasks` — mirrors `StoppedRun`. */
export interface AgentOrchestrationStoppedRun {
	readonly taskId: string;
	readonly sessionId: string;
}

export interface AgentOrchestrationCreateBareRunRequest {
	readonly agentId: string;
	readonly taskId: string;
	readonly modelTier: string;
}

/**
 * The "request-about-request" family (§3.2 `runs.*`) — the lifecycle verbs
 * §2.3 converts to API. Each op returns the same domain result codes the
 * direct function returns today, so no call site's branching semantics
 * change (architecture.md §3 clause 5). **No generic `requestTermination`
 * op**: no wave-A call site drives a termination-by-reason request through
 * core-api — `sessions.ts`'s PATCH route (the one real caller of
 * `transitionRun`'s `request-termination` intent) is already in-layer for
 * agent-orchestration, and the composition-relocated drain
 * (`run-orchestration-composition.ts:190`) is wave-B territory. Building an
 * unconsumed op here would be exactly the "no production export that only
 * tests consume" violation the plan forbids — add it when a real caller
 * needs it, not speculatively.
 */
export interface AgentOrchestrationRunsPort {
	stopForTasks(
		taskIds: readonly string[],
		reason: "bet_killed",
	): Promise<ReadonlyArray<AgentOrchestrationStoppedRun>>;
	endForHandoff(sessionId: string, endedAt: string): Promise<void>;
	createBareRun(
		input: AgentOrchestrationCreateBareRunRequest,
	): Promise<AgentOrchestrationSessionWireRow>;
	/** In-process registry abort — never crosses the seam itself (§2.1a); exposed here so a caller need not reach `sessionRunRegistry` directly. */
	abort(sessionId: string): Promise<void>;
	/** `session_start`'s admission-failure reaction — the one non-`request`-target transition core drives (`agent-run-admission-reactions.ts`). */
	failExplicitStart(startId: string, failureCode: string): Promise<void>;
}

/** Mirrors `AgentRunConfig` (`@hyperidle/agent-run-config`). */
export interface AgentOrchestrationRunConfigView {
	readonly systemPrompt: string | null;
	readonly harnessType: string | null;
	readonly modelTierPreference: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
}

/** Mirrors `AgentRunConfigPatch` — a present key is written (incl. explicit `null`); an absent key is left alone. */
export type AgentOrchestrationRunConfigPatch = {
	-readonly [K in keyof AgentOrchestrationRunConfigView]?: AgentOrchestrationRunConfigView[K];
};

/** §2.2 — the persistence spelling for `agent_run_config`; admin routes stay core-hosted, only the store access crosses the seam. */
export interface AgentOrchestrationRunConfigPort {
	read(agentId: string): Promise<AgentOrchestrationRunConfigView>;
	readBatch(agentIds: readonly string[]): Promise<ReadonlyMap<string, AgentOrchestrationRunConfigView>>;
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
