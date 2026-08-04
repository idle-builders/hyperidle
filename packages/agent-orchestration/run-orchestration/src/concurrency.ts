/**
 * AU21 §6 Decision F1 fold — `isAtCapacity`'s underlying query
 * (active-session count vs `maxConcurrentSessions`, fail-closed on a
 * missing agent) folds into `run-orchestration`, the Service that already
 * owns the provision-time concurrency gate (`provisioner.ts`'s `admitSession`
 * Phase 3). This is the ONE canonical implementation `routine`'s delegation
 * decision (`@hyperidle/routine`'s `agent-delegation.ts`) is injected —
 * reproducing the retired `agent-selection` Service's exact fail-closed
 * semantics for a probed agent id.
 *
 * `admitSession`'s own Phase 3 gate is a materially different check (it also
 * excludes the current request's own already-reserved session so a
 * request-mediated admission doesn't self-block against its own limit — see
 * `provisioner.ts`'s `@lore AU9`) and is left untouched by this fold: forcing
 * that extra degree of freedom onto this simple function would either drop
 * the exclusion (a real behavior change) or complicate the "one canonical
 * simple check" this module's own callers need. Flagged for review rather
 * than silently diverging.
 *
 * @lore CONFUSION (flagged for reviewer): the RED-phase test this module was
 * built against originally called `isAgentAtCapacity(db, agentId)` with no
 * third argument, reading the `users` table directly. That violates Table
 * ACL (Mechanism A) — `users` is owned by `packages/core-api/users`, and
 * `run-orchestration` (agent-orchestration layer) may only reach it through
 * an injected reader, exactly like `provisioner.ts`'s own
 * `SessionLifecycleUserReader` (`ports.users.getUserById`) already does. This
 * function follows that SAME established pattern — a required `deps.getUserById`
 * reader — rather than importing the `users` table directly. The RED test
 * was adjusted in-flight to inject a reader (test files are ACL-exempt); its
 * behavioral assertions are unchanged.
 */

import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Resolves an agent's concurrency bound, or `undefined` when the agent does not
 * exist at all.
 *
 * @lore AU26 G1 (architecture §D-L): `maxConcurrentSessions` moved off `users`
 * into `agent_run_config`, so this reader is now composed at the wiring site
 * from TWO reads: does the `users` row exist (existence — a core question), and
 * what is its run config (a run-config question). Both halves matter and
 * neither substitutes for the other: a never-configured agent has no
 * `agent_run_config` row but is a perfectly real agent with the default bound
 * of 1, while a nonexistent agent must still fail CLOSED. Collapsing this to a
 * bare run-config read would silently turn "agent does not exist" into "agent
 * has capacity 1".
 */
export interface ConcurrencyBoundReader {
	getConcurrencyBound(
		db: HyperIdleDb,
		agentId: string,
	): Promise<{ readonly maxConcurrentSessions: number } | undefined>;
}

/** True (fail-closed) when the agent does not exist, or is at/over its `maxConcurrentSessions` limit. */
export async function isAgentAtCapacity(
	db: HyperIdleDb,
	agentId: string,
	deps: ConcurrencyBoundReader,
): Promise<boolean> {
	const agent = await deps.getConcurrencyBound(db, agentId);
	if (!agent) return true;
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, agentId), eq(sessions.state, "active")))
		.limit(1);
	return (row?.count ?? 0) >= agent.maxConcurrentSessions;
}
