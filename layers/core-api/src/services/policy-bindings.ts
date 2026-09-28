import type { HyperIdleDb } from "@hyperidle/db";
import { computeApprovalRate as policyComputeApprovalRate } from "@hyperidle/policy";
import { listMessages } from "@hyperidle/thread";

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
