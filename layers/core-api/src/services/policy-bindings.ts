/**
 * @lore AU19 Increment 2a: `@hyperidle/policy`'s `buildHandoff`/
 * `computeApprovalRate` need injected `work`/`conversation`/`users`/`org`/
 * `session-requests` ports (Mechanism C — `policy` never imports another
 * Service). `handoff`/`computeApprovalRate` each have multiple real call
 * sites across `packages/server` (`routes/tasks.ts`, `tools/handoff-to.ts`,
 * `routes/agent-profile.ts`) — this module builds each bound singleton ONCE,
 * at the composition root, so every call site imports the already-wired
 * function unchanged (same factory-curry idiom as `@hyperidle/review`'s
 * `buildCreateReviewItemForKnowledge`, Increment 1j).
 *
 * @lore AU19 Increment 3b: `session-requests` is now a real Service package
 * — `record`/`abort` repoint to its real exports (`enqueueWorkIntent`/
 * `sessionRunRegistry.abort`, mechanical, zero behavior change). This stays
 * a plain DI port rather than the §10.3-default EventBus inversion — see
 * `@hyperidle/policy`'s `ports.ts` top `@lore` for why (`composeTailoredGrant`-
 * style same-transaction write, ruled permanent).
 *
 * @lore AU19 Increment 3g: `cost` — `HandoffDeps.cost`/`PolicyCostDedupReleaser`
 * REMOVED. `handoff-protocol.ts` now emits `session_handoff_completed` on the
 * `EventBus` instead of calling a DI port directly (§10.3 against-grain
 * inversion — see `@hyperidle/policy`'s `ports.ts` top `@lore`); no wiring
 * needed here anymore.
 *
 * @lore AU19 Increment 3i: `session-lifecycle` — `HandoffDeps.sessionLifecycle`/
 * `PolicySessionTerminationRequester`/`findBySessionId` REMOVED. The
 * `policy ⚠ session-lifecycle` against-grain edge (`requestTermination`)
 * inverted to the `session_handoff_completed` EventBus subscription
 * `session-lifecycle-bindings.ts`'s `registerHandoffTerminationRequester`
 * now owns — see `handoff-protocol.ts`'s inline `@lore` at the emission site.
 *
 * @lore AU31 §3.1/§3.2: `sessionRequests`/`runOrchestration` are now
 * seam-backed (`AgentOrchestrationPort`), not direct
 * `@hyperidle/session-requests`/`@hyperidle/run-orchestration` imports —
 * supersedes AU26 H1's "a plain downward call, NOT an `AgentOrchestrationPort`
 * method (that door stays read-only)" (architecture.md §13 item 2: one door,
 * both directions now). The port is a per-composition value, so `handoffDeps`
 * can no longer be a module-level constant — `buildHandoffDeps(port)` is the
 * factory, and `handoff`'s production binding is `buildProductionHandoff(port)`.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { insertMessage, insertThread, listMessages } from "@hyperidle/conversation";
import type { HyperIdleDb, NewItem, NewTask, WriteExecutor } from "@hyperidle/db";
import { getTeamMembers } from "@hyperidle/org";
import type { HandoffParams, HandoffResult } from "@hyperidle/policy";
import { buildHandoff, computeApprovalRate as policyComputeApprovalRate } from "@hyperidle/policy";
import type { EventBus } from "@hyperidle/shared";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveTaskRunRequest } from "@hyperidle/work";
import { taskRunResolverDeps } from "./task-run-resolver-bindings.js";

function buildHandoffDeps(port: AgentOrchestrationPort) {
	return {
		work: {
			getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
			updateTaskById: (exec: WriteExecutor, id: string, patch: Partial<NewTask>) =>
				work.update(exec, "task", id, patch),
			claimTaskHandoff: (
				exec: WriteExecutor,
				{
					taskId,
					expectedUpdatedAt,
					claimedAt,
				}: { taskId: string; expectedUpdatedAt: string; claimedAt: string },
			) =>
				work.transition(exec, "task", {
					id: taskId,
					guard: { field: "updatedAt", equals: expectedUpdatedAt },
					patch: { updatedAt: claimedAt },
				}),
			createItem: (exec: WriteExecutor, values: NewItem) => work.create(exec, "item", values),
			insertDispatchAttempt: (
				exec: WriteExecutor,
				input: {
					readonly taskId: string;
					readonly occasion: string;
					readonly agentId: string;
					readonly predecessorSessionId: string;
					readonly now: string;
				},
			) => work.taskDispatchAttemptStore.insertAttempt(exec, input),
		},
		conversation: { insertMessage, insertThread },
		users: {
			getUserById: (db: WriteExecutor, id: string) => findUser(db, { id }),
			findActiveTeammateByRole: (
				db: WriteExecutor,
				role: string,
				teamMembersIds: string[],
				excludeId: string,
			) => findUser(db, { role, teamIds: teamMembersIds, status: "active", excludeId }),
		},
		org: { getByTeamId: (db: WriteExecutor, teamId: string) => getTeamMembers(db, { teamId }) },
		sessionRequests: {
			record: (
				_exec: WriteExecutor,
				input: {
					readonly kind: "task_run";
					readonly sourceKind: string;
					readonly sourceId: string;
					readonly requestedBy?: string;
					readonly idempotencyKey: string;
					readonly bakedRequest?: import("@hyperidle/shared").BakedWorkIntentRequest;
				},
			) => port.intents.submit(input),
			// AU31 §2.1a: `sessionRunRegistry.abort` never crosses the seam
			// itself — it is an implementation detail of `runs.abort`'s handler,
			// executed orchestration-side. Nothing here reads the boolean
			// `sessionRunRegistry.abort` used to return (handoff-protocol.ts
			// discards it), so the seam's `void`-returning op is a faithful swap.
			abort: async (sessionId: string) => {
				await port.runs.abort(sessionId);
				return true;
			},
		},
		// AU21 §6 Decision B / Increment 3: `task_run`'s emit-time resolver,
		// pre-bound with the real `requireRunnableAgent` — `policy` cannot import
		// `@hyperidle/work` directly (Mechanism C), so this composition root
		// (which already imports `@hyperidle/work` for `handoffDeps.work`) wires
		// the concrete resolver in.
		taskRunResolver: {
			resolve: (exec: WriteExecutor, attemptId: string) =>
				resolveTaskRunRequest(exec as HyperIdleDb, attemptId, taskRunResolverDeps),
		},
		// AU31 §3.1 site 7 / §13 item 2: seam-backed, superseding AU26 H1's
		// "a plain downward call, NOT an `AgentOrchestrationPort` method (that
		// door stays read-only)" — the port is now core's one door, both
		// directions. Called BEFORE the handoff's transaction (see
		// `ports.ts`'s `runOrchestration` @lore for why this site reorders).
		runOrchestration: {
			endRunForHandoff: (_exec: WriteExecutor, sessionId: string, endedAt: string) =>
				port.runs.endForHandoff(sessionId, endedAt),
		},
	};
}

/** Production-wired `handoff` factory — every real call site builds one from the composition's port. */
export function buildProductionHandoff(
	port: AgentOrchestrationPort,
): (db: HyperIdleDb, eventBus: EventBus, params: HandoffParams) => Promise<HandoffResult> {
	return buildHandoff(buildHandoffDeps(port));
}

const approvalRateDeps = {
	work: {
		listItemIdsBySourceAgent: async (exec: WriteExecutor, agentId: string) => {
			const rows = await work.list(exec, "item", { sourceAgentId: agentId });
			return rows.map((r) => r.id);
		},
	},
	conversation: {
		listInitiatedVerdictMessages: (db: HyperIdleDb, initiatorId: string, windowStart: string) =>
			listMessages(db, {
				threadInitiatorId: initiatorId,
				types: ["verdict"],
				since: windowStart,
				noLegacyItem: true,
			}),
		listVerdictMessagesByItemIds: (db: HyperIdleDb, itemIds: string[], windowStart: string) =>
			listMessages(db, { legacyItemIds: itemIds, types: ["verdict"], since: windowStart }),
	},
};

/** Production-wired `computeApprovalRate` — every real call site imports this. */
export function computeApprovalRate(
	db: HyperIdleDb,
	agentId: string,
	windowDays: number,
	recentLimit?: number,
): ReturnType<typeof policyComputeApprovalRate> {
	return policyComputeApprovalRate(db, agentId, windowDays, approvalRateDeps, recentLimit);
}
