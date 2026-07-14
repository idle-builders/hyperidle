/**
 * @lore AU19 Increment 2a: `@hyperidle/policy`'s `buildHandoff`/
 * `computeApprovalRate` need injected `work`/`conversation`/`users`/`org`/
 * `session-requests`/`cost`/`session-lifecycle` ports (Mechanism C —
 * `policy` never imports another Service). `handoff`/`computeApprovalRate`
 * each have multiple real call sites across `packages/server`
 * (`routes/tasks.ts`, `tools/handoff-to.ts`, `routes/agent-profile.ts`) — this
 * module builds each bound singleton ONCE, at the composition root, so every
 * call site imports the already-wired function unchanged (same
 * factory-curry idiom as `@hyperidle/review`'s `buildCreateReviewItemForKnowledge`,
 * Increment 1j).
 *
 * @lore AU19 Increment 3b: `session-requests` is now a real Service package
 * — `record`/`findBySessionId`/`abort` all repoint to its real exports
 * (`recordAgentWorkIntent`/`findAgentSessionRequestBySessionId`/
 * `sessionRunRegistry.abort`, mechanical, zero behavior change). This stays
 * a plain DI port rather than the §10.3-default EventBus inversion — see
 * `@hyperidle/policy`'s `ports.ts` top `@lore` for why (synchronous
 * read-then-branch: `findBySessionId` decides whether to call
 * `sessionLifecycle.requestTermination` in the same code path, both inside
 * `buildHandoff`'s transaction). `session-lifecycle` stays wired to its
 * still-flat `packages/server` implementation — that Service has not
 * migrated yet.
 *
 * @lore AU19 Increment 3g: `cost` — `HandoffDeps.cost`/`PolicyCostDedupReleaser`
 * REMOVED. `handoff-protocol.ts` now emits `session_handoff_completed` on the
 * `EventBus` instead of calling a DI port directly (§10.3 against-grain
 * inversion — see `@hyperidle/policy`'s `ports.ts` top `@lore`); no wiring
 * needed here anymore.
 */

import {
	insertMessage,
	insertThread,
	listInitiatedVerdictMessages,
	listVerdictMessagesByItemIds,
} from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { getTeamMembersByTeamId } from "@hyperidle/org";
import type {
	ApprovalRateDeps,
	HandoffDeps,
	HandoffParams,
	HandoffResult,
} from "@hyperidle/policy";
import { buildHandoff, computeApprovalRate as policyComputeApprovalRate } from "@hyperidle/policy";
import {
	findAgentSessionRequestBySessionId,
	recordAgentWorkIntent,
	sessionRunRegistry,
} from "@hyperidle/session-requests";
import type { EventBus } from "@hyperidle/shared";
import { findActiveTeammateByRole, getUserById } from "@hyperidle/users";
import { createItem, getTaskById, listItemIdsBySourceAgent, updateTaskById } from "@hyperidle/work";
import { requestAgentTermination } from "./session-lifecycle.js";

const handoffDeps: HandoffDeps = {
	work: { getTaskById, updateTaskById, createItem },
	conversation: { insertMessage, insertThread },
	users: { getUserById, findActiveTeammateByRole },
	org: { getByTeamId: getTeamMembersByTeamId },
	sessionRequests: {
		record: recordAgentWorkIntent,
		findBySessionId: findAgentSessionRequestBySessionId,
		abort: sessionRunRegistry.abort,
	},
	sessionLifecycle: { requestTermination: requestAgentTermination },
};

/** Production-wired `handoff` — every real call site imports this, not `@hyperidle/policy` directly. */
export const handoff: (
	db: HyperIdleDb,
	eventBus: EventBus,
	params: HandoffParams,
) => Promise<HandoffResult> = buildHandoff(handoffDeps);

const approvalRateDeps: ApprovalRateDeps = {
	work: { listItemIdsBySourceAgent },
	conversation: { listInitiatedVerdictMessages, listVerdictMessagesByItemIds },
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
