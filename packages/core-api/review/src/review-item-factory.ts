import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent } from "@hyperidle/shared";
import type { ReviewConversationStore, ReviewWorkStore } from "./ports.js";

/** Stable marker recorded in `items.reasoning` for attention-engine reviews. */
export const ATTENTION_REVIEW_SOURCE = "attention_engine";

/** Input for creating a review `items` row tied to a knowledge item. */
export interface CreateReviewItemForKnowledgeInput {
	readonly knowledgeItemId: string;
	/** @lore O2: layer comes from knowledgeAppProjection and may be null when no projection row exists. */
	readonly layer: string | null;
	readonly title: string;
	readonly body: string;
	readonly riskTier: "low" | "medium" | "high";
	/** @lore O2: attentionScore no longer stored as a column on items; embedded in reasoningBlob for traceability. */
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
 * Deps `createReviewItemForKnowledge` needs from `conversation`/`work`
 * (Mechanism C — `review` never imports another Service package directly).
 */
export interface ReviewItemFactoryDeps {
	readonly conversation: Pick<ReviewConversationStore, "insertThread">;
	readonly work: Pick<ReviewWorkStore, "createItem">;
}

/**
 * Build `createReviewItemForKnowledge` bound to the injected `conversation`/
 * `work` ports.
 *
 * @lore AU19 Increment 1j: the returned function's signature (`db, eventBus,
 * input`) is fixed by `@hyperidle/knowledge`'s `KnowledgeReviewWriter` port
 * (Increment 1a) — a factory that CURRIES the DI deps preserves that
 * external 3-arg shape while still achieving Mechanism C internally. Call
 * sites (`tools/score-attention.ts`, `services/builtin-routine-handlers.ts`,
 * still in `packages/server`) build the factory once with the real
 * `insertThread`/`createItem` function references, then pass the resulting
 * closure into `buildAttentionService`'s `review` dep unchanged.
 */
export function buildCreateReviewItemForKnowledge(
	deps: ReviewItemFactoryDeps,
): (
	db: HyperIdleDb,
	eventBus: EventBus,
	input: CreateReviewItemForKnowledgeInput,
) => Promise<CreateReviewItemForKnowledgeResult> {
	return async (db, eventBus, input) => {
		const threadId = randomUUID();
		const isoNow = new Date(input.nowMs).toISOString();

		// L1a: thread now carries host_kind/host_id; for knowledge-review the
		// host is the knowledge item being reviewed.
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
		// on knowledgeAppProjection instead. Embed attentionScore in reasoningBlob
		// for traceability rather than as a first-class column.
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
