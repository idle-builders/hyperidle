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
 * — `record`/`abort` repoint to its real exports (`recordAgentWorkIntent`/
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
 */

import { insertMessage, insertThread, listMessages } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { getTeamMembers } from "@hyperidle/org";
import type { HandoffParams, HandoffResult } from "@hyperidle/policy";
import { buildHandoff, computeApprovalRate as policyComputeApprovalRate } from "@hyperidle/policy";
import { recordAgentWorkIntent, sessionRunRegistry } from "@hyperidle/session-requests";
import type { EventBus } from "@hyperidle/shared";
import { findUser } from "@hyperidle/users";
import { createItem, getTaskById, listItemIdsBySourceAgent, updateTaskById } from "@hyperidle/work";

const handoffDeps = {
	work: { getTaskById, updateTaskById, createItem },
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
		record: recordAgentWorkIntent,
		abort: sessionRunRegistry.abort,
	},
};

/** Production-wired `handoff` — every real call site imports this, not `@hyperidle/policy` directly. */
export const handoff: (
	db: HyperIdleDb,
	eventBus: EventBus,
	params: HandoffParams,
) => Promise<HandoffResult> = buildHandoff(handoffDeps);

const approvalRateDeps = {
	work: { listItemIdsBySourceAgent },
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
