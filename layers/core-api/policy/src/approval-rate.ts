import type { HyperIdleDb } from "@hyperidle/db";
import type { PolicyDeps } from "./ports.js";

type ApprovalRateDeps = {
	work: Pick<PolicyDeps["work"], "listItemIdsBySourceAgent">;
	conversation: Pick<
		PolicyDeps["conversation"],
		"listInitiatedVerdictMessages" | "listVerdictMessagesByItemIds"
	>;
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

/**
 * Compute the approval rate for an agent within a sliding window.
 *
 * Attribution logic:
 * 1. Path 1: verdict messages with legacyItemId → items.sourceAgentId = agentId
 * 2. Path 2: verdict messages with no legacyItemId on threads where initiatorId = agentId
 *
 * Approval = decision is "approve" or "approve-with-comments".
 * Rate = approvals / total (0 when total = 0).
 *
 * @param db - The database connection.
 * @param agentId - The agent to compute the rate for.
 * @param windowDays - Number of days to look back (sliding window).
 * @param deps - Injected `work`/`conversation` ports (Mechanism C).
 * @param recentLimit - Max number of recent verdicts to return (default 10).
 */
export async function computeApprovalRate(
	db: HyperIdleDb,
	agentId: string,
	windowDays: number,
	deps: ApprovalRateDeps,
	recentLimit = 10,
): Promise<ApprovalRateResult> {
	const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

	// Path 1: verdict messages attributed via legacyItemId -> items.sourceAgentId.
	// Decomposed (AU12 + founder ruling 2026-07-12): the Work-owned `items` read
	// routes through work-service (Work owns `items`), then conversation-store
	// reads the matching verdict messages (Conversation owns `messages`) — no
	// cross-owner table read, no join.
	const agentItemIds = await deps.work.listItemIdsBySourceAgent(db, agentId);
	const path1Rows =
		agentItemIds.length > 0
			? await deps.conversation.listVerdictMessagesByItemIds(db, agentItemIds, windowStart)
			: [];

	// Path 2: verdict messages attributed via threads.initiatorId (no legacyItemId to avoid double-count)
	const path2Rows = await deps.conversation.listInitiatedVerdictMessages(db, agentId, windowStart);

	// Deduplicate by message id (union of both paths)
	const seenIds = new Set<string>();
	const allRows: Array<{ id: string; payload: string; threadId: string; createdAt: string }> = [];

	for (const row of [...path1Rows, ...path2Rows]) {
		if (!seenIds.has(row.id)) {
			seenIds.add(row.id);
			allRows.push(row);
		}
	}

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
