/**
 * §8 B4: `handoffDeps`/`buildProductionHandoff` are DELETED —
 * `handoff-protocol.ts` is gone (handoff is `edit_task({ ownerAgentId })`
 * now). What remains here is `computeApprovalRate`'s injected deps, which
 * never touched handoff at all.
 *
 * @lore AU19 Increment 2a: `@hyperidle/policy`'s `computeApprovalRate` needs
 * injected `work`/`conversation` ports (Mechanism C — `policy` never imports
 * another Service).
 */

import { listMessages } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { computeApprovalRate as policyComputeApprovalRate } from "@hyperidle/policy";
import * as taskDb from "@hyperidle/task";

const approvalRateDeps = {
	work: {
		listItemIdsBySourceAgent: async (exec: WriteExecutor, agentId: string) => {
			const rows = await taskDb.list(exec, "item", { sourceAgentId: agentId });
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
