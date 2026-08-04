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
 * STRICTLY READ-ONLY (§12): every method here reads display data only. No
 * method mutates core-api or agent-orchestration state.
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
 * @lore AU26 B1a (§D-H #16, AC5(d)): this is deliberately NOT a narrowing.
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
	 * session through (§D-H #16) — a read, so it goes through the Port; the
	 * Port stays strictly read-only.
	 */
	getById(sessionId: string): Promise<AgentOrchestrationSessionWireRow | null>;
}

/**
 * `AgentOrchestrationPort` — agent-orchestration's own read door, symmetric to
 * `CoreApiPort` (architecture.md §10, §6 Decision D).
 */
export interface AgentOrchestrationPort {
	readonly sessions: AgentOrchestrationSessionsPort;
}

/**
 * The seam's injectable transport — identical shape to `CoreApiTransport`
 * (single-`Request` fetch-handler, `===` Hono's own `app.fetch` signature),
 * so `buildAgentOrchestrationPort` supports the same in-process/network
 * transport duality (architecture.md §10).
 */
export type AgentOrchestrationTransport = (req: Request) => Promise<Response>;
