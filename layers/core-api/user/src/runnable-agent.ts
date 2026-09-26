/**
 * Placement ruling — the ONE truly cross-cutting piece of
 * the drain's per-kind resolution: the ast-`<userId>` runnability invariant
 * (`session-requests/src/service.ts:700-705`'s `requireRunnableActor`,
 * identical in every branch, reads only `users`). Every family's emit-time
 * resolver (built in later Increment 3 waves) imports THIS shared helper via
 * ordinary same-layer core-api DI instead of re-implementing the
 * `kind==="ai"` + `active`/`idle` check inline — the one piece that genuinely
 * is shared, because it is one cross-domain invariant (never trust the human
 * sender as the agent), not five domain-specific resolutions.
 *
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import { findUser } from "./user-store.js";

/**
 * Thrown when the resolved user is not a runnable AI agent.
 *
 * @lore BA1 review N4: `.name` is set explicitly (not left as the inherited
 * `"Error"`) so a caller across a Mechanism C boundary — a package that
 * cannot import this class, only the `requireRunnableAgent` function
 * signature — can still tell "the resolved agent genuinely is not runnable"
 * apart from any other failure (e.g. a DB connection blip inside `findUser`)
 * by checking `error.name`, the same idiom the DOM's `AbortError` uses for
 * cross-boundary error identification without a class reference.
 */
export class AgentNotRunnableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentNotRunnableError";
	}
}

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
