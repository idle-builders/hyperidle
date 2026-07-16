/**
 * `lifecycle-projection` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's per-source
 * summary (`lifecycle-projection` — 2 distinct edges / 2 call sites at
 * original census time).
 *
 * @lore AU19 Increment 3d: `agent-lifecycle-projectors.ts`'s
 * `AGENT_LIFECYCLE_PROJECTORS` registry has THREE real outbound edges, not
 * two:
 *  1. `lifecycle-projection → routine` (`projectRoutine` →
 *     `updateRoutineRunIfRunning`) — architecture §10.2 line 446, ORDINARY
 *     downward/same-layer DI (both agent-orchestration/core-api,
 *     `lifecycle-projection` reaching down to `routine` is legal).
 *  2. `lifecycle-projection → work` (`projectDecomposition` →
 *     `updateBetDecompositionStatusIfRunning`) — §10.2 line 447, ORDINARY
 *     downward DI, same shape as #1.
 *  3. `lifecycle-projection → session-requests` (`projectExplicitStart` →
 *     an update of `explicit_session_starts`, `TABLE_OWNER`'d to
 *     `session-requests` since Increment 3b) — a genuinely NEW edge the
 *     original census missed entirely (at census time this was an inline
 *     `packages/server` raw table write, not a countable relative-import
 *     Service→Service call — same "Table ACL is what surfaces it, on
 *     migrating for real" shape as `retention`'s Increment-2g census
 *     corrections). ORDINARY same-layer DI (`lifecycle-projection` and
 *     `session-requests` are both agent-orchestration — sibling Services,
 *     neither above the other, so this is a plain Mechanism-C port in each
 *     direction, not an against-grain §10.3 inversion). Appended to §10.2 as
 *     its own row by this migration (see architecture.md's own edit).
 *
 * All three ports carry a `WriteExecutor` (not just `HyperIdleDb`) because
 * `projectTask` wraps the `taskDispatchAttempts` update (an
 * `UNOWNED_SHARED_TABLES` table, legally read/written by any package
 * directly — unrelated to this file's DI surface) and the
 * `session-requests`-owned `explicit_session_starts` projection in the SAME
 * transaction — an ordinary same-layer DI port can carry the caller's `tx`
 * exactly like `context-assembly`'s `KnowledgeReader` example (§7.3); this is
 * not an against-grain edge, so the §10.3 atomicity-carve-out machinery does
 * not apply here — same-transaction DI is simply the normal case for a
 * downward/same-layer port.
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types) rather than imported from the target package — a Service NEVER
 * imports another Service, even for a type-only reference (§7.3).
 *
 * This migration ALSO resolves the reverse-direction interim port built at
 * Increment 3b: `@hyperidle/session-requests`'s `ports.ts`
 * (`SessionRequestsLifecycleInboxWriter`/`Reaper`) forward-referenced this
 * not-yet-migrated Service — `packages/server`'s
 * `session-requests-bindings.ts` is repointed by this same commit from raw
 * `agentLifecycleInbox` table ops to this package's real exported
 * `insertLifecycleInboxFactIfAbsent`/`listProjectedLifecycleInboxBefore`/
 * `deleteLifecycleInboxByRequestIds` (see `agent-lifecycle-inbox.ts`) — a
 * NEW `session-requests → lifecycle-projection` edge, also appended to
 * §10.2.
 */

import type { WriteExecutor } from "@hyperidle/db";

/** Port for `projectRoutine`'s `routine_runs` terminal-outcome projection. */
export interface LifecycleProjectionRoutineWriter {
	updateRoutineRunIfRunning(
		exec: WriteExecutor,
		id: string,
		patch: {
			readonly outcome: "success" | "error";
			readonly endedAt: string;
			readonly sessionId: string | null;
			readonly errorMessage: string | null;
		},
	): Promise<void>;
}

/** Port for `projectDecomposition`'s `bets.decomposition_status` terminal-outcome projection. */
export interface LifecycleProjectionWorkWriter {
	updateBetDecompositionStatusIfRunning(
		exec: WriteExecutor,
		id: string,
		patch: {
			readonly decompositionStatus: "done" | "blocked";
			readonly decompositionBlockerReason: string | null;
		},
	): Promise<void>;
}

/** Port for `projectExplicitStart`'s `explicit_session_starts` terminal-outcome projection. */
export interface LifecycleProjectionExplicitSessionStartWriter {
	projectTerminalState(
		exec: WriteExecutor,
		requestId: string,
		patch: {
			readonly status: "completed" | "failed" | "cancelled";
			readonly sessionId: string | null;
			readonly failureCode: string | null;
		},
	): Promise<void>;
}

/** Deps `drainAgentLifecycleInbox`/`AGENT_LIFECYCLE_PROJECTORS` need — every real outbound edge. */
export interface AgentLifecycleProjectionDeps {
	readonly routine: LifecycleProjectionRoutineWriter;
	readonly work: LifecycleProjectionWorkWriter;
	readonly explicitSessionStarts: LifecycleProjectionExplicitSessionStartWriter;
}
