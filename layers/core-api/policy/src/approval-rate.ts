import type { HyperIdleDb } from "@hyperidle/db";
import type { PolicyDeps } from "./ports.js";

type ApprovalRateDeps = {
	conversation: Pick<PolicyDeps["conversation"], "listInitiatedVerdictMessages">;
};

export interface ApprovalRateResult {
	approvalRate: number;
	totalVerdicts: number;
	recentVerdicts: Array<{
		decision: string;
		threadId: string;
		createdAt: string;
	}>;
}

// Compute approval rate: attribution is by thread initiatorId; approval = "approve" or "approve-with-comments".
export async function computeApprovalRate(
	db: HyperIdleDb,
	agentId: string,
	windowDays: number,
	deps: ApprovalRateDeps,
	recentLimit = 10,
): Promise<ApprovalRateResult> {
	const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

	const allRows = await deps.conversation.listInitiatedVerdictMessages(db, agentId, windowStart);

	const totalVerdicts = allRows.length;

	if (totalVerdicts === 0) {
		return { approvalRate: 0, totalVerdicts: 0, recentVerdicts: [] };
	}

	// Compute approval rate
	let approvalCount = 0;
	for (const row of allRows) {
		const payload = JSON.parse(row.payload) as { decision: string };
		if (payload.decision === "approve" || payload.decision === "approve-with-comments") {
			approvalCount++;
		}
	}

	const approvalRate = approvalCount / totalVerdicts;

	// Sort by createdAt descending for recentVerdicts
	const sorted = [...allRows].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const recentVerdicts = sorted.slice(0, recentLimit).map((row) => {
		const payload = JSON.parse(row.payload) as { decision: string };
		return {
			decision: payload.decision,
			threadId: row.threadId,
			createdAt: row.createdAt,
		};
	});

	return { approvalRate, totalVerdicts, recentVerdicts };
}
