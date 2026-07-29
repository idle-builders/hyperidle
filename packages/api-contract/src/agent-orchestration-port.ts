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
 * The `sessions` capability family (Decision D) — per-session cost (the real
 * gap `tasks.ts`'s hardcoded `cost: null` traces) + session/run history for a
 * given work source.
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
