/**
 * AU21 §6 Decision B placement ruling — the `task_run` emit-time resolver,
 * paired with its three real emit sites: `task-state-machine.ts`,
 * `bet-decomposition.ts` (same package, plain import) and
 * `packages/core-api/policy/src/handoff-protocol.ts` (a sibling package,
 * injected via `PolicyDeps` at the `policy-bindings.ts` composition root).
 * Does exactly what `resolveIntentInputInternal`'s "task_run" case does today
 * (`session-requests/src/service.ts:753-773`), reading only `work`'s own
 * tables (`taskDispatchAttempts`, `tasks`) plus the shared ast-`<userId>`
 * runnability invariant.
 *
 * @lore Mechanism C: `requireRunnableAgent` (`@hyperidle/users`) is injected,
 * not statically imported — same shape as `assistant-turn-resolver.ts`'s
 * `AssistantTurnResolverDeps` / `session-start-resolver.ts`'s
 * `SessionStartResolverDeps`. Return type is deliberately `Promise<unknown>`
 * (not `Promise<User>`) — this resolver only awaits the call for its
 * throw-on-unrunnable side effect and never reads the resolved value, so a
 * narrower same-package adapter (`bet-decomposition.ts`'s
 * `requireRunnableAgentViaUsersPort`, built from the already-injected
 * `UserStoreReader` port rather than a static `@hyperidle/users` import) can
 * satisfy this shape too.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import * as work from "./work-service.js";
import { taskDispatchAttemptStore } from "./work-service.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface TaskRunResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<unknown>;
}

/** Thrown when the dispatch attempt or its task is unavailable / ineligible. */
export class TaskRunSourceUnavailableError extends Error {}

/** The baked `task_run` request shape, matching `resolveIntentInputInternal`'s current return. */
export interface BakedTaskRunRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "task";
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId: string;
	readonly teamId: string;
	readonly sourceCorrelation: {
		readonly taskId: string;
		readonly teamId: string;
	};
}

/** Task states an agent-work dispatch attempt is eligible to launch against. */
const AGENT_WORK_ELIGIBLE_TASK_STATES: ReadonlySet<string> = new Set([
	"ready",
	"accepted",
	"in_progress",
]);

/**
 * Resolve + validate a `task_run` run at emit time: load the dispatch
 * attempt (rejecting if missing or no longer `"requested"`), load its task
 * (rejecting if missing / not agent-work-eligible / reassigned to a
 * different owner since the attempt was created), validate the attempt's
 * agent's runnability, and bake the full request.
 */
export async function resolveTaskRunRequest(
	db: HyperIdleDb,
	attemptId: string,
	deps: TaskRunResolverDeps,
): Promise<BakedTaskRunRequest> {
	const attempt = await taskDispatchAttemptStore.get(db, attemptId);
	if (attempt?.status !== "requested") {
		throw new TaskRunSourceUnavailableError("Task dispatch attempt is unavailable");
	}
	const task = await work.get(db, "task", attempt.taskId);
	if (!(task && AGENT_WORK_ELIGIBLE_TASK_STATES.has(task.state))) {
		throw new TaskRunSourceUnavailableError("Task is not eligible for agent work");
	}
	if (task.ownerAgentId && task.ownerAgentId !== attempt.agentId) {
		throw new TaskRunSourceUnavailableError("Task owner changed after intent creation");
	}
	await deps.requireRunnableAgent(db, attempt.agentId);
	return {
		defaultAgentId: attempt.agentId,
		sourceKind: "task",
		sourceId: task.id,
		streamId: `task:${task.id}`,
		taskId: task.id,
		teamId: task.teamId,
		sourceCorrelation: { taskId: task.id, teamId: task.teamId },
	};
}
