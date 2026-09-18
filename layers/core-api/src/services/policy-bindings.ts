/**
 * §8 B4: `handoffDeps`/`buildProductionHandoff` are DELETED —
 * `handoff-protocol.ts` is gone (handoff is `edit_task({ ownerAgentId })`
 * now). What remains here is `computeApprovalRate`'s injected deps, which
 * never touched handoff at all.
 *
 * @lore AU19 Increment 2a: `@hyperidle/policy`'s `computeApprovalRate` needs
 * an injected `conversation` port (Mechanism C — `policy` never imports
 * another Service).
 *
 * @lore BC3 architecture.md §5 R4: the `work` half (Path 1, `legacyItemId`
 * -> `items.sourceAgentId`) is DELETED with the `items` table. Path 2
 * (`threads.initiatorId`) is the only attribution now.
 */

import { listMessages } from "@hyperidle/thread";
import type { HyperIdleDb } from "@hyperidle/db";
import { computeApprovalRate as policyComputeApprovalRate } from "@hyperidle/policy";

const approvalRateDeps = {
	conversation: {
		listInitiatedVerdictMessages: (db: HyperIdleDb, initiatorId: string, windowStart: string) =>
			listMessages(db, {
				threadInitiatorId: initiatorId,
				types: ["verdict"],
				since: windowStart,
			}),
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
