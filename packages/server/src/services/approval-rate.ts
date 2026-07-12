/**
 * AD4 — Approval rate computation service.
 *
 * Computes the approval rate for an agent within a sliding time window,
 * using verdict messages attributed to the agent via two paths:
 *   1. messages.legacyItemId → items.sourceAgentId (policy-engine verdicts)
 *   2. messages.threadId → threads.initiatorId (human verdicts on agent threads)
 *
 * @lore AD4: This replaces the manually-assigned per-skill autonomy level (L1-L4)
 * as the trust signal for the policy engine. The approval rate is derived from
 * existing verdict messages, so no new data is required.
 *
 * @lore AD4: Path 2 excludes messages with a legacyItemId set to avoid double-
 * counting verdicts that would already match via Path 1. The condition
 * `AND m.legacy_item_id IS NULL` enforces this.
 */

import { type HyperIdleDb, items } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	listInitiatedVerdictMessages,
	listVerdictMessagesByItemIds,
} from "./conversation-store.js";

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
 * @param recentLimit - Max number of recent verdicts to return (default 10).
 */
export async function computeApprovalRate(
	db: HyperIdleDb,
	agentId: string,
	windowDays: number,
	recentLimit = 10,
): Promise<ApprovalRateResult> {
	const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

	// Path 1: verdict messages attributed via legacyItemId -> items.sourceAgentId.
	// Decomposed (AU12): resolve the agent's item ids from the Work-owned `items`
	// table here, then let conversation-store read the matching verdict messages —
	// keeps the owned `messages` read inside its store, no cross-owner join.
	const agentItemRows = await db
		.select({ id: items.id })
		.from(items)
		.where(eq(items.sourceAgentId, agentId));
	const agentItemIds = agentItemRows.map((r) => r.id);
	const path1Rows =
		agentItemIds.length > 0
			? await listVerdictMessagesByItemIds(db, agentItemIds, windowStart)
			: [];

	// Path 2: verdict messages attributed via threads.initiatorId (no legacyItemId to avoid double-count)
	const path2Rows = await listInitiatedVerdictMessages(db, agentId, windowStart);

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
