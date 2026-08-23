import { randomUUID } from "node:crypto";
import type { HyperIdleDb, NewItem, NewThread } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent } from "@hyperidle/event-bus";

/**
 * Stable marker recorded in `items.reasoning` for attention-engine reviews.
 *
 * Moved from `@hyperidle/review` to `@hyperidle/knowledge` (AU44 batch 4 —
 * rows 9/10 MERGE). The LIKE-probe idempotency contract belongs to knowledge,
 * not review: both callers (`attention-service.ts` and the composition sites)
 * live in or alongside this package. Moving here kills the `KnowledgeReviewWriter`
 * DI port and the currying factory that existed only to satisfy its 3-arg shape.
 *
 * @lore G2 idempotency: the `reasoning` column stores JSON. We use a
 * `LIKE %...%` search instead of an FK because review items already speak JSON
 * for the `reasoning` blob and adding a new column for a single consumer was
 * judged heavier than the LIKE probe.
 */
const ATTENTION_REVIEW_SOURCE = "attention_engine";

/**
 * Build the stable marker the idempotency check in `attention-service.ts`
 * looks for on the `items.reasoning` column.
 */
export function attentionReviewReasoningMarker(knowledgeItemId: string): string {
	return `"source":"${ATTENTION_REVIEW_SOURCE}","knowledgeItemId":"${knowledgeItemId}"`;
}

/** Input for creating a review `items` row tied to a knowledge item. */
export interface CreateReviewItemInput {
	readonly knowledgeItemId: string;
	/** @lore O2: layer comes from knowledgeAppProjection and may be null when no projection row exists. */
	readonly layer: string | null;
	readonly title: string;
	readonly body: string;
	readonly riskTier: "low" | "medium" | "high";
	/** @lore O2: attentionScore no longer stored as a column on items; embedded in reasoningBlob. */
	readonly attentionScore: number;
	/** Additional payload to merge into the reasoning JSON. */
	readonly reasoning: Readonly<Record<string, unknown>>;
	readonly nowMs: number;
}

export interface CreateReviewItemResult {
	readonly itemId: string;
	readonly threadId: string;
}

/**
 * Minimal deps shape — only the two methods the factory body calls.
 * Both are cross-service calls (Mechanism C): knowledge cannot import
 * `@hyperidle/conversation` or `@hyperidle/work` directly.
 */
type CreateReviewItemDeps = {
	conversation: {
		insertThread(db: HyperIdleDb, values: NewThread): Promise<void>;
	};
	work: {
		createItem(db: HyperIdleDb, values: NewItem): Promise<void>;
	};
};

/**
 * Factory: build a `createReviewItemForKnowledge` function bound to the
 * injected `conversation`/`work` ports. The returned function's 3-arg shape
 * `(db, eventBus, input)` is what the composition sites at the core-api root
 * pass into `recomputeAttention`.
 *
 * @lore AU44 batch 4: moved from `@hyperidle/review`. The currying pattern
 * is retained for the external composition sites; `attention-service.ts` now
 * calls this directly from the same package (no more `KnowledgeReviewWriter`
 * DI port needed there).
 */
export function createReviewItem(
	deps: CreateReviewItemDeps,
): (
	db: HyperIdleDb,
	eventBus: EventBus,
	input: CreateReviewItemInput,
) => Promise<CreateReviewItemResult> {
	return async (db, eventBus, input) => {
		const threadId = randomUUID();
		const isoNow = new Date(input.nowMs).toISOString();

		await deps.conversation.insertThread(db, {
			id: threadId,
			hostKind: "knowledge_item",
			hostId: input.knowledgeItemId,
			initiatorId: ATTENTION_REVIEW_SOURCE,
			participants: JSON.stringify([ATTENTION_REVIEW_SOURCE]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		const itemId = randomUUID();
		const reasoningBlob = {
			source: ATTENTION_REVIEW_SOURCE,
			knowledgeItemId: input.knowledgeItemId,
			// @lore O2: attentionScore embedded here since it has no column on items
			attentionScore: input.attentionScore,
			...input.reasoning,
		};

		// @lore O2: attentionScore and costEstimate columns stripped from the items
		// kernel table. The riskTier remains on items; attentionScore is persisted
		// on knowledgeAppProjection instead.
		await deps.work.createItem(db, {
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
			blocking: false,
			reasoning: JSON.stringify(reasoningBlob),
			threadId,
			createdAt: isoNow,
		});

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
	};
}
