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
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { readServerConfig } from "@hyperidle/settings";
import { requireRunnableAgent } from "@hyperidle/users";
import type { TaskRunResolverDeps } from "@hyperidle/work";

export const taskRunResolverDeps: TaskRunResolverDeps = {
	requireRunnableAgent,
	getTeamById: (db, id) => getTeam(db, { id }),
	assembleSessionKnowledge,
	readServerConfig,
};
