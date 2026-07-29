/**
 * AU21 — `AgentOrchestrationPort`: agent-orchestration's own read door
 * (architecture.md §6 Decision D, §9 Increment 6, §10), symmetric in shape to
 * `CoreApiPort` (Decision A/C, Increment 1) but the OPPOSITE direction: it
 * serves what agent-orchestration genuinely owns — per-session cost +
 * session/run history — to core-ui/core-api, never the reverse. There is no
 * cost "mirror" to delete (§6 Decision D's full trace); this is the first
 * time per-session cost is served anywhere.
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
 * method mutates core-api or agent-orchestration state — the write-gate (the
 * cost cap) stays entirely core-side/orchestration-side, untouched by this
 * door.
 */

/** One session/run-history entry — mirrors the backing route's per-row shape. */
export interface AgentOrchestrationSessionHistoryEntry {
	readonly id: string;
	readonly sessionId: string | null;
	readonly status: string;
	readonly costCents: number | null;
}

/**
 * One session-activity entry — a hand-typed, structural mirror of
 * `@hyperidle/shared`'s `ActivityEntry` discriminated union (AM3). `api-
 * contract` stays zero-runtime-deps (header note above), so this is a
 * deliberate type-only duplication, not an import — same idiom as
 * `AgentOrchestrationSessionHistoryEntry`. `data`'s shape varies by `type`
 * (`tool_call`/`reasoning`/`cost_tick`/…); callers that need the narrowed
 * shape reconstruct it the same way `useSessionActivity.ts` already does
 * for the WS/REST wire format (this door serves the identical JSON shape).
 */
export interface AgentOrchestrationSessionActivityEntry {
	readonly type: string;
	readonly timestamp: number;
	readonly data: unknown;
}

/**
 * The `sessions` capability family (Decision D/E) — per-session cost (the
 * real gap `tasks.ts`'s hardcoded `cost: null` traces) + session/run history
 * for a given work source + the relocated session-activity stream (§9
 * Increment 7: `agent-execution` owns the buffer, this door gateways it).
 */
export interface AgentOrchestrationSessionsPort {
	/**
	 * Three-way contract (mirrors `getSessionCostBySessionId`'s own):
	 * a costed session → its `costCents`; a known but not-yet-costed session
	 * → `null`; an unknown `sessionId` → `undefined`.
	 */
	getSessionCostBySessionId(sessionId: string): Promise<number | null | undefined>;
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
