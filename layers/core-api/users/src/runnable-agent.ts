/**
 * AU21 §6 Decision B placement ruling — the ONE truly cross-cutting piece of
 * the drain's per-kind resolution: the ast-`<userId>` runnability invariant
 * (`session-requests/src/service.ts:700-705`'s `requireRunnableActor`,
 * identical in every branch, reads only `users`). Every family's emit-time
 * resolver (built in later Increment 3 waves) imports THIS shared helper via
 * ordinary same-layer core-api DI instead of re-implementing the
 * `kind==="ai"` + `active`/`idle` check inline — the one piece that genuinely
 * is shared, because it is one cross-domain invariant (never trust the human
 * sender as the agent), not five domain-specific resolutions.
 *
 * @lore this is a NEW copy, not a relocation: `session-requests`'s own
 * `requireRunnableActor` stays in place unchanged for now — the drain still
 * needs it for the one remaining unmigrated case (`routine_run`, deliberately
 * left alone through the end of Increment 3 per the placement ruling). Once
 * `routine_run`'s resolver moves core-side (Increment 4), that internal copy
 * becomes dead and can be deleted in favor of this one.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { findUser } from "./user-store.js";

/** Thrown when the resolved user is not a runnable AI agent. */
export class AgentNotRunnableError extends Error {}

const RUNNABLE_STATUSES: ReadonlySet<string> = new Set(["active", "idle"]);

/**
 * Reload the real `users` row for `agentId` and validate it is a runnable AI
 * agent (`kind==="ai"` and `status` in `active`/`idle`) — never the human
 * sender. Throws `AgentNotRunnableError` if the id does not resolve to a
 * runnable agent.
 */
export async function requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User> {
	const agent = await findUser(db, { id: agentId });
	if (!agent || agent.kind !== "ai" || !RUNNABLE_STATUSES.has(agent.status)) {
		throw new AgentNotRunnableError(`Agent ${agentId} is not a runnable AI agent`);
	}
	return agent;
}
