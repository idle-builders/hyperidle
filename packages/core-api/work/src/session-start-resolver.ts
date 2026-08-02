/**
 * AU21 §6 Decision B placement ruling — the `session_start` emit-time
 * resolver, paired with its real emit site (`routes/sessions-routes.ts:392`).
 * Does what `resolveIntentInputInternal`'s "session_start" case did at drain
 * time (`session-requests/src/service.ts:731-751`) — MINUS the
 * `explicitSessionStarts.status !== "requested"` re-check, which this
 * resolver's placement deliberately drops.
 *
 * @lore CONFUSION (flagged for reviewer, mirrors the RED-phase test file's own
 * note): a literal re-read-by-id mirror of the drain's case (the pattern
 * `resolveAssistantTurnRequest` uses) would force this resolver — which lives
 * in `packages/core-api/work/src/` per Decision B's placement table — to read
 * `explicitSessionStarts`, a table `session-requests` owns per
 * `table-ownership-guard.ts`'s `TABLE_OWNER` map. `work` reading a foreign
 * table would violate Table ACL (Mechanism A). The old drain-time re-check of
 * `explicitSessionStarts.status` existed to guard against staleness between
 * "intent created" and "a LATER drain pass runs" — a window that does not
 * exist at emit time: the real caller (`routes/sessions-routes.ts`) has just
 * inserted the `explicitSessionStarts` row, in the SAME transaction, with
 * `status: "requested"` by construction, and calls this resolver immediately
 * after with the values it already holds in hand (`taskId`,
 * `requestedAgentId`). So this resolver takes those two values directly
 * instead of a `startId`, and validates only what genuinely needs a domain
 * read this resolver is allowed to make: task existence (`work`'s own table)
 * plus the shared ast-`<userId>` runnability invariant.
 *
 * @lore Mechanism C: `requireRunnableAgent` (`@hyperidle/users`) is injected,
 * not statically imported — same shape as `assistant-turn-resolver.ts`'s
 * `AssistantTurnResolverDeps`. The real emit site wires the real
 * `requireRunnableAgent` in (Layer-level composition, not a nested Service).
 */

import type { HyperIdleDb, User } from "@hyperidle/db";
import type { BakedAgentRunnableConfig, BakedFilesystemForProvisioning } from "@hyperidle/shared";
import { bakeAgentRunnableConfig } from "@hyperidle/shared";
import * as work from "./work-service.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface SessionStartResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — optional: `@hyperidle/settings`'s
	 * `readServerConfig`, injected (Mechanism C — `@hyperidle/work` cannot
	 * import `@hyperidle/settings` directly) for the `harnessDisabled` bake.
	 * Absent at a call site not yet wired — the resolver bakes no
	 * `harnessDisabled` (matches `admitSession`'s "absent = nothing disabled"
	 * degrade).
	 */
	readServerConfig?(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — optional:
	 * `@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`, injected
	 * (Mechanism C — `@hyperidle/work` cannot import `@hyperidle/filesystems`
	 * directly) for the `injectedFilesystems` bake. Absent at a call site not
	 * yet wired — the resolver bakes no `injectedFilesystems`.
	 */
	resolveInjectedFilesystemsForAgent?(
		db: HyperIdleDb,
		agentId: string,
	): Promise<readonly BakedFilesystemForProvisioning[]>;
}

/** Thrown when the session-start's target task does not exist. */
export class SessionStartSourceUnavailableError extends Error {}

/** The baked `session_start` request shape, matching `resolveIntentInputInternal`'s current return. */
export interface BakedSessionStartRequest {
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
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
	 * runnable-config snapshot, baked from the SAME already-`requireRunnableAgent`
	 * -validated `agent: User` row (previously discarded — this resolver only
	 * awaited the call for its throw-on-unrunnable side effect; the return
	 * value is now captured too, no second read).
	 */
	readonly agentConfig: BakedAgentRunnableConfig;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the server's
	 * disabled-harness-types list. Present only when `deps.readServerConfig`
	 * was supplied.
	 */
	readonly harnessDisabled?: readonly string[];
	/**
	 * AU21 §9 Increment 12 follow-up (F2 gap closure) — the target agent's
	 * injected-filesystems list. Present only when
	 * `deps.resolveInjectedFilesystemsForAgent` was supplied.
	 */
	readonly injectedFilesystems?: readonly BakedFilesystemForProvisioning[];
}

/**
 * Resolve + validate a `session_start` run at emit time: validate the
 * requested agent's runnability (never the human sender), load the target
 * task, reject if unavailable, and bake the full request.
 */
export async function resolveSessionStartRequest(
	db: HyperIdleDb,
	input: { readonly taskId: string; readonly requestedAgentId: string },
	deps: SessionStartResolverDeps,
): Promise<BakedSessionStartRequest> {
	const agent = await deps.requireRunnableAgent(db, input.requestedAgentId);
	const task = await work.get(db, "task", input.taskId);
	if (!task) {
		throw new SessionStartSourceUnavailableError("Explicit session task is unavailable");
	}
	const harnessDisabled = deps.readServerConfig
		? (await deps.readServerConfig(db)).harnessDisabled
		: undefined;
	const injectedFilesystems = deps.resolveInjectedFilesystemsForAgent
		? await deps.resolveInjectedFilesystemsForAgent(db, input.requestedAgentId)
		: undefined;
	return {
		defaultAgentId: input.requestedAgentId,
		sourceKind: "task",
		sourceId: task.id,
		streamId: `task:${task.id}`,
		taskId: task.id,
		teamId: task.teamId,
		sourceCorrelation: { taskId: task.id, teamId: task.teamId },
		agentConfig: bakeAgentRunnableConfig(agent),
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
		...(injectedFilesystems !== undefined ? { injectedFilesystems } : {}),
	};
}
