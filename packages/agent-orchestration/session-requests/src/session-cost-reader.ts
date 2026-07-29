/**
 * AU21 §9 Increment 6, Wave 2 (Decision D) — the READ side of
 * agent-orchestration's own per-session-cost state.
 *
 * Wave 1's `session-cost-recorder.ts` writes `agentSessionRequests.costCents`
 * once, at `session_ended` (this Service's own table, this Service's own
 * write — no cross-layer edge). This module answers "what did session X
 * cost" from that same row, one query below the `AgentOrchestrationPort`
 * HTTP seam — `agent-orchestration-sessions-routes.ts` (core-api) calls this
 * function directly, the sanctioned against-grain `core-api →
 * agent-orchestration` DI read (architecture.md §1), matched by `sessionId`
 * exactly the way `findRequestSessionInternal` (`service.ts`) already
 * correlates a `session_ended` event back to its owning row.
 *
 * Three-way contract, matching `findSessionRequest(db, {by:"sessionId"})`'s
 * own `undefined`-for-unknown convention:
 *   - a row exists and `costCents` is set        → that number
 *   - a row exists and `costCents` is still null  → null (not costed yet)
 *   - no row references this `sessionId` at all   → undefined
 */

import { agentSessionRequests, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export async function getSessionCostBySessionId(
	db: HyperIdleDb,
	sessionId: string,
): Promise<number | null | undefined> {
	const [row] = await db
		.select({ costCents: agentSessionRequests.costCents })
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sessionId, sessionId))
		.limit(1);
	if (!row) return undefined;
	return row.costCents;
}
