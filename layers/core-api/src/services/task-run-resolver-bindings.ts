/**
 * AU21 §9 Increment 12 (Decision H3), Wave C — the ONE shared,
 * fully-wired `TaskRunResolverDeps` every real `task_run`-baking composition
 * site (`run-orchestration-composition.ts`'s `workAccessor.transitionTask`,
 * `policy-bindings.ts`'s `handoffDeps.taskRunResolver`, and the three direct
 * `resolveTaskRunRequest`/`transitionTask` callers in `routes/tasks.ts`,
 * `routes/bets.ts`, `app.ts`'s dependency-watcher) imports instead of each
 * separately constructing `{ requireRunnableAgent }` — the same
 * factory-curry idiom `policy-bindings.ts`'s pre-bound `handoff` already
 * uses. Centralizing the wiring here means `getTeamById`/
 * `assembleSessionKnowledge` (Decision H3's contextBundle bake) reach every
 * real `task_run` emit site from ONE place, instead of five independently
 * drifting copies.
 */
import { assembleSessionKnowledge, getAgentIdentity } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { readServerConfig } from "@hyperidle/settings";
import type { TaskRunResolverDeps } from "@hyperidle/task";
import { requireRunnableAgent } from "@hyperidle/users";

// AU31 §7.2 (R2): each dependency is a wrapping arrow, never the raw service
// symbol — a bag of arrows over the layer's own services IS a face's
// sanctioned content; the raw symbol itself must never be the thing that
// escapes through an exported binding.
export const taskRunResolverDeps: TaskRunResolverDeps = {
	requireRunnableAgent: (db, agentId) => requireRunnableAgent(db, agentId),
	// The agent's identity document. It was missing here while the port was
	// optional, so every real `task_run` baked an empty identity.
	getAgentIdentity: (db, agentId) => getAgentIdentity(db, agentId),
	getTeamById: (db, id) => getTeam(db, { id }),
	assembleSessionKnowledge: (...args: Parameters<typeof assembleSessionKnowledge>) =>
		assembleSessionKnowledge(...args),
	readServerConfig: (...args: Parameters<typeof readServerConfig>) => readServerConfig(...args),
	// `task-run-resolver.ts` bakes `callingThreadId` straight from
	// `task.threadId`, a real column.
};
