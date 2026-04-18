import { randomUUID } from "node:crypto";
import { type HyperIdleDb, items, threads } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent } from "@hyperidle/shared";

/** Stable marker recorded in `items.reasoning` for attention-engine reviews. */
export const ATTENTION_REVIEW_SOURCE = "attention_engine";

/** Input for creating a review `items` row tied to a knowledge item. */
export interface CreateReviewItemForKnowledgeInput {
	readonly knowledgeItemId: string;
	readonly layer: string;
	readonly title: string;
	readonly body: string;
	readonly riskTier: "low" | "medium" | "high";
	readonly attentionScore: number;
	/** Additional payload to merge into the reasoning JSON (source + knowledgeItemId are always set). */
	readonly reasoning: Readonly<Record<string, unknown>>;
	readonly nowMs: number;
}

export interface CreateReviewItemForKnowledgeResult {
	readonly itemId: string;
	readonly threadId: string;
}

/**
 * Build the stable marker the idempotency check in `attention-service.ts`
 * looks for on the `items.reasoning` column. Any review item created by the
 * attention engine embeds this substring so a duplicate recompute can skip
 * re-emitting the notification.
 *
 * @lore G2 idempotency: the `reasoning` column stores JSON. We use a
 * `LIKE %...%` search on the column instead of an FK because review items
 * already speak JSON for the `reasoning` blob and adding a new column for
 * a single consumer was judged heavier than the LIKE probe.
 */
export function attentionReviewReasoningMarker(knowledgeItemId: string): string {
	return `"source":"${ATTENTION_REVIEW_SOURCE}","knowledgeItemId":"${knowledgeItemId}"`;
}

/**
 * Create a `threads` row (kind=review), an `items` row (kind=knowledge,
 * verb=review) and emit `item_created`. Shared between the attention service
 * and any other server-side caller that needs to surface a knowledge item
 * for human review. The marker embedded in `reasoning` enables idempotent
 * reuse by the attention service.
 */
export function createReviewItemForKnowledge(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: CreateReviewItemForKnowledgeInput,
): CreateReviewItemForKnowledgeResult {
	const threadId = randomUUID();
	const isoNow = new Date(input.nowMs).toISOString();

	db.insert(threads)
		.values({
			id: threadId,
			kind: "review",
			createdAt: isoNow,
		})
		.run();

	const itemId = randomUUID();
	const reasoningBlob = {
		source: ATTENTION_REVIEW_SOURCE,
		knowledgeItemId: input.knowledgeItemId,
		...input.reasoning,
	};

	db.insert(items)
		.values({
			id: itemId,
			sourceAgentId: null,
			layer: input.layer,
			verb: "review",
			kind: "knowledge",
			title: input.title,
			body: input.body,
			proposedAction: null,
			options: null,
			riskTier: input.riskTier,
			attentionScore: input.attentionScore,
			blocking: 0,
			reasoning: JSON.stringify(reasoningBlob),
			costEstimate: null,
			threadId,
			createdAt: isoNow,
		})
		.run();

	const event: ItemCreatedEvent = {
		type: "item_created",
		streamId: randomUUID(),
		itemId,
		conversationId: threadId,
		kind: "knowledge",
		timestamp: input.nowMs,
	};
	eventBus.emit(event);

	return { itemId, threadId };
}
